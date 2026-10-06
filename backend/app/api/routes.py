from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core import auth
from app.core.errors import AppError
from app.db.session import get_db
from app.models import domain as m
from app.schemas import domain as s
from app.services import workflows
from app.services.analysis.interfaces import NeedAnalyzer, SkillAnalyzer
from app.services.analysis.factory import need_analyzer, skill_analyzer
from app.services.github.provider import GitHubProvider
from app.schemas.profile import ProfileEvidenceCreate, ProfileEvidencePatch, ProfileEvidenceItem
from app.services import profile, living
from app.schemas import living as living_schema
from fastapi import Response

router = APIRouter(dependencies=[Depends(auth.check_origin)], responses={status: {'model': s.ErrorResponse} for status in [400, 401, 403, 404, 409, 422, 500, 502, 503, 504]})


@router.get('/candidates/{candidate_id}/living-profile', response_model=living_schema.LivingProfile)
def living_profile(candidate_id: UUID, since: date | None = None, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.candidate_record(db, candidate_id, user)
    return living.profile(db, candidate_id, since)


@router.get('/needs/{need_id}/discovery', response_model=living_schema.Discovery)
def discover(need_id: UUID, anonymous: bool = True, offset: int = Query(0, ge=0, le=100000),
             limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.need_record(db, need_id, user)
    return living.discovery(db, need_id, anonymous, offset, limit)


@router.post('/needs/{need_id}/team-coverage', response_model=living_schema.TeamCoverage)
def team_coverage(need_id: UUID, data: living_schema.TeamCreate, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.need_record(db, need_id, user)
    return living.team(db, need_id, data)


@router.get('/matches/{match_id}/gaps', response_model=living_schema.GapSummary)
def match_gaps(match_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.match_record(db, match_id, user)
    return living.gaps(db, match_id)


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
def create_candidate(data: s.CandidateCreate, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.require_role(user, 'candidate')
    if db.scalar(select(m.Candidate.id).where(m.Candidate.owner_user_id == user.id)):
        raise AppError('CANDIDATE_EXISTS', 'Hesabınızın zaten bir profili var.', 409)
    candidate = m.Candidate(owner_user_id=user.id, **data.model_dump())
    db.add(candidate)
    db.commit()
    return candidate


@router.get('/candidates/{candidate_id}', response_model=s.Candidate)
def get_candidate(candidate_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.candidate_record(db, candidate_id, user)
    return workflows.get_or_404(db, m.Candidate, candidate_id)


@router.post('/candidates/{candidate_id}/profile-evidence', response_model=ProfileEvidenceItem, status_code=201)
def create_profile(candidate_id: UUID, data: ProfileEvidenceCreate, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.candidate_record(db, candidate_id, user)
    return profile.create(db, candidate_id, data)


@router.get('/candidates/{candidate_id}/profile-evidence', response_model=list[ProfileEvidenceItem])
def list_profile(candidate_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.candidate_record(db, candidate_id, user)
    return profile.list_items(db, candidate_id)


@router.get('/profile-evidence/{evidence_id}', response_model=ProfileEvidenceItem)
def get_profile(evidence_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.require_role(user, 'candidate')
    item = workflows.get_or_404(db, m.ProfileEvidenceItem, evidence_id)
    auth.candidate_record(db, item.candidate_id, user)
    return workflows.get_or_404(db, m.ProfileEvidenceItem, evidence_id)


@router.patch('/profile-evidence/{evidence_id}', response_model=ProfileEvidenceItem)
def update_profile(evidence_id: UUID, data: ProfileEvidencePatch, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.require_role(user, 'candidate')
    item = workflows.get_or_404(db, m.ProfileEvidenceItem, evidence_id)
    auth.candidate_record(db, item.candidate_id, user)
    return profile.update(db, evidence_id, data)


@router.delete('/profile-evidence/{evidence_id}', status_code=204)
def delete_profile(evidence_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.require_role(user, 'candidate')
    item = workflows.get_or_404(db, m.ProfileEvidenceItem, evidence_id)
    auth.candidate_record(db, item.candidate_id, user)
    db.delete(workflows.get_or_404(db, m.ProfileEvidenceItem, evidence_id))
    db.commit()
    return Response(status_code=204)


@router.post('/candidates/{candidate_id}/projects', response_model=s.Project, status_code=201)
def create_project(candidate_id: UUID, data: s.ProjectCreate, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.candidate_record(db, candidate_id, user)
    workflows.get_or_404(db, m.Candidate, candidate_id)
    project = m.Project(candidate_id=candidate_id, **data.model_dump())
    db.add(project)
    db.commit()
    return project


@router.get('/projects/{project_id}', response_model=s.Project)
def get_project(project_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.project_record(db, project_id, user)
    return workflows.get_or_404(db, m.Project, project_id)


@router.post('/projects/{project_id}/analyze', response_model=s.AnalysisResponse, status_code=201)
def analyze_project(project_id: UUID, db: Session = Depends(get_db),
                    provider: GitHubProvider = Depends(get_github),
                    analyzer: SkillAnalyzer = Depends(get_skill_analyzer), user=Depends(auth.get_current_user)):
    auth.project_record(db, project_id, user)
    return workflows.analyze_project(db, project_id, provider, analyzer)


@router.get('/snapshots/{snapshot_id}', response_model=s.RepositorySnapshot)
def get_snapshot(snapshot_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    item = workflows.get_or_404(db, m.RepositorySnapshot, snapshot_id)
    auth.project_record(db, item.project_id, user)
    return workflows.get_or_404(db, m.RepositorySnapshot, snapshot_id)


@router.get('/evidence/{evidence_id}', response_model=s.SkillEvidence)
def get_evidence(evidence_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    item = workflows.get_or_404(db, m.SkillEvidence, evidence_id)
    auth.candidate_record(db, item.candidate_id, user)
    return workflows.get_or_404(db, m.SkillEvidence, evidence_id)


@router.get('/analysis-runs/{run_id}', response_model=s.AnalysisRun)
def get_analysis_run(run_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    item = workflows.get_or_404(db, m.AnalysisRun, run_id)
    auth.project_record(db, item.project_id, user) if item.project_id else auth.need_record(db, item.need_id, user)
    return workflows.get_or_404(db, m.AnalysisRun, run_id)


@router.post('/needs', response_model=s.OrganizationNeed, status_code=201)
def create_need(data: s.NeedCreate, db: Session = Depends(get_db),
                analyzer: NeedAnalyzer = Depends(get_need_analyzer), user=Depends(auth.get_current_user)):
    auth.require_role(user, 'institution')
    return workflows.create_need(db, data, analyzer, owner_user_id=user.id)


@router.get('/needs/{need_id}', response_model=s.OrganizationNeed)
def get_need(need_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.need_record(db, need_id, user)
    return workflows.get_or_404(db, m.OrganizationNeed, need_id)


@router.post('/matches', response_model=s.MatchResult, status_code=201)
def create_match(data: s.MatchCreate, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.need_record(db, data.need_id, user)
    auth.discoverable(db, data.candidate_id)
    return workflows.create_match(db, data)


@router.get('/matches/{match_id}', response_model=s.MatchResult)
def get_match(match_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    auth.match_record(db, match_id, user)
    return workflows.serialize_match(workflows.get_or_404(db, m.MatchResult, match_id))


@router.get('/matches/{match_id}/evidence/{evidence_id}', response_model=s.SkillEvidence)
def match_evidence(match_id: UUID, evidence_id: UUID, db: Session = Depends(get_db), user=Depends(auth.require_institution)):
    auth.match_record(db, match_id, user)
    linked = db.scalar(select(m.MatchEvidence).join(m.MatchCriterion,
        m.MatchEvidence.match_criterion_id == m.MatchCriterion.id).where(
        m.MatchCriterion.match_id == match_id, m.MatchEvidence.evidence_id == evidence_id))
    if linked is None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    return workflows.get_or_404(db, m.SkillEvidence, evidence_id)


@router.get('/candidates/{candidate_id}/projects', response_model=list[s.Project])
def list_projects(candidate_id: UUID, db: Session = Depends(get_db), user=Depends(auth.require_candidate)):
    auth.candidate_record(db, candidate_id, user)
    return db.scalars(select(m.Project).where(m.Project.candidate_id == candidate_id)
        .order_by(m.Project.created_at.desc(), m.Project.id).limit(100)).all()


@router.get('/projects/{project_id}/evidence', response_model=list[s.SkillEvidence])
def project_evidence(project_id: UUID, db: Session = Depends(get_db), user=Depends(auth.require_candidate)):
    auth.project_record(db, project_id, user)
    run = db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.project_id == project_id,
        m.AnalysisRun.status == 'completed').order_by(m.AnalysisRun.completed_at.desc(), m.AnalysisRun.id).limit(1))
    return db.scalars(select(m.SkillEvidence).where(m.SkillEvidence.analysis_run_id == run.id)).all() if run else []


@router.get('/needs', response_model=list[s.OrganizationNeed])
def list_needs(db: Session = Depends(get_db), user=Depends(auth.require_institution)):
    return db.scalars(select(m.OrganizationNeed).where(m.OrganizationNeed.owner_user_id == user.id)
        .order_by(m.OrganizationNeed.created_at.desc(), m.OrganizationNeed.id).limit(100)).all()


@router.patch('/needs/{need_id}', response_model=s.OrganizationNeed)
def update_need_details(need_id: UUID, data: s.NeedDetailsPatch, db: Session = Depends(get_db), user=Depends(auth.require_institution)):
    need = auth.need_record(db, need_id, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(need, field, value)
    db.commit()
    return need


@router.patch('/candidates/{candidate_id}', response_model=s.Candidate)
def update_candidate(candidate_id: UUID, data: s.CandidateCreate, db: Session = Depends(get_db), user=Depends(auth.require_candidate)):
    candidate = auth.candidate_record(db, candidate_id, user)
    candidate.name = data.name
    user.display_name = data.name
    db.commit()
    return candidate
