"""Explicit repair of a confirmed, current metadata-only analysis; never rewrites evidence."""
from sqlalchemy import select
from app.models import domain as m


def invalidate_metadata_only_analysis(db, project_id, run_id):
    """Caller owns the transaction. Refuse stale/mixed/active analysis repairs.

    Keep SkillEvidence, RepositorySnapshot and frozen Match/Evidence Trace intact.
    A fresh successful analysis is needed before this project supplies current evidence.
    """
    project = db.scalar(select(m.Project).where(m.Project.id == project_id).with_for_update())
    if project is None or project.archived_at is not None:
        raise ValueError('Project is not active')
    run = db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.project_id == project_id)
                    .order_by(m.AnalysisRun.started_at.desc(), m.AnalysisRun.id.desc()).limit(1))
    if run is None or run.id != run_id or run.status != 'completed':
        raise ValueError('Expected current completed analysis')
    if db.scalar(select(m.AnalysisJob.id).where(m.AnalysisJob.project_id == project_id,
                                               m.AnalysisJob.status.in_(('queued', 'analyzing')))):
        raise ValueError('Analysis is active')
    observed = db.scalars(select(m.SkillEvidence).where(m.SkillEvidence.analysis_run_id == run_id,
                                                       m.SkillEvidence.evidence_status == 'observed')).all()
    if not observed or any(e.evidence_type != 'repository_language' for e in observed):
        raise ValueError('Repair requires metadata-only observed evidence')
    run.status = 'failed'
    run.error_code = 'GROUNDING_REJECTED'
    run.error_message = 'Repository language metadata was incorrectly classified as observed; source analysis must be repeated.'
    for job in db.scalars(select(m.AnalysisJob).where(m.AnalysisJob.run_id == run_id)):
        job.status = 'failed'
        job.error_code = run.error_code
        job.retryable = True
    db.flush()
