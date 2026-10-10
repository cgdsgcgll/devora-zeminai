"""Session authentication and reusable role/ownership checks."""
import hashlib
import re
from urllib.parse import urlsplit
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models import domain as m
from app.schemas.domain import utcnow

def digest(token):
    return hashlib.sha256(token.encode('ascii')).hexdigest()

def session_record(request, db):
    token = request.cookies.get(settings.session_cookie_name, '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        return None
    return db.scalar(select(m.UserSession).where(
        m.UserSession.token_hash == digest(token),
        m.UserSession.revoked_at.is_(None), m.UserSession.expires_at > utcnow()))

def get_current_user(request: Request, db: Session = Depends(get_db)):
    session = session_record(request, db)
    user = db.get(m.User, session.user_id) if session else None
    if not user or not user.is_active:
        raise AppError('UNAUTHENTICATED', 'Oturum açmanız gerekiyor.', 401)
    return user

def require_candidate(user=Depends(get_current_user)):
    return require_role(user, 'candidate')

def require_institution(user=Depends(get_current_user)):
    return require_role(user, 'institution')

def require_role(user, role):
    if user.role != role:
        raise AppError('FORBIDDEN', 'Bu işlem için yetkiniz yok.', 403)
    return user

def owned(db, model, record_id, user):
    record = db.get(model, record_id)
    if record is None or record.owner_user_id != user.id:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    return record

def candidate_record(db, candidate_id, user):
    require_role(user, 'candidate')
    return owned(db, m.Candidate, candidate_id, user)

def project_record(db, project_id, user):
    require_role(user, 'candidate')
    project = db.get(m.Project, project_id)
    if project is None or project.archived_at is not None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    candidate_record(db, project.candidate_id, user)
    return project

def need_record(db, need_id, user):
    require_role(user, 'institution')
    return owned(db, m.OrganizationNeed, need_id, user)

def match_record(db, match_id, user):
    require_role(user, 'institution')
    match = db.get(m.MatchResult, match_id)
    if match is None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    need_record(db, match.need_id, user)
    return match

def discoverable(db, candidate_id):
    candidate = db.scalar(select(m.Candidate).join(m.User, m.Candidate.owner_user_id == m.User.id)
        .where(m.Candidate.id == candidate_id, m.User.is_active.is_(True), m.User.role == 'candidate'))
    if candidate is None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    return candidate

def check_origin(request: Request):
    if request.method in {'GET', 'HEAD', 'OPTIONS'}:
        return
    origin = request.headers.get('origin')
    if origin is None:
        referer = request.headers.get('referer', '')
        try:
            parsed = urlsplit(referer)
        except ValueError:
            raise AppError('CSRF_ORIGIN_REJECTED', 'İstek kaynağına izin verilmiyor.', 403)
        origin = f'{parsed.scheme}://{parsed.netloc}' if parsed.scheme and parsed.netloc else ''
    if origin not in settings.cors_origins:
        raise AppError('CSRF_ORIGIN_REJECTED', 'İstek kaynağına izin verilmiyor.', 403)
