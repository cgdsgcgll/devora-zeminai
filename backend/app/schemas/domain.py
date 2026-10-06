from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.core.skills import normalize_skill
from app.core.criteria import CATALOG, CriterionKind, normalize_criterion_key
from app.schemas.profile import ProfileEvidenceItem


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EvidenceStatus(str, Enum):
    observed = 'observed'
    declared_only = 'declared_only'
    not_found = 'not_found'


class EvidenceStrength(str, Enum):
    weak = 'weak'
    medium = 'medium'
    strong = 'strong'


class EvidenceType(str, Enum):
    project_description = 'project_description'
    readme = 'readme'
    source_file = 'source_file'
    dependency_file = 'dependency_file'
    repository_language = 'repository_language'
    user_claim = 'user_claim'


class Priority(str, Enum):
    required = 'required'
    preferred = 'preferred'


class Contract(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra='forbid', str_strip_whitespace=True)


Name = Annotated[str, Field(min_length=1, max_length=200)]
SkillKey = Annotated[str, Field(pattern=r'^[a-z][a-z0-9_-]{0,63}$')]


class Entity(Contract):
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=utcnow)


class CandidateCreate(Contract):
    name: Name


class NeedDetailsPatch(Contract):
    """Editable presentation details; scoring criteria remain immutable."""
    target_role: str | None = Field(default=None, max_length=200)
    expected_output: str | None = Field(default=None, max_length=20000)


class Candidate(Entity, CandidateCreate):
    updated_at: datetime


class ProjectCreate(Contract):
    name: Name
    description: str = Field(default='', max_length=20000)
    source_type: Literal['github'] = 'github'
    source_url: str = Field(max_length=500)

    @field_validator('source_url')
    @classmethod
    def valid_source(cls, value: str) -> str:
        from app.services.github.url import normalize_repository_url
        return normalize_repository_url(value)


class Project(Entity, ProjectCreate):
    candidate_id: UUID
    updated_at: datetime


class SnapshotFile(Contract):
    path: str
    content: str
    sha: str
    source_url: str


class SnapshotData(Contract):
    repository_url: str
    default_branch: str
    commit_sha: str
    readme: str = ''
    languages: dict[str, int] = Field(default_factory=dict)
    files: list[SnapshotFile] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    fetched_at: datetime = Field(default_factory=utcnow)


class RepositorySnapshot(SnapshotData):
    id: UUID
    project_id: UUID


class EvidenceInput(Contract):
    skill_key: SkillKey
    skill_label: Name
    evidence_status: EvidenceStatus
    evidence_strength: EvidenceStrength
    evidence_type: EvidenceType
    source_url: str
    path: str | None = None
    excerpt: str = Field(max_length=4000)
    reason: str
    limitations: list[str] = Field(default_factory=list)

    _normalize = field_validator('skill_key', mode='before')(normalize_skill)


class SkillEvidence(Entity, EvidenceInput):
    candidate_id: UUID
    project_id: UUID
    snapshot_id: UUID
    analysis_run_id: UUID


class CriterionInput(Contract):
    kind: CriterionKind = 'technical_skill'
    skill_key: SkillKey
    skill_label: Name
    priority: Priority
    reason: str | None = None

    _normalize = field_validator('skill_key', mode='before')(normalize_criterion_key)

    @model_validator(mode='after')
    def supported_family(self):
        if self.kind != 'technical_skill' and (self.skill_key not in CATALOG or CATALOG[self.skill_key][0] != self.kind):
            raise ValueError('Unsupported criterion key for this evidence family.')
        if self.kind == 'technical_skill' and self.skill_key in CATALOG:
            raise ValueError('Profile criteria cannot be technical skills.')
        return self


class NeedCriterion(Entity, CriterionInput):
    need_id: UUID


class NeedCreate(Contract):
    description: str = Field(min_length=1, max_length=20000)
    target_role: str | None = Field(default=None, max_length=200)
    expected_output: str | None = Field(default=None, max_length=2000)
    # Explicit criteria take precedence over the limited natural-language parser.
    criteria: list[CriterionInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode='after')
    def unique_keys(self):
        if len({c.skill_key for c in self.criteria}) != len(self.criteria):
            raise ValueError('A skill may appear only once in need criteria.')
        return self


class OrganizationNeed(Entity):
    description: str
    target_role: str | None
    expected_output: str | None
    updated_at: datetime
    criteria: list[NeedCriterion]
    uncertainties: list[str]
    analysis_version: str


class ProjectAnalysisInput(Contract):
    candidate_id: UUID
    project_id: UUID
    name: str
    description: str
    snapshot: SnapshotData


class ProjectAnalysisResult(Contract):
    skills: list[SkillKey]
    evidence: list[EvidenceInput]
    limitations: list[str]
    uncertainties: list[str]
    analysis_version: str
    analyzed_at: datetime = Field(default_factory=utcnow)

    @model_validator(mode='after')
    def consistent_skills(self):
        if set(self.skills) != {e.skill_key for e in self.evidence}:
            raise ValueError('Skills and evidence keys must agree.')
        return self


class NeedAnalysisInput(Contract):
    need_id: UUID
    description: str
    target_role: str | None = None
    expected_output: str | None = None


class NeedAnalysisResult(Contract):
    criteria: list[CriterionInput]
    uncertainties: list[str]
    analysis_version: str

    @model_validator(mode='after')
    def unique_keys(self):
        if len({c.skill_key for c in self.criteria}) != len(self.criteria):
            raise ValueError('Duplicate criteria.')
        return self


class AnalysisRun(Contract):
    id: UUID
    project_id: UUID | None
    need_id: UUID | None
    analysis_type: Literal['project', 'need']
    status: Literal['running', 'completed', 'failed']
    analysis_version: str
    started_at: datetime
    completed_at: datetime | None
    error_code: str | None
    error_message: str | None
    limitations: list[str]
    uncertainties: list[str]
    provider: str | None = None
    model: str | None = None
    commit_sha: str | None = None


class TraceEvidence(Contract):
    skill_label: str = ''
    family: str
    status: Literal['observed', 'declared_only', 'not_found', 'linked', 'verified']
    strength: Literal['weak', 'medium', 'strong'] | None = None
    summary: str
    excerpt: str = ''
    source_url: str | None = None
    source_label: str = ''


class CriterionMatch(Contract):
    trace_available: bool = False
    trace_items: list[TraceEvidence] = Field(default_factory=list)
    kind: CriterionKind = 'technical_skill'
    profile_evidence: list[ProfileEvidenceItem] = Field(default_factory=list)
    criterion_id: UUID
    skill_key: SkillKey
    skill_label: str
    priority: Priority
    matched: bool
    evidence_ids: list[UUID]
    explanation: str


class MatchCalculation(Contract):
    score: float = Field(ge=0, le=100)
    score_type: Literal['observable_evidence_coverage'] = 'observable_evidence_coverage'
    required_coverage: float = Field(ge=0, le=1)
    preferred_coverage: float = Field(ge=0, le=1)
    score_explanation: str
    strengths: list[str]
    gaps: list[str]
    uncertainties: list[str]
    analysis_version: str
    scoring_version: Literal['evidence-coverage-v0.1', 'evidence-coverage-v0.2', 'evidence-coverage-v0.3'] = 'evidence-coverage-v0.2'
    matched_criteria: list[CriterionMatch]
    unmatched_criteria: list[CriterionMatch]


class MatchCreate(Contract):
    candidate_id: UUID
    need_id: UUID


class MatchResult(Entity, MatchCalculation):
    anonymous: bool = False
    candidate_label: str = ""
    candidate_id: UUID
    need_id: UUID


class AnalysisResponse(Contract):
    run: AnalysisRun
    snapshot: RepositorySnapshot
    result: ProjectAnalysisResult
    evidence: list[SkillEvidence]


class ErrorDetail(Contract):
    code: str
    message: str
    retryable: bool
    details: dict


class ErrorResponse(Contract):
    error: ErrorDetail


class Health(Contract):
    status: Literal['ok', 'degraded']
    service: Literal['zeminai-api'] = 'zeminai-api'
    database: Literal['ok', 'unavailable']
