"""Private match-scoped requests. Review never changes evidence or a match."""
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from app.models import domain as m
from app.schemas import proof as s
from app.schemas.domain import utcnow, TraceEvidence
from app.core import auth
from app.core.errors import AppError


def query(user):
    statement = select(m.ProofRequest, m.MatchCriterion, m.MatchResult).join(
        m.MatchCriterion, m.ProofRequest.match_criterion_id == m.MatchCriterion.id).join(
        m.MatchResult, m.MatchCriterion.match_id == m.MatchResult.id)
    if user.role == 'institution':
        return statement.join(m.OrganizationNeed, m.MatchResult.need_id == m.OrganizationNeed.id).where(m.OrganizationNeed.owner_user_id == user.id)
    auth.require_role(user, 'candidate')
    return statement.join(m.Candidate, m.MatchResult.candidate_id == m.Candidate.id).where(m.Candidate.owner_user_id == user.id)


def record(db, request_id, user):
    row = db.execute(query(user).where(m.ProofRequest.id == request_id)).first()
    if row is None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    return row


def serialize(row):
    request, criterion, match = row
    return s.ProofItem(id=request.id, match_id=match.id, candidate_id=match.candidate_id,
        need_id=match.need_id, criterion_id=criterion.criterion_id, criterion_label=criterion.skill_label,
        title=request.title, instructions=request.instructions, status=request.status,
        submission=request.submission, created_at=request.created_at, updated_at=request.updated_at,
        submitted_at=request.submitted_at, resolved_at=request.resolved_at)


def create(db, data, user):
    match = auth.match_record(db, data.match_id, user)
    auth.discoverable(db, match.candidate_id)
    criterion = db.scalar(select(m.MatchCriterion).where(m.MatchCriterion.match_id == match.id,
        m.MatchCriterion.criterion_id == data.criterion_id))
    if criterion is None:
        raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
    if criterion.matched:
        raise AppError('PROOF_CONFLICT', 'Bu kriter için eşleşme kaydında kanıt mevcut.', 409)
    item = m.ProofRequest(match_criterion_id=criterion.id, title=data.title, instructions=data.instructions)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError('PROOF_CONFLICT', 'Bu kriter için açık bir kanıt isteği var.', 409)
    return serialize(record(db, item.id, user))


def submit(db, request_id, data, user):
    auth.require_role(user, 'candidate')
    request, criterion, match = record(db, request_id, user)
    evidence = []
    if data.project_id:
        project = auth.project_record(db, data.project_id, user)
        run = db.scalar(select(m.AnalysisRun).where(m.AnalysisRun.project_id == project.id,
            m.AnalysisRun.status == 'completed').order_by(m.AnalysisRun.completed_at.desc(), m.AnalysisRun.id).limit(1))
        if run:
            for e in db.scalars(select(m.SkillEvidence).where(m.SkillEvidence.analysis_run_id == run.id)):
                evidence.append(TraceEvidence(skill_label=e.skill_label, family=e.evidence_type, status=e.evidence_status,
                    strength=e.evidence_strength, summary=e.reason, excerpt=e.excerpt,
                    source_url=e.source_url, source_label=e.path or e.evidence_type))
        value = s.Submission(kind='project', title=project.name, source_url=project.source_url,
            note=data.note, status='linked', evidence=evidence)
    elif data.profile_evidence_id:
        item = db.get(m.ProfileEvidenceItem, data.profile_evidence_id)
        if item is None:
            raise AppError('NOT_FOUND', 'İstenen kayıt bulunamadı.', 404)
        auth.candidate_record(db, item.candidate_id, user)
        value = s.Submission(kind='profile', title=item.title, source_url=item.source_url,
            note=data.note, status=item.verification_status)
    else:
        value = s.Submission(kind='link', title='', source_url=data.source_url, note=data.note, status='linked')
    changed = db.execute(update(m.ProofRequest).where(m.ProofRequest.id == request.id,
        m.ProofRequest.status == 'open').values(status='submitted', submission=value.model_dump(mode='json'),
        submitted_at=utcnow(), resolved_at=None))
    if changed.rowcount != 1:
        db.rollback()
        raise AppError('PROOF_CONFLICT', 'İstek artık gönderime açık değil.', 409)
    db.commit()
    return serialize(record(db, request_id, user))


def review(db, request_id, data, user):
    auth.require_role(user, 'institution')
    request, _, _ = record(db, request_id, user)
    allowed = ['submitted'] if data.status in {'open', 'closed'} else ['open', 'submitted']
    try:
        changed = db.execute(update(m.ProofRequest).where(m.ProofRequest.id == request.id,
            m.ProofRequest.status.in_(allowed)).values(status=data.status,
            resolved_at=utcnow() if data.status != 'open' else None))
        if changed.rowcount != 1:
            db.rollback()
            raise AppError('PROOF_CONFLICT', 'İstek durumu bu işlem için uygun değil.', 409)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError('PROOF_CONFLICT', 'Bu kriter için açık bir istek var.', 409)
    return serialize(record(db, request_id, user))
