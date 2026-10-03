from uuid import UUID

from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Candidate, ProfileEvidenceItem
from app.schemas.profile import ProfileEvidenceCreate, ProfileEvidencePatch
from app.services.workflows import get_or_404


def values(data: ProfileEvidenceCreate):
    result = data.model_dump(exclude={'metadata_json'})
    result['metadata_json'] = data.metadata_json.model_dump(mode='json', exclude_none=True)
    result['verification_status'] = 'linked' if data.source_url else 'declared_only'
    return result


def create(db: Session, candidate_id: UUID, data: ProfileEvidenceCreate):
    get_or_404(db, Candidate, candidate_id)
    row = ProfileEvidenceItem(candidate_id=candidate_id, **values(data))
    db.add(row)
    db.commit()
    return row


def list_items(db: Session, candidate_id: UUID):
    get_or_404(db, Candidate, candidate_id)
    return db.scalars(select(ProfileEvidenceItem).where(ProfileEvidenceItem.candidate_id == candidate_id)
                      .order_by(ProfileEvidenceItem.created_at, ProfileEvidenceItem.id)).all()


def update(db: Session, evidence_id: UUID, data: ProfileEvidencePatch):
    row = get_or_404(db, ProfileEvidenceItem, evidence_id)
    existing = {key: getattr(row, key) for key in ProfileEvidenceCreate.model_fields}
    try:
        merged = ProfileEvidenceCreate.model_validate({**existing, **data.model_dump(exclude_unset=True)})
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc
    for key, value in values(merged).items():
        setattr(row, key, value)
    db.commit()
    return row
