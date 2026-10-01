from pydantic import BaseModel, ConfigDict

from app.schemas.domain import EvidenceStatus, EvidenceStrength, EvidenceType, Priority
from app.core.criteria import CriterionKind


class Structured(BaseModel):
    # All fields required (nullable fields still required), no extra properties: strict JSON Schema.
    model_config = ConfigDict(extra='forbid', strict=True)


class EvidenceDraft(Structured):
    skill_key: str
    skill_label: str
    evidence_status: EvidenceStatus
    evidence_strength: EvidenceStrength
    evidence_type: EvidenceType
    path: str | None
    excerpt: str
    reason: str
    limitations: list[str]


class ProjectDraft(Structured):
    evidence: list[EvidenceDraft]
    limitations: list[str]
    uncertainties: list[str]


class CriterionDraft(Structured):
    kind: CriterionKind
    skill_key: str
    skill_label: str
    priority: Priority
    reason: str
    source_excerpt: str


class NeedDraft(Structured):
    criteria: list[CriterionDraft]
    uncertainties: list[str]
