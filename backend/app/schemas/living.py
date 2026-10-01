from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator
from app.schemas.profile import ProfileContract


class CountFact(ProfileContract):
    label: str
    count: int


class PassportFact(ProfileContract):
    family: str
    status: Literal['declared_only', 'linked', 'observed', 'verified', 'not_found']
    count: int


class TimelineItem(ProfileContract):
    id: UUID
    date: date
    date_basis: Literal['started_at', 'issued_at', 'ended_at', 'recorded_at']
    category: str
    title: str
    organization: str
    role: str
    status: Literal['declared_only', 'linked', 'observed', 'verified']
    source_url: str | None


class LivingProfile(ProfileContract):
    candidate_id: UUID
    summary: list[CountFact]
    talent_map: dict[str, list[CountFact]]
    passport: list[PassportFact]
    timeline: list[TimelineItem]
    limitations: list[str]


class GapItem(ProfileContract):
    criterion_id: UUID
    label: str
    priority: str
    state: Literal['strength', 'required_gap', 'preferred_gap']
    explanation: str
    next_step: str | None


class GapSummary(ProfileContract):
    match_id: UUID
    items: list[GapItem]


class EvidenceReference(ProfileContract):
    family: str
    status: str
    count: int
    # Deliberately no free text, school, URL or author identity in anonymous view.


class DiscoveryCriterion(ProfileContract):
    criterion_id: UUID
    label: str
    family: str
    priority: str
    matched: bool
    sources: list[EvidenceReference]


class DiscoveryCandidate(ProfileContract):
    candidate_id: UUID
    label: str
    score: float
    required_coverage: float
    preferred_coverage: float
    criteria: list[DiscoveryCriterion]


class Discovery(ProfileContract):
    need_id: UUID
    anonymous: bool
    offset: int
    limit: int
    has_more: bool
    candidates: list[DiscoveryCandidate]
    ordering: str
    limitations: list[str]


class TeamCreate(ProfileContract):
    candidate_ids: list[UUID] = Field(min_length=2, max_length=4)
    anonymous: bool = True

    @model_validator(mode='after')
    def unique_candidates(self):
        if len(set(self.candidate_ids)) != len(self.candidate_ids):
            raise ValueError('Select distinct candidates.')
        return self


class TeamSupport(ProfileContract):
    candidate_id: UUID
    label: str
    sources: list[EvidenceReference]


class TeamCriterion(ProfileContract):
    criterion_id: UUID
    label: str
    priority: str
    supporters: list[TeamSupport]


class TeamCoverage(ProfileContract):
    need_id: UUID
    required_coverage: float
    preferred_coverage: float
    matched_count: int
    total_count: int
    criteria: list[TeamCriterion]
    limitations: list[str]
