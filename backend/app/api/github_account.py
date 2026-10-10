from urllib.parse import parse_qs
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update, delete
from sqlalchemy.orm import Session
from app.core.auth import check_origin, require_candidate, session_record, project_record
from app.core.config import settings
from app.core.errors import AppError
from app.core.rate_limits import consume
from app.db.session import get_db
from app.models import domain as m
from app.models.github_account import GitHubConnection, GitHubOAuthState, GitHubRepositoryLink
from app.schemas import github_account as s
from app.schemas.domain import ErrorResponse, utcnow
from app.services.github import account_service as service
from app.services.github.account_provider import get_account_provider
from app.services.github.url import normalize_repository_url

router = APIRouter(dependencies=[Depends(check_origin)],
    responses={v:{'model':ErrorResponse} for v in (400,401,403,404,409,422,429,502,503)})


def candidate(db, user):
    value = db.scalar(select(m.Candidate).where(m.Candidate.owner_user_id == user.id))
    if value is None:
        raise AppError('NOT_FOUND', 'Aday kaydı bulunamadı.', 404)
    return value


@router.post('/github/connect', response_model=s.GitHubConnectURL)
def connect(request: Request, user=Depends(require_candidate), db: Session=Depends(get_db)):
    consume(request, db, user, 'compute')
    return service.start(db, candidate(db,user), session_record(request,db))


@router.get('/github/callback', response_class=RedirectResponse)
def callback(request: Request, user=Depends(require_candidate), db: Session=Depends(get_db),
             provider=Depends(get_account_provider)):
    query = request.scope.get('github_callback_query', request.scope['query_string'])
    try:
        values = parse_qs(query.decode('ascii', errors='replace'), max_num_fields=10)
    except ValueError:
        raise AppError('GITHUB_OAUTH_STATE_INVALID', 'GitHub bağlantı isteği geçersiz.', 400) from None
    state = values.get('state', [None])
    code = values.get('code', [None])
    service.callback(db, candidate(db,user), session_record(request,db),
        state[0] if len(state)==1 else None, code[0] if len(code)==1 else None, provider)
    return RedirectResponse(settings.cors_origins[0]+'/aday', status_code=303,
                            headers={'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer'})


@router.get('/github/connection', response_model=s.GitHubConnectionStatus)
def connection(user=Depends(require_candidate), db: Session=Depends(get_db)):
    row = db.scalar(select(GitHubConnection).where(GitHubConnection.candidate_id==candidate(db,user).id)
        .order_by(GitHubConnection.created_at.desc(), GitHubConnection.id.desc()).limit(1))
    return {'connection':row}


@router.delete('/github/connection', status_code=204)
def disconnect(user=Depends(require_candidate), db: Session=Depends(get_db)):
    owner = candidate(db,user)
    db.scalar(select(m.Candidate).where(m.Candidate.id==owner.id).with_for_update())
    row = db.scalar(select(GitHubConnection).where(GitHubConnection.candidate_id==owner.id,
        GitHubConnection.revoked_at.is_(None)).with_for_update())
    if row:
        service.revoke(db,row)
    db.execute(delete(GitHubOAuthState).where(GitHubOAuthState.candidate_id==owner.id))
    db.commit()


@router.get('/github/installation-url', response_model=s.GitHubInstallationURL)
def installation_url(user=Depends(require_candidate), db: Session=Depends(get_db)):
    service.active(db, candidate(db, user))
    return {'installation_url': service.installation_url()}


@router.get('/github/installations', response_model=list[s.GitHubInstallation])
def installations(request: Request, user=Depends(require_candidate), db: Session=Depends(get_db),
                  provider=Depends(get_account_provider)):
    consume(request, db, user, 'compute')
    row = service.active(db,candidate(db,user))
    result = service.with_token(db,row,provider,provider.installations)
    db.commit()
    return result


@router.get('/github/installations/{installation_id}/repositories', response_model=list[s.GitHubRepository])
def repositories(installation_id:s.GitHubID, request:Request, user=Depends(require_candidate),
                 db:Session=Depends(get_db), provider=Depends(get_account_provider)):
    consume(request, db, user, 'compute')
    row = service.active(db,candidate(db,user))
    result = service.with_token(db,row,provider,lambda token:provider.repositories(token,installation_id))
    linked = dict(db.execute(select(GitHubRepositoryLink.github_repository_id, m.Project.id).join(
        m.Project, m.Project.id==GitHubRepositoryLink.project_id).where(
        m.Project.candidate_id==row.candidate_id, m.Project.archived_at.is_(None))).all())
    db.commit()
    return [r.model_copy(update={'imported_project_id':linked.get(r.id)}) for r in result]


@router.get('/projects/{project_id}/github-relationship', response_model=s.GitHubRelationshipStatus)
def relationship(project_id:UUID, user=Depends(require_candidate), db:Session=Depends(get_db)):
    project_record(db,project_id,user)
    return {'link': db.scalar(select(GitHubRepositoryLink).where(GitHubRepositoryLink.project_id==project_id))}


@router.delete('/projects/{project_id}/github-relationship', status_code=204)
def unlink(project_id:UUID, user=Depends(require_candidate), db:Session=Depends(get_db)):
    project_record(db,project_id,user)
    db.execute(update(GitHubRepositoryLink).where(GitHubRepositoryLink.project_id==project_id)
               .values(revoked_at=utcnow()))
    db.commit()


@router.post('/projects/{project_id}/github-relationship', response_model=s.GitHubRelationshipStatus)
def link(project_id:UUID, data:s.GitHubLinkInput, request:Request, user=Depends(require_candidate),
         db:Session=Depends(get_db), provider=Depends(get_account_provider)):
    project = project_record(db,project_id,user)
    consume(request,db,user,'compute')
    row = service.active(db,candidate(db,user))
    choices = service.with_token(db,row,provider,lambda token:provider.repositories(token,data.installation_id))
    repo = next((v for v in choices if v.id==data.repository_id),None)
    if repo is None:
        raise AppError('GITHUB_REPOSITORY_NOT_ACCESSIBLE','Repository erişimi doğrulanamadı.',409)
    existing = db.scalar(select(GitHubRepositoryLink).where(GitHubRepositoryLink.project_id==project.id))
    # Initial claim must describe this project. Subsequent rename keeps immutable repository identity.
    same_identity = existing and existing.github_repository_id==repo.id
    if not same_identity and normalize_repository_url(project.source_url).casefold()!=repo.html_url.casefold():
        raise AppError('GITHUB_REPOSITORY_MISMATCH','Repository proje bağlantısıyla eşleşmiyor.',409)
    if existing is None:
        existing = GitHubRepositoryLink(project_id=project.id,candidate_id=project.candidate_id)
        db.add(existing)
    for key in ('full_name','owner_id','owner_login','owner_type','permissions'):
        setattr(existing,key,getattr(repo,key))
    existing.connection_id, existing.github_repository_id = row.id, repo.id
    existing.installation_id, existing.revoked_at = data.installation_id, None
    existing.relationship = 'personal_owner' if repo.owner_type=='User' and repo.owner_id==row.github_user_id else 'account_access'
    existing.updated_at = utcnow()
    db.commit()
    return {'link':existing}


from app.services import analysis_jobs


@router.get('/projects/{project_id}/activity', response_model=s.ProjectActivity)
def project_activity(project_id:UUID, user=Depends(require_candidate), db:Session=Depends(get_db)):
    project = project_record(db,project_id,user)
    state = analysis_jobs.view(db,project_id)
    run = db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.project_id==project_id)
        .order_by(m.AnalysisRun.started_at.desc(),m.AnalysisRun.id.desc()).limit(1))
    last_success = db.scalar(select(m.AnalysisRun.id).where(m.AnalysisRun.project_id==project_id,
        m.AnalysisRun.status=='completed').order_by(m.AnalysisRun.completed_at.desc(),m.AnalysisRun.id.desc()).limit(1))
    evidence = db.scalars(select(m.SkillEvidence).where(m.SkillEvidence.analysis_run_id==last_success)).all() if last_success else []
    return {'project':project, 'run':run, 'evidence':evidence, 'analysis':state,
        'link':db.scalar(select(GitHubRepositoryLink).where(GitHubRepositoryLink.project_id==project_id))}


def import_choice(db, owner, connection, repo, installation_id, request, user):
    db.refresh(owner, with_for_update=True)
    project = db.scalar(select(m.Project).outerjoin(GitHubRepositoryLink,
        GitHubRepositoryLink.project_id==m.Project.id).where(m.Project.candidate_id==owner.id,
        m.Project.archived_at.is_(None), (m.Project.github_repository_id==repo.id) |
        (GitHubRepositoryLink.github_repository_id==repo.id)))
    created=project is None
    if created:
        project=m.Project(candidate_id=owner.id,name=repo.full_name[:200],description='',source_type='github',
            source_url=repo.html_url,github_repository_id=repo.id,repository_private=repo.private)
        db.add(project);db.flush()
    # Refresh provenance even for an existing/reconnected import; analysis is independent.
    relation=db.scalar(select(GitHubRepositoryLink).where(GitHubRepositoryLink.project_id==project.id))
    if not relation:
        relation=GitHubRepositoryLink(project_id=project.id,candidate_id=owner.id);db.add(relation)
    for field in ('full_name','owner_id','owner_login','owner_type','permissions'):
        setattr(relation,field,getattr(repo,field))
    relation.connection_id=connection.id;relation.github_repository_id=repo.id;relation.installation_id=installation_id
    relation.revoked_at=None;relation.updated_at=utcnow()
    relation.relationship='personal_owner' if repo.owner_type=='User' and repo.owner_id==connection.github_user_id else 'account_access'
    project.repository_private=repo.private
    db.commit()  # Project + provenance exist before queue/analysis; never rolled back by provider failure.
    state=analysis_jobs.enqueue(db,project.id,request,user)
    return {'project':project,'created':created,'analysis':state}


@router.post('/github/import', response_model=s.GitHubImportResult)
def import_repository(data:s.GitHubLinkInput, request:Request, user=Depends(require_candidate),
        db:Session=Depends(get_db), provider=Depends(get_account_provider)):
    consume(request,db,user,'compute')
    owner=candidate(db,user);connection=service.active(db,owner)
    choices=service.with_token(db,connection,provider,lambda token:provider.repositories(token,data.installation_id))
    repo=next((r for r in choices if r.id==data.repository_id),None)
    if repo is None:raise AppError('GITHUB_REPOSITORY_NOT_ACCESSIBLE','Repository erişimi doğrulanamadı.',409)
    return import_choice(db,owner,connection,repo,data.installation_id,request,user)


@router.post('/github/import-batch', response_model=s.GitHubBatchResult)
def import_batch(data:s.GitHubBatchInput, request:Request, user=Depends(require_candidate),
        db:Session=Depends(get_db), provider=Depends(get_account_provider)):
    from sqlalchemy.exc import SQLAlchemyError
    consume(request,db,user,'compute')
    owner=candidate(db,user)
    ids=list(dict.fromkeys(data.repository_ids))
    try:
        connection=service.active(db,owner)
        choices=service.with_token(db,connection,provider,lambda token:provider.repositories(token,data.installation_id))
    except AppError as exc:
        return {'items':[{'repository_id':rid,'status':'failed','error_code':exc.code} for rid in ids]}
    choices={r.id:r for r in choices};items=[]
    for rid in ids:
        try:
            if rid not in choices:raise AppError('GITHUB_REPOSITORY_NOT_ACCESSIBLE','Repository erişimi doğrulanamadı.',409)
            result=import_choice(db,owner,connection,choices[rid],data.installation_id,request,user)
            items.append({'repository_id':rid,'status':'imported' if result['created'] else 'existing','result':result})
        except (AppError,SQLAlchemyError) as exc:
            db.rollback()
            items.append({'repository_id':rid,'status':'failed','error_code':exc.code if isinstance(exc,AppError) else 'DATABASE_ERROR'})
    return {'items':items}


@router.post('/projects/{project_id}/analysis-jobs', response_model=s.AnalysisState, status_code=202)
def queue_analysis(project_id:UUID,request:Request,user=Depends(require_candidate),db:Session=Depends(get_db)):
    project_record(db,project_id,user)
    return analysis_jobs.enqueue(db,project_id,request,user,retry=True)
