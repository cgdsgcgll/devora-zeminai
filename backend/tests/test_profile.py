from uuid import uuid4

import pytest


def candidate(client):
    return client.post('/candidates', json={'name': 'Profile demo'}).json()['id']


@pytest.mark.parametrize('category', ['education', 'certification', 'hackathon', 'event', 'community'])
def test_profile_crud_and_honest_status(client, category):
    cid = candidate(client)
    path = f'/candidates/{cid}/profile-evidence'
    response = client.post(path, json={'category': category, 'title': 'Example', 'description': '<script>alert(1)</script>'})
    assert response.status_code == 201
    item = response.json()
    assert item['verification_status'] == 'declared_only'
    assert client.get(path).json()[0]['id'] == item['id']
    detail = '/profile-evidence/' + item['id']
    assert client.get(detail).status_code == 200
    linked = client.patch(detail, json={'source_url': 'https://example.org/evidence'}).json()
    assert linked['verification_status'] == 'linked'
    assert linked['description'] == '<script>alert(1)</script>'
    assert client.patch(detail, json={'source_url': None}).json()['verification_status'] == 'declared_only'
    assert client.delete(detail).status_code == 204
    assert client.get(detail).status_code == 404
    assert client.get(path).json() == []


@pytest.mark.parametrize('url', ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd',
    'vbscript:msgbox(1)', 'http://example.org', 'https://user:secret@example.org',
    'https://127.0.0.1', 'https://localhost', 'https://example.org:8080', 'https://example.org\\@evil.org'])
def test_profile_unsafe_urls(client, url):
    assert client.post(f'/candidates/{candidate(client)}/profile-evidence', json={
        'category': 'hackathon', 'title': 'Demo', 'source_url': url}).status_code == 422


@pytest.mark.parametrize('extra', [{'verification_status': 'verified'}, {'candidate_id': str(uuid4())},
    {'metadata_json': {'gpa': 4}}, {'metadata_json': {'participation_type': 'genius'}},
    {'metadata_json': {'student_year': 3}}, {'title': 'x'*201}])
def test_mass_assignment_bounds_and_category_metadata(client, extra):
    response = client.post(f'/candidates/{candidate(client)}/profile-evidence', json={
        'category': 'hackathon', 'title': 'Demo', **extra})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'


def test_patch_validates_merged_dates_and_required_values(client):
    row = client.post(f'/candidates/{candidate(client)}/profile-evidence', json={
        'category': 'education', 'title': 'Program', 'started_at': '2025-01-01'}).json()
    path = '/profile-evidence/' + row['id']
    for body in [{'ended_at': '2024-01-01'}, {'title': None}, {'verification_status': 'verified'}, {'category': 'event'}]:
        assert client.patch(path, json=body).status_code == 422
    assert client.get(path).json()['title'] == 'Program'


def test_unknown_candidate_and_cors(client):
    assert client.get(f'/candidates/{uuid4()}/profile-evidence').status_code == 404
    for method in ['PATCH', 'DELETE']:
        response = client.options('/profile-evidence/' + str(uuid4()), headers={
            'Origin': 'http://localhost:3000', 'Access-Control-Request-Method': method})
        assert response.status_code == 200


def test_sql_and_html_are_data_and_cannot_change_other_candidates(client):
    first, second = candidate(client), candidate(client)
    payload = {'category':'event','title':"'; DROP TABLE candidates; --", 'description':'<script>alert(1)</script>',
        'metadata_json':{'participation_type':'volunteer','responsibility':'Registration desk'}}
    response = client.post(f'/candidates/{first}/profile-evidence', json=payload)
    assert response.status_code == 201
    assert response.json()['title'] == payload['title']
    assert response.json()['metadata_json']['responsibility'] == 'Registration desk'
    assert client.get(f'/candidates/{second}').status_code == 200
    assert client.get(f'/candidates/{second}/profile-evidence').json() == []
