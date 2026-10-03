"""Database-backed atomic attempt budgets shared by API workers."""
import hashlib
from datetime import timedelta
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.core.config import settings
from app.core.errors import AppError
from app.models.domain import AuthThrottle
from app.schemas.domain import utcnow

def throttle(request, db, email):
    now=utcnow()
    window=int(now.timestamp()) // settings.auth_window_seconds
    # Never trust caller-supplied forwarded headers. Configure trusted proxy peers
    # at the ASGI server; direct peer limiting is conservative behind a proxy.
    peer=request.client.host if request.client else 'unknown'
    db.execute(delete(AuthThrottle).where(AuthThrottle.expires_at < now))
    insert=pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert
    exceeded=False
    for scope,value,limit in [('ip',peer,settings.auth_ip_attempts),
                              ('email',email.casefold(),settings.auth_email_attempts)]:
        key=hashlib.sha256(f'{scope}:{value}:{window}'.encode()).hexdigest()
        statement=insert(AuthThrottle).values(key=key,attempts=1,expires_at=now+timedelta(seconds=settings.auth_window_seconds*2))
        count=db.scalar(statement.on_conflict_do_update(index_elements=['key'],
            set_={'attempts':AuthThrottle.attempts+1}).returning(AuthThrottle.attempts))
        exceeded |= count>limit
    db.commit()
    if exceeded:
        raise AppError('AUTH_RATE_LIMITED','Çok fazla deneme. Bir süre sonra tekrar deneyin.',429,True)
