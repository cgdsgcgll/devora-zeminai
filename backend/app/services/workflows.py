from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import domain as m
from app.schemas import domain as s
from app.services.analysis.interfaces import NeedAnalyzer, SkillAnalyzer, validate_model_output
from app.services.github.provider import GitHubProvider
from app.services.matching.material import load_material, calculate_for_need


def get_or_404(db: Session, model: type, entity_id: UUID):
    row = db.get(model, entity_id)
    if row is None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    return row


def create_need(db: Session, data: s.NeedCreate, analyzer: NeedAnalyzer) -> m.OrganizationNeed:
    need = m.OrganizationNeed(**data.model_dump(exclude={'criteria'}),
                              analysis_version='explicit-criteria-v0.1', uncertainties=[])
    db.add(need)
    db.flush()
    run = m.AnalysisRun(need_id=need.id, analysis_type='need', status='running',
                        analysis_version='explicit-criteria-v0.1' if data.criteria else analyzer.version,
                        provider='explicit' if data.criteria else getattr(analyzer, 'provider', None),
                        model=None if data.criteria else getattr(analyzer, 'model', None),
                        limitations=[], uncertainties=[])
    db.add(run)
    db.commit()
    try:
        if data.criteria:
            result = s.NeedAnalysisResult(criteria=data.criteria, uncertainties=[], analysis_version='explicit-criteria-v0.1')
        else:
            result = validate_model_output(s.NeedAnalysisResult, analyzer.analyze_need(
                s.NeedAnalysisInput(need_id=need.id, **data.model_dump(exclude={'criteria'}))))
        need.analysis_version = result.analysis_version
        need.uncertainties = result.uncertainties
        need.criteria = [m.NeedCriterion(**c.model_dump()) for c in result.criteria]
        run.status = 'completed'
        run.completed_at = s.utcnow()
        run.analysis_version = result.analysis_version
        run.uncertainties = result.uncertainties
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        error = exc if isinstance(exc, AppError) else AppError('ANALYSIS_FAILED', 'İhtiyaç analizi tamamlanamadı.', 502)
        run.status = 'failed'
        run.completed_at = s.utcnow()
        run.error_code = error.code
        run.error_message = error.message
        db.commit()
        error.details.update({'analysis_run_id': str(run.id), 'need_id': str(need.id)})
        raise error from exc
    return need


def analyze_project(db: Session, project_id: UUID, provider: GitHubProvider,
                    analyzer: SkillAnalyzer) -> s.AnalysisResponse:
    project = get_or_404(db, m.Project, project_id)
    run = m.AnalysisRun(project_id=project.id, analysis_type='project', status='running',
                        provider=getattr(analyzer, 'provider', None), model=getattr(analyzer, 'model', None),
                        analysis_version=analyzer.version, limitations=[], uncertainties=[])
    db.add(run)
    db.commit()
    run_id = run.id
    try:
        snapshot_data = provider.fetch(project.source_url)
        snapshot = m.RepositorySnapshot(project_id=project.id, **snapshot_data.model_dump(mode='json', exclude={'fetched_at'}),
                                        fetched_at=snapshot_data.fetched_at)
        db.add(snapshot)
        run.commit_sha = snapshot_data.commit_sha
        db.commit()  # Preserve fetched input even if analysis fails later.
        if not snapshot_data.files and not snapshot_data.languages:
            raise AppError('INSUFFICIENT_PROJECT_DATA', 'Analiz için erişilebilir metin veya dil bilgisi bulunamadı.', 422)
        result = validate_model_output(s.ProjectAnalysisResult, analyzer.analyze_project(
            s.ProjectAnalysisInput(candidate_id=project.candidate_id, project_id=project.id,
                name=project.name, description=project.description, snapshot=snapshot_data)))
        evidence = [m.SkillEvidence(candidate_id=project.candidate_id, project_id=project.id,
                    snapshot_id=snapshot.id, analysis_run_id=run_id, **item.model_dump()) for item in result.evidence]
        db.add_all(evidence)
        run.status = 'completed'
        run.completed_at = s.utcnow()
        run.analysis_version = result.analysis_version
        run.limitations = result.limitations
        run.uncertainties = result.uncertainties
        db.commit()
        return s.AnalysisResponse(run=s.AnalysisRun.model_validate(run),
            snapshot=s.RepositorySnapshot.model_validate(snapshot), result=result,
            evidence=[s.SkillEvidence.model_validate(e) for e in evidence])
    except SQLAlchemyError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        error = exc if isinstance(exc, AppError) else AppError('ANALYSIS_FAILED', 'Proje analizi tamamlanamadı.', 502)
        failed = db.get(m.AnalysisRun, run_id)
        failed.status = 'failed'
        failed.completed_at = s.utcnow()
        failed.error_code = error.code
        failed.error_message = error.message
        db.commit()
        error.details['analysis_run_id'] = str(run_id)
        raise error from exc


def serialize_match(row: m.MatchResult) -> s.MatchResult:
    details = [s.CriterionMatch(criterion_id=c.criterion_id, skill_key=c.skill_key,
        kind=c.kind, profile_evidence=c.profile_evidence,
        skill_label=c.skill_label, priority=c.priority, matched=c.matched,
        evidence_ids=[e.evidence_id for e in c.evidence], explanation=c.explanation) for c in row.criteria]
    fields = {name: getattr(row, name) for name in s.MatchResult.model_fields
              if name not in {'matched_criteria', 'unmatched_criteria'}}
    return s.MatchResult(**fields, matched_criteria=[c for c in details if c.matched],
                         unmatched_criteria=[c for c in details if not c.matched])


def create_match(db: Session, data: s.MatchCreate) -> s.MatchResult:
    candidate = get_or_404(db, m.Candidate, data.candidate_id)
    need = get_or_404(db, m.OrganizationNeed, data.need_id)
    if not need.criteria:
        raise AppError('MATCHING_FAILED', 'İhtiyaç kriterleri boş; açık criteria ile ihtiyaç oluşturun.', 422)
    material = load_material(db, [candidate.id])[candidate.id]
    if not material.runs and not material.profiles:
        raise AppError('INSUFFICIENT_PROJECT_DATA', 'Önce en az bir proje için /projects/{id}/analyze çalıştırın.', 409)
    result = calculate_for_need(need, material)
    row = m.MatchResult(**data.model_dump(), **result.model_dump(exclude={'matched_criteria', 'unmatched_criteria'}))
    db.add(row)
    db.flush()
    for criterion in result.matched_criteria + result.unmatched_criteria:
        item = m.MatchCriterion(match_id=row.id, **criterion.model_dump(exclude={'evidence_ids', 'profile_evidence'}),
            profile_evidence=[p.model_dump(mode='json') for p in criterion.profile_evidence])
        item.evidence = [m.MatchEvidence(evidence_id=eid) for eid in criterion.evidence_ids]
        db.add(item)
    db.commit()
    db.refresh(row)
    return serialize_match(row)
