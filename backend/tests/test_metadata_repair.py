from uuid import UUID
from sqlalchemy import select
import pytest
from app.api.routes import get_github
from app.main import app
from app.models import domain as m
from app.services.analysis.maintenance import invalidate_metadata_only_analysis
from app.services.github.provider import GitHubProvider
from app.services.matching.material import load_material
from test_api import create_entities
from test_github import mock_transport


def test_metadata_repair_preserves_frozen_match_and_evidence(client, db):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    cid, pid, nid = create_entities(client)
    response = client.post(f'/projects/{pid}/analyze')
    assert response.status_code == 201
    run_id = UUID(response.json()['run']['id'])
    frozen = client.post('/matches', json={'candidate_id': cid, 'need_id': nid}).json()
    # Simulate the legacy bug after recording a frozen historical match.
    rows = db.scalars(select(m.SkillEvidence).where(m.SkillEvidence.analysis_run_id == run_id)).all()
    for row in rows:
        if row.evidence_status == 'observed':
            row.evidence_type = 'repository_language'
            row.path = None
    db.commit()
    evidence_before = [client.get('/evidence/' + str(row.id)).json() for row in rows]
    invalidate_metadata_only_analysis(db, UUID(pid), run_id)
    db.commit()
    assert not load_material(db, [UUID(cid)])[UUID(cid)].evidence
    assert client.get('/matches/' + frozen['id']).json() == frozen
    assert [client.get('/evidence/' + str(row.id)).json() for row in rows] == evidence_before
    assert db.get(m.AnalysisRun, run_id).status == 'failed'
    with pytest.raises(ValueError):
        invalidate_metadata_only_analysis(db, UUID(pid), run_id)
    # New source analysis restores current evidence without touching the old rows.
    assert client.post(f'/projects/{pid}/analyze').status_code == 201
    assert load_material(db, [UUID(cid)])[UUID(cid)].evidence
    assert client.get('/matches/' + frozen['id']).json() == frozen


def test_metadata_repair_refuses_valid_source_analysis(client, db):
    app.dependency_overrides[get_github] = lambda: GitHubProvider(transport=mock_transport())
    _, pid, _ = create_entities(client)
    result = client.post(f'/projects/{pid}/analyze').json()
    with pytest.raises(ValueError, match='metadata-only'):
        invalidate_metadata_only_analysis(db, UUID(pid), UUID(result['run']['id']))
    assert db.get(m.AnalysisRun, UUID(result['run']['id'])).status == 'completed'
