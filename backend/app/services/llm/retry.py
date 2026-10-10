"""Bounded transport backoff, independent of the single semantic repair."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import random
import time
from app.core.errors import AppError
from app.services.llm.diagnostics import remaining

MAX_BACKOFF_SECONDS = 30.0


def retry_after(value):
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            seconds = (date - datetime.now(timezone.utc)).total_seconds()
        except (ValueError, TypeError, OverflowError):
            return None
    import math
    return max(0.0, seconds) if math.isfinite(seconds) else None


def pause(attempt, error, retry_after_seconds=None):
    delay = 1.0 * 2**attempt + random.uniform(0, 0.5)
    if retry_after_seconds is not None:
        # Never retry earlier than requested. A long wait is a terminal retryable
        # failure, not permission to occupy a worker or bypass the job deadline.
        if retry_after_seconds > MAX_BACKOFF_SECONDS:
            raise error from None
        delay = max(delay, retry_after_seconds)
    delay = min(delay, MAX_BACKOFF_SECONDS)
    left = remaining()
    if left is not None and delay >= left:
        raise AppError('ANALYSIS_TIMEOUT', 'Kaynak analizi zaman aşımına uğradı.', 504, True)
    time.sleep(delay)
