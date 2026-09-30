from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models import domain as m
from app.schemas import domain as s
from app.services import workflows
from app.services.analysis.interfaces import NeedAnalyzer, SkillAnalyzer
from app.services.analysis.factory import need_analyzer, skill_analyzer
from app.services.github.provider import GitHubProvider

router = APIRouter(responses={status: {'model': s.ErrorResponse} for status in [400, 404, 409, 422, 500, 502, 503, 504]})


def get_github() -> GitHubProvider:
    return GitHubProvider(settings.github_token)


def get_skill_analyzer() -> SkillAnalyzer:
    return skill_analyzer(settings)


def get_need_analyzer() -> NeedAnalyzer:
    return need_analyzer(settings)


@router.get('/health', response_model=s.Health)
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text('SELECT 1'))
    except SQLAlchemyError as exc:
        raise AppError('DATABASE_ERROR', 'Veritabanı bağlantısı kurulamadı.', 503, True,
                       {'status': 'degraded', 'service': 'zeminai-api', 'database': 'unavailable'}) from exc
    return s.Health(status='ok', database='ok')


@router.post('/candidates', response_model=s.Candidate, status_code=201)
def create_candidate(data: s.CandidateCreate, db: Session = Depends(get_db)):
    candidate = m.Candidate(**data.model_dump())
    db.add(candidate)
    db.commit()
    return candidate


@router.get('/candidates/{candidate_id}', response_model=s.Candidate)
def get_candidate(candidate_id: UUID, db: Session = Depends(get_db)):
    return workflows.get_or_404(db, m.Candidate, candidate_id)


@router.post('/candidates/{candidate_id}/projects', response_model=s.Project, status_code=201)
def create_project(candidate_id: UUID, data: s.ProjectCreate, db: Session = Depends(get_db)):
    workflows.get_or_404(db, m.Candidate, candidate_id)
    project = m.Project(candidate_id=candidate_id, **data.model_dump())
    db.add(project)
    db.commit()
    return project


@router.get('/projects/{project_id}', response_model=s.Project)
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    return workflows.get_or_404(db, m.Project, project_id)


@router.post('/projects/{project_id}/analyze', response_model=s.AnalysisResponse, status_code=201)
def analyze_project(project_id: UUID, db: Session = Depends(get_db),
                    provider: GitHubProvider = Depends(get_github),
                    analyzer: SkillAnalyzer = Depends(get_skill_analyzer)):
    return workflows.analyze_project(db, project_id, provider, analyzer)


@router.get('/snapshots/{snapshot_id}', response_model=s.RepositorySnapshot)
def get_snapshot(snapshot_id: UUID, db: Session = Depends(get_db)):
    return workflows.get_or_404(db, m.RepositorySnapshot, snapshot_id)


@router.get('/evidence/{evidence_id}', response_model=s.SkillEvidence)
def get_evidence(evidence_id: UUID, db: Session = Depends(get_db)):
    return workflows.get_or_404(db, m.SkillEvidence, evidence_id)


@router.get('/analysis-runs/{run_id}', response_model=s.AnalysisRun)
def get_analysis_run(run_id: UUID, db: Session = Depends(get_db)):
    return workflows.get_or_404(db, m.AnalysisRun, run_id)


@router.post('/needs', response_model=s.OrganizationNeed, status_code=201)
def create_need(data: s.NeedCreate, db: Session = Depends(get_db),
                analyzer: NeedAnalyzer = Depends(get_need_analyzer)):
    return workflows.create_need(db, data, analyzer)


@router.get('/needs/{need_id}', response_model=s.OrganizationNeed)
def get_need(need_id: UUID, db: Session = Depends(get_db)):
    return workflows.get_or_404(db, m.OrganizationNeed, need_id)


@router.post('/matches', response_model=s.MatchResult, status_code=201)
def create_match(data: s.MatchCreate, db: Session = Depends(get_db)):
    return workflows.create_match(db, data)


@router.get('/matches/{match_id}', response_model=s.MatchResult)
def get_match(match_id: UUID, db: Session = Depends(get_db)):
    return workflows.serialize_match(workflows.get_or_404(db, m.MatchResult, match_id))
