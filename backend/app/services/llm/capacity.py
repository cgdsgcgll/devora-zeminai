"""Single-process capacity; acquire before job claim so excess jobs stay queued."""
from contextlib import contextmanager
from functools import wraps
from threading import BoundedSemaphore, local
from app.core.config import settings
from app.services.llm.diagnostics import remaining


class Capacity:
    def __init__(self, limit):
        self.semaphore = BoundedSemaphore(limit)
        self.local = local()

    @contextmanager
    def slot(self, stop=None):
        if getattr(self.local, 'held', False):
            yield True
            return
        acquired = False
        try:
            while stop is None or not stop.is_set():
                left = remaining()
                # Blocking semaphore wait, not a spin/poll for database claims.
                acquired = self.semaphore.acquire(timeout=min(1, left) if left is not None else 1)
                if acquired:
                    self.local.held = True
                    break
            yield acquired
        finally:
            if acquired:
                self.local.held = False
                self.semaphore.release()


capacity = Capacity(settings.analysis_provider_max_concurrency)


def provider_slot(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        with capacity.slot():
            return fn(*args, **kwargs)
    return wrapped
