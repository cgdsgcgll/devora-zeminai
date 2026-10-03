import base64

import httpx
import pytest

from app.core.errors import AppError
from app.services.github.provider import GitHubProvider, MAX_FILE_BYTES
from app.services.github.url import normalize_repository_url


def mock_transport(status=200, private=False):
    def handle(request):
        path = request.url.path
        if status != 200:
            return httpx.Response(status, headers={'x-ratelimit-remaining': '0'} if status == 403 else {}, json={})
        if path.endswith('/repos/test/repo'):
            return httpx.Response(200, json={'private': private, 'default_branch': 'main'})
        if '/commits/' in path:
            return httpx.Response(200, json={'sha': 'a'*40, 'commit': {'tree': {'sha': 'b'*40}}})
        if '/git/trees/' in path:
            return httpx.Response(200, json={'truncated': True, 'tree': [
                {'path': 'README.md', 'type': 'blob', 'mode': '100644', 'size': 12, 'sha': 'readme'},
                {'path': 'app.py', 'type': 'blob', 'mode': '100644', 'size': 100, 'sha': 'source'},
                {'path': 'big.py', 'type': 'blob', 'mode': '100644', 'size': MAX_FILE_BYTES+1, 'sha': 'big'},
                {'path': 'image.png', 'type': 'blob', 'mode': '100644', 'size': 20, 'sha': 'binary'},
                {'path': 'vendor/a.py', 'type': 'blob', 'mode': '100644', 'size': 20, 'sha': 'vendor'}]})
        if path.endswith('/languages'):
            return httpx.Response(200, json={'Python': 100})
        if '/git/blobs/' in path:
            content = 'FastAPI demo' if path.endswith('readme') else 'from fastapi import FastAPI\napp = FastAPI()'
            assert not path.endswith(('big', 'binary', 'vendor'))
            return httpx.Response(200, json={'encoding': 'base64', 'content': base64.b64encode(content.encode()).decode()})
        raise AssertionError(str(request.url))
    return httpx.MockTransport(handle)


def test_snapshot_is_commit_pinned_and_bounded():
    snapshot = GitHubProvider(transport=mock_transport()).fetch('https://github.com/test/repo.git')
    assert snapshot.commit_sha == 'a'*40
    assert snapshot.readme == 'FastAPI demo'
    assert len(snapshot.files) == 2
    assert all('/blob/' + 'a'*40 + '/' in f.source_url for f in snapshot.files)
    assert any('kısalttı' in limit for limit in snapshot.limitations)


@pytest.mark.parametrize('status,code,retryable', [
    (404, 'SOURCE_UNREACHABLE', False), (403, 'GITHUB_FETCH_FAILED', True),
    (500, 'GITHUB_FETCH_FAILED', True), (429, 'GITHUB_FETCH_FAILED', True)])
def test_upstream_errors(status, code, retryable):
    with pytest.raises(AppError) as caught:
        GitHubProvider(transport=mock_transport(status)).fetch('https://github.com/test/repo')
    assert (caught.value.code, caught.value.retryable) == (code, retryable)


def test_private_repository_rejected_even_with_token():
    with pytest.raises(AppError) as caught:
        GitHubProvider(transport=mock_transport(private=True)).fetch('https://github.com/test/repo')
    assert caught.value.code == 'SOURCE_NOT_PUBLIC'


@pytest.mark.parametrize('url', ['http://github.com/a/b', 'https://github.com.evil/a/b',
    'https://user@github.com/a/b', 'https://github.com/a/b/tree/main', 'https://127.0.0.1/a/b',
    'https://github.com/a/b?x=y', 'https://github.com/a/..'])
def test_invalid_urls(url):
    with pytest.raises(AppError):
        normalize_repository_url(url)


def test_timeout():
    def handle(request):
        raise httpx.ReadTimeout('timeout', request=request)
    with pytest.raises(AppError) as caught:
        GitHubProvider(transport=httpx.MockTransport(handle)).fetch('https://github.com/test/repo')
    assert caught.value.code == 'SOURCE_UNREACHABLE'


def test_malformed_upstream():
    with pytest.raises(AppError) as caught:
        GitHubProvider(transport=httpx.MockTransport(lambda request: httpx.Response(200, text='oops'))).fetch('https://github.com/test/repo')
    assert caught.value.code == 'GITHUB_FETCH_FAILED'


def test_file_count_limit_and_binary_skip():
    calls = []

    def handle(request):
        path = request.url.path
        calls.append(path)
        if '/git/trees/' in path:
            return httpx.Response(200, json={'tree': [
                {'path': f'{i:02}.py', 'type': 'blob', 'mode': '100644', 'size': 10, 'sha': str(i)}
                for i in range(50)]})
        if '/git/blobs/' in path:
            return httpx.Response(200, json={'encoding': 'base64', 'content': base64.b64encode(b'\x00binary').decode()})
        return mock_transport().handle_request(request)

    snapshot = GitHubProvider(transport=httpx.MockTransport(handle)).fetch('https://github.com/test/repo')
    assert len([p for p in calls if '/git/blobs/' in p]) == 30
    assert snapshot.files == []


def test_http_response_size_limit():
    provider = GitHubProvider()
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, text='x'*50))) as client:
        with pytest.raises(AppError) as caught:
            provider._get(client, 'https://api.github.com/repos/a/b', max_bytes=20)
    assert caught.value.code == 'GITHUB_FETCH_FAILED'


@pytest.mark.parametrize('url', [
    'file:///etc/passwd', 'https://localhost/a/b', 'https://10.0.0.1/a/b',
    'https://169.254.169.254/latest/meta-data', 'https://[::1]/a/b',
    'https://github.com:8443/a/b', 'https://github.com/a/%2e%2e',
    'https://github.com/a/b#fragment',
])
def test_ssrf_inputs_rejected_before_network(url):
    def handle(request):
        pytest.fail('Untrusted URL reached HTTP transport')

    with pytest.raises(AppError) as caught:
        GitHubProvider(transport=httpx.MockTransport(handle)).fetch(url)
    assert caught.value.code == 'INVALID_SOURCE_URL'


@pytest.mark.parametrize('status', [301, 302, 307, 308])
def test_redirect_cannot_reach_internal_host(status):
    calls = []

    def handle(request):
        calls.append(str(request.url))
        assert request.url.host == 'api.github.com'
        return httpx.Response(status, headers={'Location': 'http://127.0.0.1/private'}, text='redirect')

    with pytest.raises(AppError):
        GitHubProvider(transport=httpx.MockTransport(handle)).fetch('https://github.com/test/repo')
    assert calls == ['https://api.github.com/repos/test/repo']
