"""Atomic fixed-window budgets. Denials and provider failures consume attempts."""
import hashlib
import hmac
import math
from datetime import datetime, timezone
from sqlalchemy import delete, case
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from app.core.config import settings
from app.core.errors import AppError
from app.models.domain import RateBucket
from app.schemas.domain import utcnow


def consume(request, db, user, policy):
    if policy not in {'ai', 'compute'}:
        raise ValueError('Unknown budget policy')
    seconds = getattr(settings, f'{policy}_window_seconds')
    now = utcnow()
    window = int(now.timestamp()) // seconds
    retry_after = max(1, math.ceil((window + 1) * seconds - now.timestamp()))
    expiry = datetime.fromtimestamp((window + 2) * seconds, timezone.utc)
    peer = request.client.host if request.client else 'unknown'
    insert = pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert
    try:
        db.execute(delete(RateBucket).where(RateBucket.expires_at <= now))
        for scope, identity in [('ip', peer), ('user', str(user.id))]:
            limit = getattr(settings, f'{policy}_{scope}_attempts')
            key = hmac.new(settings.rate_limit_key.encode(),
                f'{policy}:{scope}:{identity}:{window}'.encode(), hashlib.sha256).hexdigest()
            statement = insert(RateBucket).values(key=key, attempts=1, expires_at=expiry)
            count = db.scalar(statement.on_conflict_do_update(index_elements=['key'],
                set_={'attempts': case((RateBucket.attempts <= limit, RateBucket.attempts + 1),
                                      else_=RateBucket.attempts)}).returning(RateBucket.attempts))
            if count > limit:
                db.commit()
                message = ('Analiz sınırına ulaştınız. Bir süre sonra tekrar deneyebilirsiniz.' if policy == 'ai'
                           else 'İşlem sınırına ulaştınız. Bir süre sonra tekrar deneyebilirsiniz.')
                raise AppError('ANALYSIS_RATE_LIMITED' if policy == 'ai' else 'OPERATION_RATE_LIMITED',
                    message, 429, True, {'retry_after_seconds': retry_after},
                    headers={'Retry-After': str(retry_after)})
        # Called after ownership checks, before any workflow writes/network I/O.
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise AppError('RATE_LIMIT_UNAVAILABLE', 'İşlem şu anda başlatılamıyor. Daha sonra tekrar deneyin.',
                       503, True) from exc
