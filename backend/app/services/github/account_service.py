"""OAuth state and encrypted credentials. Provenance never changes evidence."""
import base64
import hashlib
import re
import secrets
from datetime import timedelta, timezone
from urllib.parse import urlencode, urlsplit
from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.core.errors import AppError
from app.core.auth import digest
from app.models import domain as m
from app.models.github_account import GitHubConnection, GitHubOAuthState, GitHubRepositoryLink
from app.schemas.domain import utcnow


def installation_url():
    # Public metadata only: never accept a destination or redirect from the client.
    slug = settings.github_app_slug
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or len(slug) > 100:
        raise AppError('GITHUB_APP_NOT_CONFIGURED', 'GitHub App yapılandırması kullanılamıyor.', 503)
    return f'https://github.com/apps/{slug}/installations/new'


def as_utc(value):
    """SQLite returns naive UTC; PostgreSQL may return any session time zone."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def cipher():
    # Lazy import keeps the unrelated public GitHub flow usable when unconfigured.
    try:
        from cryptography.fernet import Fernet
        return Fernet(settings.github_app_encryption_key.encode('ascii'))
    except (ImportError, ValueError, UnicodeError):
        raise AppError('GITHUB_APP_NOT_CONFIGURED', 'GitHub App yapılandırması kullanılamıyor.', 503) from None


def configured():
    try:
        target = urlsplit(settings.github_app_callback_url)
        safe = (target.path in ('/github/callback', '/api/github/callback') and
                target.hostname in settings.trusted_hosts and not target.username and not target.password and
                not target.query and not target.fragment and
                (target.scheme == 'https' or settings.environment != 'production' and
                 target.scheme == 'http' and target.hostname in ('localhost', '127.0.0.1')))
        if not safe or not settings.github_app_client_id or not settings.github_app_client_secret:
            raise ValueError()
        _ = target.port
    except ValueError:
        raise AppError('GITHUB_APP_NOT_CONFIGURED', 'GitHub App yapılandırması kullanılamıyor.', 503) from None
    return cipher()


def decrypt(value):
    try:
        return cipher().decrypt((value or '').encode('ascii')).decode('ascii')
    except AppError:
        raise
    except Exception:
        raise AppError('GITHUB_CONNECTION_REVOKED', 'GitHub bağlantısını yeniden kurun.', 409) from None


def revoke(db, row):
    now = utcnow()
    row.revoked_at = now
    row.access_ciphertext = row.refresh_ciphertext = None
    db.execute(update(GitHubRepositoryLink).where(GitHubRepositoryLink.connection_id == row.id)
               .values(revoked_at=now))


def start(db, candidate, session):
    enc = configured()
    now = utcnow()
    # One pending flow per candidate; restarting also erases previous verifier material.
    db.execute(delete(GitHubOAuthState).where(GitHubOAuthState.candidate_id == candidate.id))
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('ascii')).digest()).rstrip(b'=').decode()
    db.add(GitHubOAuthState(candidate_id=candidate.id, session_id=session.id,
        state_hash=digest(state), verifier_ciphertext=enc.encrypt(verifier.encode()).decode(),
        expires_at=now+timedelta(minutes=5)))
    db.commit()
    return {'authorization_url': 'https://github.com/login/oauth/authorize?' + urlencode({
        'client_id':settings.github_app_client_id, 'redirect_uri':settings.github_app_callback_url,
        'state':state, 'code_challenge':challenge, 'code_challenge_method':'S256'})}


def callback(db, candidate, session, state, code, provider):
    configured()
    if not isinstance(state, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', state):
        raise AppError('GITHUB_OAUTH_STATE_INVALID', 'GitHub bağlantı isteği geçersiz.', 400)
    row = db.scalar(select(GitHubOAuthState).where(GitHubOAuthState.state_hash == digest(state),
        GitHubOAuthState.candidate_id == candidate.id, GitHubOAuthState.session_id == session.id))
    if not row or row.used_at:
        raise AppError('GITHUB_OAUTH_STATE_INVALID', 'GitHub bağlantı isteği geçersiz.', 400)
    now = utcnow()
    if as_utc(row.expires_at) <= now:
        raise AppError('GITHUB_OAUTH_STATE_EXPIRED', 'GitHub bağlantı isteğinin süresi doldu.', 400)
    encrypted = row.verifier_ciphertext
    transaction_id = row.id
    consumed = db.execute(update(GitHubOAuthState).where(GitHubOAuthState.id == row.id,
        GitHubOAuthState.used_at.is_(None), GitHubOAuthState.expires_at > now)
        .values(used_at=now, verifier_ciphertext=None).execution_options(synchronize_session=False))
    db.commit()  # A failed provider exchange cannot replay this state.
    if consumed.rowcount != 1:
        raise AppError('GITHUB_OAUTH_STATE_INVALID', 'GitHub bağlantı isteği geçersiz.', 400)
    if not isinstance(code, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', code):
        raise AppError('GITHUB_OAUTH_CODE_INVALID', 'GitHub yetkilendirmesi tamamlanmadı.', 400)
    credentials = provider.exchange(settings, code=code, redirect_uri=settings.github_app_callback_url,
                                    code_verifier=decrypt(encrypted))
    identity, login = provider.user(credentials[0])
    # Serialize candidate reconnect/disconnect; unique indexes arbitrate different candidates.
    db.scalar(select(m.Candidate).where(m.Candidate.id == candidate.id).with_for_update())
    still_valid = db.scalar(select(GitHubOAuthState.id).join(m.UserSession,
        GitHubOAuthState.session_id == m.UserSession.id).join(m.User, m.User.id == m.UserSession.user_id)
        .where(GitHubOAuthState.id == transaction_id, m.User.is_active.is_(True),
        m.UserSession.revoked_at.is_(None), m.UserSession.expires_at > utcnow()))
    if not still_valid:
        raise AppError('GITHUB_OAUTH_STATE_INVALID', 'GitHub bağlantı isteği geçersiz.', 400)
    row = db.scalar(select(GitHubConnection).where(GitHubConnection.candidate_id == candidate.id,
                                                 GitHubConnection.revoked_at.is_(None)))
    if row and row.github_user_id != identity:
        revoke(db, row)
        db.flush()
        row = None
    if row is None:
        row = GitHubConnection(candidate_id=candidate.id, github_user_id=identity, github_login=login)
        db.add(row)
    row.github_login = login
    save_tokens(row, credentials)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError('GITHUB_IDENTITY_ALREADY_LINKED', 'GitHub kimliği başka bir hesaba bağlı.', 409) from None
    return row


def save_tokens(row, credentials):
    access, refresh, exp, rexp = credentials
    enc, now = cipher(), utcnow()
    row.access_ciphertext = enc.encrypt(access.encode()).decode()
    row.refresh_ciphertext = enc.encrypt(refresh.encode()).decode() if refresh else None
    row.access_expires_at = now+timedelta(seconds=exp) if exp else None
    row.refresh_expires_at = now+timedelta(seconds=rexp) if rexp else None


def active(db, candidate):
    row = db.scalar(select(GitHubConnection).where(GitHubConnection.candidate_id == candidate.id,
        GitHubConnection.revoked_at.is_(None)).with_for_update())
    if not row:
        raise AppError('GITHUB_CONNECTION_REQUIRED', 'Önce GitHub hesabınızı bağlayın.', 409)
    return row


def with_token(db, row, provider, operation):
    configured()
    try:
        if row.access_expires_at and as_utc(row.access_expires_at) <= utcnow()+timedelta(seconds=30):
            if not row.refresh_expires_at or as_utc(row.refresh_expires_at) <= utcnow():
                raise AppError('GITHUB_CONNECTION_REVOKED', 'GitHub bağlantısını yeniden kurun.', 409)
            # Row locked by active(): only one worker rotates an expiring refresh token.
            try:
                credentials = provider.exchange(settings, grant_type='refresh_token',
                    refresh_token=decrypt(row.refresh_ciphertext))
                if provider.user(credentials[0])[0] != row.github_user_id:
                    raise ValueError()
                save_tokens(row, credentials)
                # Rotated credentials must survive even if the following metadata call fails.
                db.commit()
                db.refresh(row, with_for_update=True)
                if row.revoked_at:
                    raise ValueError()
            except (AppError, ValueError):
                raise AppError('GITHUB_CONNECTION_REVOKED', 'GitHub bağlantısını yeniden kurun.', 409) from None
        return operation(decrypt(row.access_ciphertext))
    except AppError as exc:
        if exc.code == 'GITHUB_CONNECTION_REVOKED':
            revoke(db, row)
            db.commit()
        raise
