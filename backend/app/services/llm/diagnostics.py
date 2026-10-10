"""Allowlisted analysis metadata only; never log inputs, exception text or bodies."""
from contextvars import ContextVar
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
import re
from app.core.errors import AppError
from app.core.observability import request_id

context = ContextVar('analysis_diagnostics', default={})
logger = logging.getLogger('zeminai.analysis')
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)


@contextmanager
def analysis_context(job):
    token = context.set({'analysis_job_id': str(job.id), 'project_id': str(job.project_id),
                         'deadline': job.deadline})
    try:
        yield
    finally:
        context.reset(token)


def remaining():
    deadline = context.get().get('deadline')
    if deadline is None:
        return None
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    seconds = (deadline - datetime.now(timezone.utc)).total_seconds()
    if seconds <= 0:
        raise AppError('ANALYSIS_TIMEOUT', 'Kaynak analizi zaman aşımına uğradı.', 504, True)
    return seconds


def event(stage, *, provider=None, model=None, attempt=None, duration_ms=None,
          error=None, file_count=None, material_bytes=None):
    data = {k: v for k, v in context.get().items() if k != 'deadline'}
    data.update(event='analysis_stage', request_id=request_id.get(), stage=stage)
    # Provider/model are configuration identifiers, never arbitrary exception messages.
    for key, value in {'provider': provider, 'model': model}.items():
        if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9._/-]{1,100}', value):
            data[key] = value
    for key, value in {'attempt': attempt, 'duration_ms': duration_ms,
                       'file_count': file_count, 'material_bytes': material_bytes}.items():
        if isinstance(value, (int, float)):
            data[key] = round(value, 2)
    if error:
        data.update(error_code=error.code, retryable=error.retryable)
        status = error.details.get('upstream_status')
        if isinstance(status, int) and 100 <= status <= 599:
            data['provider_http_status'] = status
    logger.info(json.dumps(data))


def http_error(status):
    if status in (401, 403):
        code, retryable = 'LLM_CONFIGURATION_ERROR', False
    elif status == 429:
        code, retryable = 'LLM_RATE_LIMITED', True
    elif status == 408:
        code, retryable = 'LLM_TIMEOUT', True
    elif 500 <= status <= 599:
        code, retryable = 'LLM_UNAVAILABLE', True
    else:
        code, retryable = 'LLM_REQUEST_REJECTED', False
    return AppError(code, 'Analiz sağlayıcısı isteği tamamlayamadı.', 502, retryable,
                    {'upstream_status': status})
