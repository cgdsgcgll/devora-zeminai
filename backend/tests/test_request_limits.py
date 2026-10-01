import asyncio
import json

import pytest

from app.core.request_limits import MAX_REQUEST_BYTES, RequestSizeLimitMiddleware


def test_oversized_body_returns_safe_envelope_with_cors(client):
    response = client.post('/candidates', content=b'x' * (MAX_REQUEST_BYTES + 1),
                           headers={'Origin': 'http://localhost:3000',
                                    'Content-Type': 'application/json'})
    assert response.status_code == 413
    assert response.headers['access-control-allow-origin'] == 'http://localhost:3000'
    assert response.json()['error']['code'] == 'PAYLOAD_TOO_LARGE'
    assert response.json()['error']['retryable'] is False


@pytest.mark.parametrize('headers', [[], [(b'content-length', b'1')]])
def test_streamed_body_cannot_bypass_limit(headers):
    messages = iter([
        {'type': 'http.request', 'body': b'12345', 'more_body': True},
        {'type': 'http.request', 'body': b'678901', 'more_body': True},
    ])
    sent = []

    async def receive():
        return next(messages)

    async def send(message):
        sent.append(message)

    async def downstream(*args):
        pytest.fail('Oversized body reached the application')

    asyncio.run(RequestSizeLimitMiddleware(downstream, max_bytes=10)(
        {'type': 'http', 'headers': headers}, receive, send))
    assert sent[0]['status'] == 413
    assert json.loads(sent[1]['body'])['error']['code'] == 'PAYLOAD_TOO_LARGE'


def test_body_exactly_at_limit_is_replayed_unchanged():
    messages = iter([
        {'type': 'http.request', 'body': b'12345', 'more_body': True},
        {'type': 'http.request', 'body': b'67890', 'more_body': False},
    ])

    async def receive():
        return next(messages)

    async def send(message):
        pytest.fail('Middleware should not respond to an allowed body')

    async def downstream(scope, receive, send):
        assert await receive() == {'type': 'http.request', 'body': b'1234567890', 'more_body': False}

    asyncio.run(RequestSizeLimitMiddleware(downstream, max_bytes=10)(
        {'type': 'http', 'headers': []}, receive, send))


def test_disconnect_does_not_dispatch_partial_body():
    async def receive():
        return {'type': 'http.disconnect'}

    async def downstream(*args):
        pytest.fail('Disconnected request reached the application')

    asyncio.run(RequestSizeLimitMiddleware(downstream)(
        {'type': 'http', 'headers': []}, receive, downstream))


def test_unicode_candidate_remains_supported(client):
    name = 'Çağdaş — İpek 🌱'
    response = client.post('/candidates', json={'name': name})
    assert response.status_code == 201
    assert response.json()['name'] == name


@pytest.mark.parametrize('name', ['', ' \t\n', 'a' * 201])
def test_invalid_candidate_name_does_not_echo_input(client, name):
    response = client.post('/candidates', json={'name': name})
    assert response.status_code == 422
    assert all('input' not in issue for issue in response.json()['error']['details']['issues'])
