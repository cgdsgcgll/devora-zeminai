from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.errors import AppError
from app.schemas.domain import (NeedAnalysisInput, NeedAnalysisResult,
                                ProjectAnalysisInput, ProjectAnalysisResult)


class SkillAnalyzer(Protocol):
    version: str

    def analyze_project(self, data: ProjectAnalysisInput) -> ProjectAnalysisResult: ...


class NeedAnalyzer(Protocol):
    version: str

    def analyze_need(self, data: NeedAnalysisInput) -> NeedAnalysisResult: ...


T = TypeVar('T', bound=BaseModel)


def validate_model_output(schema: type[T], raw: str | dict | BaseModel) -> T:
    """All future LLM adapters must validate untrusted outputs before persistence."""
    try:
        if isinstance(raw, BaseModel):
            raw = raw.model_dump()
        return schema.model_validate_json(raw) if isinstance(raw, str) else schema.model_validate(raw)
    except (ValidationError, ValueError, TypeError) as exc:
        raise AppError('INVALID_MODEL_OUTPUT', 'Analiz sağlayıcısı geçerli veri sözleşmesi döndürmedi.', 502) from exc
