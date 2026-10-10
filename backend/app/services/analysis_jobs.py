"""Durable queue, atomic claim and deadline fencing; no provider calls in request handlers."""
from datetime import timedelta, timezone
from threading import Event, Thread
import logging
from sqlalchemy import select, update, exists
from sqlalchemy.orm import Session
from app.models import domain as m
from app.schemas.domain import utcnow
from app.core.config import settings
from app.core.errors import AppError
from app.core.rate_limits import consume
from app.services.llm import diagnostics
from app.services.analysis.semantic_retry import GroundingFailure

ACTIVE = ('queued','analyzing')


def fail(db, job, code, *, retryable=True, details=None):
    job.retryable=retryable; job.diagnostics=details
    job.status='failed'; job.error_code=code; job.finished_at=utcnow()
    if job.run_id:
        db.execute(update(m.AnalysisRun).where(m.AnalysisRun.id==job.run_id,m.AnalysisRun.status=='running')
            .values(status='failed',completed_at=utcnow(),error_code=code,error_message='Kaynak analizi tamamlanamadı; yeniden deneyebilirsiniz.'))


def reconcile(db, project_id=None):
    query=select(m.AnalysisJob).where(m.AnalysisJob.status.in_(ACTIVE),m.AnalysisJob.deadline<=utcnow())
    if project_id: query=query.where(m.AnalysisJob.project_id==project_id)
    rows=db.scalars(query.with_for_update()).all()
    for job in rows: fail(db,job,'ANALYSIS_QUEUE_TIMEOUT' if job.status=='queued' else 'ANALYSIS_TIMEOUT')
    # Old synchronous runs also expire; do not leave a pre-upgrade crash running forever.
    legacy=update(m.AnalysisRun).where(m.AnalysisRun.analysis_type=='project',m.AnalysisRun.status=='running',
        m.AnalysisRun.started_at<=utcnow()-timedelta(seconds=settings.analysis_job_timeout_seconds),
        ~exists().where(m.AnalysisJob.run_id==m.AnalysisRun.id))
    if project_id: legacy=legacy.where(m.AnalysisRun.project_id==project_id)
    db.execute(legacy.values(status='failed',completed_at=utcnow(),error_code='ANALYSIS_INTERRUPTED',
        error_message='Önceki kaynak analizi kesildi; yeniden deneyebilirsiniz.'))
    db.commit()


def view(db, project_id):
    reconcile(db,project_id)
    job=db.scalar(select(m.AnalysisJob).where(m.AnalysisJob.project_id==project_id)
        .order_by(m.AnalysisJob.created_at.desc(),m.AnalysisJob.id.desc()).limit(1))
    run=db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.project_id==project_id)
        .order_by(m.AnalysisRun.started_at.desc(),m.AnalysisRun.id.desc()).limit(1))
    # A later legacy/manual analysis is still authoritative.
    stamp=lambda value:value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    if job and (not run or (job.run_id==run.id) or stamp(job.created_at)>=stamp(run.started_at)):
        return {'state':job.status,'job_id':job.id,'error_code':job.error_code,'retryable':job.retryable,'deadline':job.deadline if job.status in ACTIVE else None}
    if run:
        return {'state':{'running':'analyzing','completed':'succeeded','failed':'failed'}[run.status],
            'error_code':run.error_code,'deadline':stamp(run.started_at)+timedelta(seconds=settings.analysis_job_timeout_seconds) if run.status=='running' else None}
    return {'state':'not_started'}


def enqueue(db, project_id, request, user, *, retry=False):
    reconcile(db,project_id)
    project=db.scalar(select(m.Project).where(m.Project.id==project_id).with_for_update())
    if not project or project.archived_at: raise AppError('NOT_FOUND','Proje bulunamadı.',404)
    if project.repository_private: return {'state':'not_started','error_code':'PRIVATE_ANALYSIS_UNSUPPORTED'}
    current=view(db,project_id)
    if current['state'] in ACTIVE or (not retry and current['state']!='not_started'): return current
    budget_error=None
    try: consume(request,db,user,'ai')
    except AppError as exc: budget_error=exc.code
    # consume commits: acquire the lock again before testing/creating the unique active job.
    project=db.scalar(select(m.Project).where(m.Project.id==project_id).with_for_update().execution_options(populate_existing=True))
    if not project or project.archived_at: raise AppError('NOT_FOUND','Proje bulunamadı.',404)
    active=db.scalar(select(m.AnalysisJob).where(m.AnalysisJob.project_id==project_id,m.AnalysisJob.status.in_(ACTIVE)))
    if active: db.commit();return view(db,project_id)
    running=db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.project_id==project_id,m.AnalysisRun.status=='running'))
    if running: db.commit();return view(db,project_id)
    if not retry and (db.scalar(select(m.AnalysisJob.id).where(m.AnalysisJob.project_id==project_id).limit(1)) or
                      db.scalar(select(m.AnalysisRun.id).where(m.AnalysisRun.project_id==project_id).limit(1))):
        db.commit();return view(db,project_id)
    job=m.AnalysisJob(project_id=project_id,status='failed' if budget_error else 'queued',
        deadline=utcnow()+timedelta(seconds=settings.analysis_queue_timeout_seconds),error_code=budget_error,
        finished_at=utcnow() if budget_error else None)
    db.add(job);db.commit()
    return view(db,project_id)


def claim(db):
    reconcile(db)
    job=db.scalar(select(m.AnalysisJob).where(m.AnalysisJob.status=='queued')
        .order_by(m.AnalysisJob.created_at,m.AnalysisJob.id).with_for_update(skip_locked=True).limit(1))
    if not job:return None
    changed=db.execute(update(m.AnalysisJob).where(m.AnalysisJob.id==job.id,m.AnalysisJob.status=='queued')
        .values(status='analyzing',deadline=utcnow()+timedelta(seconds=settings.analysis_job_timeout_seconds)))
    if changed.rowcount!=1:db.rollback();return None
    project=db.get(m.Project,job.project_id)
    if not project or project.archived_at:
        fail(db,job,'PROJECT_ARCHIVED');db.commit();return None
    run=m.AnalysisRun(project_id=job.project_id,analysis_type='project',status='running',
        analysis_version='pending',limitations=[],uncertainties=[])
    db.add(run);db.flush();job.run_id=run.id;db.commit()
    return job.id


def fence(db, job_id):
    job=db.scalar(select(m.AnalysisJob).where(m.AnalysisJob.id==job_id).with_for_update().execution_options(populate_existing=True))
    stamp=job.deadline.replace(tzinfo=timezone.utc) if job.deadline.tzinfo is None else job.deadline
    project=db.get(m.Project,job.project_id,populate_existing=True)
    if job.status!='analyzing' or stamp<=utcnow() or project.archived_at:
        raise AppError('ANALYSIS_INTERRUPTED','Kaynak analizi kesildi; yeniden deneyebilirsiniz.',409)
    return job


def execute(db, job_id, provider, analyzer):
    from app.services import workflows
    job=db.get(m.AnalysisJob,job_id)
    try:
        with diagnostics.analysis_context(job):
            workflows.analyze_project(db,job.project_id,provider,analyzer,reserved_run_id=job.run_id,job_id=job.id)
        # workflow commits completion and job success atomically.
    except Exception as exc:
        db.rollback()
        current=db.scalar(select(m.AnalysisJob).where(m.AnalysisJob.id==job_id).with_for_update().execution_options(populate_existing=True))
        if current.status in ACTIVE:
            error = exc if isinstance(exc, AppError) else AppError('ANALYSIS_INTERNAL_ERROR', 'Kaynak analizi tamamlanamadı.', 500, True)
            code = 'GROUNDING_REJECTED' if isinstance(exc, GroundingFailure) else error.code
            safe = {k:v for k,v in error.details.items() if
                (k == 'upstream_status' and isinstance(v,int) and 100 <= v <= 599) or
                (k == 'stage' and v in {'source_load','llm_request','grounding','persist'})}
            fail(db,current,code,retryable=error.retryable,details=safe);db.commit()
            with diagnostics.analysis_context(current):
                diagnostics.event(safe.get('stage','persist'), provider=getattr(analyzer,'provider',None),
                    model=getattr(analyzer,'model',None), error=AppError(code,error.message,error.status,error.retryable,safe))


def start_workers(session_factory):
    from app.services.llm.capacity import capacity
    stop=Event()
    def loop():
        from app.services.github.provider import GitHubProvider
        from app.services.analysis.factory import skill_analyzer
        while not stop.is_set():
            try:
                with capacity.slot(stop) as acquired:
                    if not acquired: break
                    with session_factory() as db:
                        job_id=claim(db)
                        if job_id:
                            try: execute(db,job_id,GitHubProvider(settings.github_token),skill_analyzer(settings))
                            except Exception:
                                db.rollback()
                                job=db.get(m.AnalysisJob,job_id)
                                if job and job.status in ACTIVE:fail(db,job,'SOURCE_ANALYSIS_FAILED');db.commit()
            except Exception as exc:
                logging.getLogger(__name__).warning('Analysis worker unavailable: %s',type(exc).__name__)
            stop.wait(1)
    threads=[Thread(target=loop,daemon=True,name=f'analysis-worker-{i}') for i in range(settings.analysis_worker_threads)]
    for thread in threads:thread.start()
    return stop
