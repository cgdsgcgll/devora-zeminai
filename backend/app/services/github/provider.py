import base64
import binascii
import json
from pathlib import PurePosixPath
from urllib.parse import quote

import httpx

from app.core.errors import AppError
from app.schemas.domain import SnapshotData, SnapshotFile
from app.services.github.url import normalize_repository_url

MAX_FILES = 30
MAX_FILE_BYTES = 100_000
MAX_TOTAL_BYTES = 1_000_000
MAX_RESPONSE_BYTES = 8_000_000
TEXT_SUFFIXES = {'.py', '.js', '.jsx', '.ts', '.tsx', '.json', '.toml', '.txt', '.md', '.yml', '.yaml', '.sql'}
SKIP_PARTS = {'node_modules', 'vendor', 'dist', 'build', '.git', '.venv', 'venv'}


class GitHubProvider:
    """Bounded public GitHub reader. Content is data, never executable instructions."""

    def __init__(self, token: str = '', transport: httpx.BaseTransport | None = None):
        self.token = token
        self.transport = transport

    def _get(self, client: httpx.Client, path: str, max_bytes: int = MAX_RESPONSE_BYTES) -> dict:
        try:
            with client.stream('GET', path) as response:
                if response.status_code == 404:
                    raise AppError('SOURCE_UNREACHABLE', 'Repository bulunamadı veya herkese açık değil.', 404)
                if response.status_code in {401, 403, 429}:
                    limited = response.status_code == 429 or response.headers.get('x-ratelimit-remaining') == '0'
                    raise AppError('GITHUB_FETCH_FAILED', 'GitHub erişimi reddedildi veya hız sınırına ulaşıldı.',
                                   503 if limited else 502, limited,
                                   {'upstream_status': response.status_code})
                if response.status_code >= 400:
                    raise AppError('GITHUB_FETCH_FAILED', 'GitHub verisi alınamadı.', 502,
                                   response.status_code >= 500)
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > max_bytes:
                        raise AppError('GITHUB_FETCH_FAILED', 'GitHub yanıtı boyut sınırını aştı.', 502)
                payload = json.loads(data)
                if not isinstance(payload, dict):
                    raise ValueError('Expected object')
                return payload
        except httpx.RequestError as exc:
            raise AppError('SOURCE_UNREACHABLE', 'GitHub bağlantısı kurulamadı.', 502, True) from exc
        except (ValueError, UnicodeError) as exc:
            raise AppError('GITHUB_FETCH_FAILED', 'GitHub yanıtı geçersiz.', 502) from exc

    def fetch(self, url: str) -> SnapshotData:
        url = normalize_repository_url(url)
        repo = url.removeprefix('https://github.com/')
        headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        with httpx.Client(base_url='https://api.github.com', headers=headers,
                          timeout=15, follow_redirects=False, transport=self.transport) as client:
            try:
                metadata = self._get(client, f'/repos/{repo}')
                if metadata.get('private') is not False:
                    raise AppError('SOURCE_NOT_PUBLIC', 'Yalnızca herkese açık repository destekleniyor.', 422)
                branch = metadata['default_branch']
                commit = self._get(client, f'/repos/{repo}/commits/{quote(branch, safe="")}')
                sha = commit['sha']
                tree_sha = commit['commit']['tree']['sha']
                tree = self._get(client, f'/repos/{repo}/git/trees/{tree_sha}?recursive=1')
                languages = self._get(client, f'/repos/{repo}/languages')
                limitations = ['Dosyalar sınırlı örneklenmiştir; incelenmeyen dosyalarda ek kanıt bulunabilir.',
                               'GitHub dil bilgisi güncel repository metadatasıdır; commit anına sabitlenemez.']
                if tree.get('truncated'):
                    limitations.append('GitHub dosya ağacını kısalttı.')
                eligible = []
                for entry in tree['tree']:
                    path = PurePosixPath(entry['path'])
                    if (entry['type'] == 'blob' and entry.get('mode') in {'100644', '100755'}
                        and not SKIP_PARTS.intersection(path.parts)
                        and (path.suffix.lower() in TEXT_SUFFIXES or path.name == 'Dockerfile')
                        and entry.get('size', MAX_FILE_BYTES + 1) <= MAX_FILE_BYTES):
                        eligible.append(entry)
                eligible.sort(key=lambda e: (not PurePosixPath(e['path']).name.lower().startswith('readme'),
                                             PurePosixPath(e['path']).name not in {'requirements.txt', 'package.json', 'pyproject.toml'},
                                             e['path']))
                files = []
                total = 0
                for entry in eligible[:MAX_FILES]:
                    blob = self._get(client, f'/repos/{repo}/git/blobs/{entry["sha"]}', MAX_FILE_BYTES * 2)
                    if blob.get('encoding') != 'base64':
                        limitations.append(f'Atlandı (encoding): {entry["path"]}')
                        continue
                    encoded = blob['content']
                    if len(encoded) > MAX_FILE_BYTES * 2:
                        continue
                    raw = base64.b64decode(encoded.replace('\n', ''), validate=True)
                    if len(raw) > MAX_FILE_BYTES or total + len(raw) > MAX_TOTAL_BYTES:
                        continue
                    if b'\x00' in raw:
                        continue
                    try:
                        content = raw.decode('utf-8')
                    except UnicodeDecodeError:
                        continue
                    total += len(raw)
                    files.append(SnapshotFile(path=entry['path'], content=content, sha=entry['sha'],
                                              source_url=f'{url}/blob/{sha}/{quote(entry["path"], safe="/")}'))
                readme = next((f.content for f in files if PurePosixPath(f.path).name.lower().startswith('readme')), '')
                return SnapshotData(repository_url=url, default_branch=branch, commit_sha=sha,
                                    readme=readme, languages=languages, files=files, limitations=limitations)
            except (KeyError, TypeError, ValueError, binascii.Error) as exc:
                raise AppError('GITHUB_FETCH_FAILED', 'GitHub repository verisi geçersiz veya eksik.', 502) from exc
