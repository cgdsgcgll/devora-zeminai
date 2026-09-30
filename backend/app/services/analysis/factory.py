from app.core.config import Settings
from app.core.errors import AppError
from app.services.analysis.llm_analyzers import LLMNeedAnalyzer, ProjectSkillAnalyzer
from app.services.analysis.rules import RuleNeedAnalyzer, RuleSkillAnalyzer
from app.services.llm.openai_provider import OpenAIProvider


class UnconfiguredProvider:
    def __init__(self, name: str):
        self.name = name[:100]
        self.model = ''

    def generate_structured(self, **kwargs) -> str:
        raise AppError('LLM_NOT_CONFIGURED', 'Desteklenen LLM_PROVIDER değerleri: rule_based, openai.', 503)


def llm_provider(config: Settings):
    # Configuration errors occur during analysis so the run can be marked failed.
    if config.llm_provider != 'openai':
        return UnconfiguredProvider(config.llm_provider)
    return OpenAIProvider(api_key=config.llm_api_key, model=config.llm_model,
        timeout=config.llm_timeout_seconds, max_retries=config.llm_max_retries,
        max_output_tokens=config.llm_max_output_tokens)


def skill_analyzer(config: Settings):
    if config.llm_provider == 'rule_based':
        return RuleSkillAnalyzer()
    return ProjectSkillAnalyzer(llm_provider(config), config.llm_max_input_bytes)


def need_analyzer(config: Settings):
    if config.llm_provider == 'rule_based':
        return RuleNeedAnalyzer()
    return LLMNeedAnalyzer(llm_provider(config), config.llm_max_input_bytes)
