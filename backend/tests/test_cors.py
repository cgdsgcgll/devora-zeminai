import pytest
from pydantic import ValidationError

from app.core.config import Settings


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


@pytest.mark.parametrize('origin', ['*', 'https://*.example.com', 'null',
    'https://user@example.com', 'https://example.com/path', 'https://example.com:99999'])
def test_cors_configuration_rejects_non_origin_values(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=[origin])


def test_explicit_deployment_origin_and_credentials(client):
    assert Settings(_env_file=None, cors_origins=['https://demo.example.com']).cors_origins == ['https://demo.example.com']
    response = client.options('/needs', headers={'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST'})
    assert response.headers['access-control-allow-credentials'] == 'true'
