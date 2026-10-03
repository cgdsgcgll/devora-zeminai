"""One repair of a domain-grounding rejection, independent of HTTP retries."""
import logging
from collections.abc import Callable
from typing import TypeVar

from app.core.errors import AppError
from app.services.llm.base import LLMProvider

logger = logging.getLogger(__name__)
T = TypeVar('T')

# Only developer-authored reasons enter instructions/logs. Never interpolate model output.
REPAIR_REASONS = {
    'source_reference': 'A cited path, source kind or exact excerpt did not match the supplied source material.',
    'skill_support': 'A skill was not directly supported by its cited excerpt.',
    'canonical_key': 'A canonical key and label were inconsistent or invalid.',
    'need_excerpt': 'A criterion did not cite an exact excerpt of the supplied need text.',
    'criterion_support': 'A technical criterion was outside the supported catalog or not explicitly named in its excerpt.',
    'profile_support': 'An experience criterion was not explicitly requested in the cited need text.',
    'domain_constraints': 'The output violated domain limits or contained invalid or duplicate entries.',
}


class GroundingFailure(AppError):
    def __init__(self, message: str, category: str):
        if category not in REPAIR_REASONS:
            raise ValueError('Unknown validation category')
        super().__init__('INVALID_MODEL_OUTPUT', message, 502)
        self.category = category


def generate_validated(provider: LLMProvider, *, instructions: str, context: str,
                       schema: dict, schema_name: str, validate: Callable[[str], T]) -> T:
    current_instructions = instructions
    for attempt in (1, 2):
        # Provider transport/config/envelope failures are NOT semantic repair triggers.
        raw = provider.generate_structured(instructions=current_instructions, context=context,
                                          schema=schema, schema_name=schema_name)
        try:
            return validate(raw)
        except GroundingFailure as error:
            logger.warning('llm_grounding_rejected analysis_type=%s attempt=%d category=%s',
                           schema_name, attempt, error.category)
            if attempt == 2:
                raise error from None
            current_instructions = instructions + '\n\nSemantic repair (one attempt only): ' + REPAIR_REASONS[error.category] + '''
Rebuild the complete response using ONLY the same supplied UNTRUSTED DATA.
Return only skills/criteria directly supported by exact excerpts; never invent evidence or requirements.
Preserve required/preferred meaning. Use the supported canonical keys and faithful source labels.
Do not broaden concepts or infer expertise. Keep all original schema and grounding rules.
No previous model output is authoritative. No new source material is available.'''
    raise AssertionError('Unreachable')
