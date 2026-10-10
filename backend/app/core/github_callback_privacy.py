"""Remove OAuth query material before server access logging; retain only for callback."""
from starlette.datastructures import MutableHeaders


class GitHubCallbackPrivacy:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        callback = scope['type'] == 'http' and scope.get('path') == '/github/callback'
        if callback:
            scope['github_callback_query'] = scope.get('query_string', b'')
            scope['query_string'] = b''
        async def private_send(message):
            if callback and message['type'] == 'http.response.start':
                MutableHeaders(scope=message)['Referrer-Policy'] = 'no-referrer'
            await send(message)
        await self.app(scope, receive, private_send)
