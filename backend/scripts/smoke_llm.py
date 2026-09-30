"""Optional paid live smoke test: run from backend with python scripts/smoke_llm.py."""
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.errors import AppError
from app.schemas.domain import NeedAnalysisInput, ProjectAnalysisInput, SnapshotData, SnapshotFile
from app.services.analysis.factory import need_analyzer, skill_analyzer


def main() -> int:
    if settings.llm_provider != 'openai' or not settings.llm_api_key or not settings.llm_model:
        print('SKIPPED: Set LLM_PROVIDER=openai, LLM_MODEL and LLM_API_KEY for the optional live test.')
        return 0
    snapshot = SnapshotData(repository_url='https://github.com/example/smoke', default_branch='main', commit_sha='a'*40,
        readme='FastAPI sample', languages={'Python': 60}, files=[SnapshotFile(path='app.py', sha='b'*40,
            content='from fastapi import FastAPI\napp = FastAPI()',
            source_url='https://github.com/example/smoke/blob/' + 'a'*40 + '/app.py')])
    try:
        project = skill_analyzer(settings).analyze_project(ProjectAnalysisInput(candidate_id=uuid4(),
            project_id=uuid4(), name='Synthetic smoke sample', description='', snapshot=snapshot))
        need = need_analyzer(settings).analyze_need(NeedAnalysisInput(need_id=uuid4(),
            description='Python ve FastAPI zorunlu, Docker tercih sebebi.'))
        assert any(e.skill_key == 'fastapi' and e.evidence_status == 'observed' for e in project.evidence)
        assert {c.skill_key: c.priority.value for c in need.criteria} == {
            'python': 'required', 'fastapi': 'required', 'docker': 'preferred'}
        print('PASSED: Live structured project and need outputs validated, including evidence grounding.')
        print(project.model_dump_json(indent=2))
        print(need.model_dump_json(indent=2))
        return 0
    except AppError as exc:
        print(f'FAILED: {exc.code}: {exc.message}')
        return 1
    except AssertionError:
        print('FAILED: Structured output was parsed, but expected smoke semantics were not satisfied.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
