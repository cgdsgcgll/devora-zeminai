"""Batch loading shared by persisted matches, discovery and living profiles."""
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import domain as m
from app.schemas import domain as s
from app.schemas.profile import ProfileEvidenceItem
from app.services.matching.scorer import calculate_match


@dataclass
class Material:
    projects: list = field(default_factory=list)
    runs: list = field(default_factory=list)
    evidence: list = field(default_factory=list)
    profiles: list = field(default_factory=list)
    uncertainties: list = field(default_factory=list)


def bounded(db, statement):
    rows = db.scalars(statement.limit(5001)).all()
    if len(rows) > 5000:
        raise AppError('READ_LIMIT_EXCEEDED', 'Bu görünümün kayıt sınırı aşıldı; daha küçük bir aday grubu seçin.', 422)
    return rows


def load_material(db: Session, candidate_ids: list[UUID]) -> dict[UUID, Material]:
    result = {cid: Material() for cid in candidate_ids}
    if not candidate_ids:
        return result
    projects = bounded(db, select(m.Project).where(m.Project.candidate_id.in_(candidate_ids)).order_by(m.Project.id))
    for project in projects:
        result[project.candidate_id].projects.append(project)
    project_ids = [p.id for p in projects]
    ranked = select(m.AnalysisRun.id.label('id'), func.row_number().over(
        partition_by=m.AnalysisRun.project_id,
        order_by=(m.AnalysisRun.completed_at.desc(), m.AnalysisRun.id.desc())).label('position')).where(
        m.AnalysisRun.project_id.in_(project_ids), m.AnalysisRun.status == 'completed').subquery()
    runs = bounded(db, select(m.AnalysisRun).join(ranked, ranked.c.id == m.AnalysisRun.id).where(ranked.c.position == 1))
    by_project = {r.project_id: r for r in runs}
    incomplete = dict(db.execute(select(m.AnalysisRun.project_id, func.max(m.AnalysisRun.started_at)).where(
        m.AnalysisRun.project_id.in_(project_ids), m.AnalysisRun.status != 'completed').group_by(m.AnalysisRun.project_id)).all())
    for project in projects:
        material = result[project.candidate_id]
        run = by_project.get(project.id)
        if run:
            material.runs.append(run)
            material.uncertainties.extend(run.uncertainties + run.limitations)
            if incomplete.get(project.id) and incomplete[project.id] > run.started_at:
                material.uncertainties.append(f'{project.name}: sonraki analiz tamamlanmadı; son başarılı snapshot kullanıldı.')
        else:
            material.uncertainties.append(f'{project.name}: tamamlanmış analiz yok; eşleşmeye dahil edilmedi.')
    for row in bounded(db, select(m.SkillEvidence).where(m.SkillEvidence.analysis_run_id.in_([r.id for r in runs])).order_by(m.SkillEvidence.id)):
        result[row.candidate_id].evidence.append(s.SkillEvidence.model_validate(row))
    for row in bounded(db, select(m.ProfileEvidenceItem).where(m.ProfileEvidenceItem.candidate_id.in_(candidate_ids)).order_by(m.ProfileEvidenceItem.id)):
        result[row.candidate_id].profiles.append(ProfileEvidenceItem.model_validate(row))
    return result


def calculate_for_need(need, material):
    versions = ','.join(sorted({r.analysis_version for r in material.runs} | {need.analysis_version}))
    return calculate_match([s.NeedCriterion.model_validate(c) for c in need.criteria], material.evidence,
        versions, list(need.uncertainties) + material.uncertainties, material.profiles)
