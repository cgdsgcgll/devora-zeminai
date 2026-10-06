"""Safe metadata-only request logs; no bodies, raw URLs or inbound identifiers."""
import json
import logging
import time
import traceback
from contextvars import ContextVar
from pathlib import Path
from uuid import uuid4
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from app.core.errors import AppError

request_id = ContextVar('request_id', default='outside-request')
logger = logging.getLogger('zeminai.requests')
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(handler)
logger.propagate = False


def error_event(exc):
    logger.error(json.dumps({'event':'backend_error', 'request_id':request_id.get(),
        'exception':type(exc).__name__,
        'frames':[{'file':Path(f.filename).name,'line':f.lineno,'function':f.name}
                  for f in traceback.extract_tb(exc.__traceback__)]}))


class RequestTelemetry:
    def __init__(self, app, config):
        self.app, self.config = app, config

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        rid = uuid4().hex
        token = request_id.set(rid)
        start = time.perf_counter()
        status, started = 500, False
        async def traced_send(message):
            nonlocal status, started
            if message['type'] == 'http.response.start':
                status, started = message['status'], True
                headers = MutableHeaders(scope=message)
                headers['X-Request-ID'] = rid
                headers['Cache-Control'] = 'no-store'
                headers['X-Content-Type-Options'] = 'nosniff'
                headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
                headers['X-Frame-Options'] = 'DENY'
                headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
                if self.config.environment == 'production':
                    headers['Strict-Transport-Security'] = 'max-age=31536000'
            await send(message)
        try:
            hosts = Headers(scope=scope).getlist('host')
            host = hosts[0] if len(hosts) == 1 else ''
            name, sep, port = host.partition(':')
            valid = (name.lower() in self.config.trusted_hosts and
                     (not sep or port.isdigit() and 0 < int(port) <= 65535))
            if not valid:
                await JSONResponse(AppError('INVALID_HOST', 'İstek adresine izin verilmiyor.', 400).body(),
                    status_code=400)(scope, receive, traced_send)
            else:
                await self.app(scope, receive, traced_send)
        except Exception as exc:
            error_event(exc)
            if not started:
                await JSONResponse(AppError('INTERNAL_ERROR', 'İşlem tamamlanamadı.', 500).body(),
                    status_code=500)(scope, receive, traced_send)
            else:
                raise
        finally:
            route = scope.get('route')
            logger.info(json.dumps({'event':'request', 'request_id':rid,
                'method':scope.get('method'), 'route':getattr(route, 'path', '<unmatched>'),
                'status':status, 'duration_ms':round((time.perf_counter()-start)*1000, 2)}))
            request_id.reset(token)
