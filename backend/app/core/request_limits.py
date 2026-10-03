from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import AppError

MAX_REQUEST_BYTES = 1_048_576


class RequestSizeLimitMiddleware:
    """Bound HTTP bodies before JSON parsing, including chunked requests.

    This bounds per-request buffering; concurrency and slow clients still need
    ingress timeouts, rate limits and quotas before public deployment.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_REQUEST_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return

        async def reject():
            error = AppError('PAYLOAD_TOO_LARGE', 'İstek gövdesi 1 MiB sınırını aşıyor.', 413)
            await JSONResponse(error.body(), status_code=413)(scope, receive, send)

        for name, value in scope.get('headers', []):
            if name.lower() == b'content-length':
                try:
                    if int(value) > self.max_bytes:
                        await reject()
                        return
                except ValueError:
                    pass  # Actual bytes are always counted; never trust the header.

        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            chunk = message.get('body', b'')
            if len(body) + len(chunk) > self.max_bytes:
                await reject()
                return
            body.extend(chunk)
            if not message.get('more_body', False):
                break

        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()

        await self.app(scope, replay, send)
