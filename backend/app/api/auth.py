import secrets
from datetime import timedelta
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.auth import check_origin, digest, get_current_user, session_record
from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models import domain as m
from app.schemas import auth as s
from app.schemas.domain import utcnow
from app.schemas.domain import ErrorResponse
from app.core.auth_throttle import throttle

router = APIRouter(prefix='/auth', dependencies=[Depends(check_origin)],
    responses={status: {'model': ErrorResponse} for status in (401,403,409,422,429,503)})
hasher = PasswordHasher()
dummy_hash = hasher.hash(secrets.token_urlsafe(32))

def state(db, user):
    candidate = db.scalar(select(m.Candidate).where(m.Candidate.owner_user_id == user.id))
    return s.AuthState(user=s.Account.model_validate(user), candidate=candidate)

def start_session(request, response, db, user):
    old = session_record(request, db)
    if old:
        old.revoked_at = utcnow()
    token = secrets.token_urlsafe(32)
    db.add(m.UserSession(user_id=user.id, token_hash=digest(token),
        expires_at=utcnow() + timedelta(seconds=settings.session_ttl)))
    db.commit()
    response.set_cookie(settings.session_cookie_name, token,
        max_age=settings.session_ttl, httponly=True, secure=settings.session_cookie_secure,
        samesite='lax', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return state(db, user)

@router.post('/register', response_model=s.AuthState, status_code=201)
def register(data: s.Register, request: Request, response: Response, db: Session = Depends(get_db)):
    throttle(request, db, data.email)
    normalized = data.email.casefold()
    if db.scalar(select(m.User.id).where(m.User.normalized_email == normalized)):
        raise AppError('ACCOUNT_CONFLICT', 'Bu e-posta ile kayıt oluşturulamıyor.', 409)
    user = m.User(email=data.email, normalized_email=normalized,
        password_hash=hasher.hash(data.password), role=data.role, display_name=data.display_name)
    db.add(user)
    try:
        db.flush()
        if user.role == 'candidate':
            db.add(m.Candidate(name=user.display_name, owner_user_id=user.id))
        return start_session(request, response, db, user)
    except IntegrityError as exc:
        db.rollback()
        raise AppError('ACCOUNT_CONFLICT', 'Bu e-posta ile kayıt oluşturulamıyor.', 409) from exc

@router.post('/login', response_model=s.AuthState)
def login(data: s.Login, request: Request, response: Response, db: Session = Depends(get_db)):
    throttle(request, db, data.email)
    user = db.scalar(select(m.User).where(m.User.normalized_email == data.email.casefold()))
    try:
        valid = hasher.verify(user.password_hash if user else dummy_hash, data.password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not valid or not user or not user.is_active:
        raise AppError('INVALID_CREDENTIALS', 'E-posta veya parola hatalı.', 401)
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(data.password)
    return start_session(request, response, db, user)

@router.get('/me', response_model=s.AuthState)
def me(response: Response, user=Depends(get_current_user), db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    return state(db, user)

@router.post('/logout', status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    session = session_record(request, db)
    if session:
        session.revoked_at = utcnow()
        db.commit()
    response.delete_cookie(settings.session_cookie_name, path='/',
        httponly=True, secure=settings.session_cookie_secure, samesite='lax')
    response.headers['Cache-Control'] = 'no-store'
