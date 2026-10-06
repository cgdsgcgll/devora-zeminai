from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import Field, field_validator, model_validator
from app.schemas.profile import ProfileContract, safe_profile_url
from app.schemas.domain import TraceEvidence


class ProofCreate(ProfileContract):
    match_id: UUID
    criterion_id: UUID
    title: str = Field(min_length=1, max_length=200)
    instructions: str = Field(min_length=1, max_length=4000)


class ProofSubmit(ProfileContract):
    project_id: UUID | None = None
    profile_evidence_id: UUID | None = None
    source_url: str | None = Field(default=None, max_length=2000)
    note: str = Field(default='', max_length=4000)
    _url = field_validator('source_url')(safe_profile_url)

    @model_validator(mode='after')
    def one_source(self):
        if sum(x is not None for x in (self.project_id, self.profile_evidence_id, self.source_url)) != 1:
            raise ValueError('Choose exactly one source.')
        return self


class ProofReview(ProfileContract):
    status: Literal['open', 'closed', 'cancelled']


class Submission(ProfileContract):
    kind: Literal['project', 'profile', 'link']
    title: str
    source_url: str | None
    note: str
    status: Literal['observed', 'declared_only', 'linked', 'verified']
    evidence: list[TraceEvidence] = Field(default_factory=list)


class ProofItem(ProfileContract):
    id: UUID
    match_id: UUID
    candidate_id: UUID
    need_id: UUID
    criterion_id: UUID
    criterion_label: str
    title: str
    instructions: str
    status: Literal['open', 'submitted', 'closed', 'cancelled']
    submission: Submission | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    resolved_at: datetime | None
