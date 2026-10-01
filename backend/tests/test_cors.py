import pytest


@pytest.mark.parametrize('origin', ['http://localhost:3000', 'http://127.0.0.1:3000'])
def test_allowed_frontend_preflight(client, origin):
    response = client.options('/needs', headers={'Origin': origin,
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == origin


def test_unlisted_origin_rejected(client):
    response = client.options('/needs', headers={'Origin': 'https://untrusted.example',
        'Access-Control-Request-Method': 'POST'})
    assert response.status_code == 400
    assert 'access-control-allow-origin' not in response.headers


def test_error_response_has_cors_header(client):
    response = client.post('/candidates', json={'name': ''}, headers={'Origin': 'http://localhost:3000'})
    assert response.status_code == 422
    assert response.headers['access-control-allow-origin'] == 'http://localhost:3000'
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'
