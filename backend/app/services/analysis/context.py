import json
from pathlib import PurePosixPath

from app.core.errors import AppError
from app.schemas.domain import ProjectAnalysisInput


def encode_context(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


def clip(text: str, size: int) -> str:
    return text.encode('utf-8')[:size].decode('utf-8', errors='ignore')


def file_kind(path: str) -> str:
    name = PurePosixPath(path).name.lower()
    if name.startswith('readme') or PurePosixPath(path).suffix.lower() in {'.md', '.rst', '.txt'} and name != 'requirements.txt':
        return 'readme'
    if name in {'requirements.txt', 'package.json', 'pyproject.toml', 'dockerfile'} or PurePosixPath(path).suffix.lower() in {'.toml', '.yaml', '.yml', '.json'}:
        return 'dependency_file'
    return 'source_file'


def project_context(data: ProjectAnalysisInput, max_bytes: int) -> dict:
    context = {'project_name': clip(data.name, 800), 'project_description': clip(data.description, 2000),
               'repository_url': data.snapshot.repository_url, 'commit_sha': data.snapshot.commit_sha,
               'readme': clip(data.snapshot.readme, 2500), 'languages': data.snapshot.languages,
               'files': []}
    # The actual serialized data budget is enforced, not a characters/4 token guess.
    if len(encode_context(context).encode('utf-8')) > max_bytes:
        raise AppError('ANALYSIS_FAILED', 'Proje metadata girdisi LLM bağlam sınırını aşıyor.', 422)
    for file in data.snapshot.files[:30]:
        if '\x00' in file.content:
            continue
        entry = {'path': file.path, 'kind': file_kind(file.path), 'excerpt': clip(file.content, 2500)}
        context['files'].append(entry)
        if len(encode_context(context).encode('utf-8')) > max_bytes:
            context['files'].pop()
            break
    return context
