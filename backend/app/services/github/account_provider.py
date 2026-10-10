"""Fixed-origin, bounded GitHub App user-token metadata calls. No repository contents."""
import json
import re
import httpx
from app.core.errors import AppError
from app.schemas.github_account import GitHubInstallation, GitHubRepository


def provider_error():
    return AppError('GITHUB_PROVIDER_ERROR', 'GitHub doğrulaması tamamlanamadı.', 502, True)


def numeric_id(value):
    if type(value) is not int or not 0 < value < 10**20:
        raise provider_error()
    return str(value)


def login(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,99}', value):
        raise provider_error()
    return value


class GitHubAccountProvider:
    def __init__(self, transport=None):
        self.transport = transport

    def request(self, method, url, token=None, data=None, *, repository_access=False):
        # No query secrets, redirects, ambient credentials or unbounded response buffering.
        try:
            with httpx.Client(timeout=httpx.Timeout(10), follow_redirects=False,
                              trust_env=False, transport=self.transport) as client:
                headers = {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10'}
                if url == 'https://github.com/login/oauth/access_token':
                    headers['Accept'] = 'application/json'
                if token:
                    headers['Authorization'] = 'Bearer ' + token
                with client.stream(method, url, headers=headers, data=data) as response:
                    if response.status_code == 401:
                        raise AppError('GITHUB_CONNECTION_REVOKED', 'GitHub bağlantısını yeniden kurun.', 409)
                    if response.status_code == 403 and (
                            response.headers.get('x-ratelimit-remaining') == '0' or
                            'retry-after' in response.headers):
                        raise provider_error()
                    if repository_access and response.status_code in (403, 404):
                        raise AppError('GITHUB_REPOSITORY_NOT_ACCESSIBLE', 'GitHub erişimi doğrulanamadı.', 409)
                    if response.status_code != 200:
                        raise provider_error()
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body.extend(chunk)
                        if len(body) > 2_000_000:
                            raise provider_error()
                    result = json.loads(body)
                    if not isinstance(result, dict) or 'error' in result:
                        raise provider_error()
                    return result
        except (httpx.HTTPError, ValueError, UnicodeError):
            raise provider_error() from None

    def exchange(self, config, **fields):
        result = self.request('POST', 'https://github.com/login/oauth/access_token', data={
            'client_id': config.github_app_client_id,
            'client_secret': config.github_app_client_secret, **fields})
        access = result.get('access_token')
        if not isinstance(access, str) or not re.fullmatch(r'ghu_[A-Za-z0-9_]{10,500}', access):
            raise provider_error()
        if result.get('token_type') != 'bearer':
            raise provider_error()
        exp, refresh, rexp = (result.get(k) for k in ('expires_in', 'refresh_token', 'refresh_token_expires_in'))
        if any(x is not None for x in (exp, refresh, rexp)):
            if (type(exp) is not int or not 60 <= exp <= 86400 or
                    type(rexp) is not int or not 60 <= rexp <= 366*86400 or
                    not isinstance(refresh, str) or not re.fullmatch(r'ghr_[A-Za-z0-9_]{10,500}', refresh)):
                raise provider_error()
        return access, refresh, exp, rexp

    def user(self, token):
        value = self.request('GET', 'https://api.github.com/user', token)
        if value.get('type') != 'User':
            raise provider_error()
        return numeric_id(value.get('id')), login(value.get('login'))

    def collection(self, path, field, limit, token):
        items, expected, seen = [], None, set()
        for page in range(1, limit // 100 + 2):
            result = self.request('GET', f'https://api.github.com{path}?per_page=100&page={page}', token,
                                  repository_access=True)
            total, batch = result.get('total_count'), result.get(field)
            if type(total) is not int or total < 0 or not isinstance(batch, list) or len(batch) > 100:
                raise provider_error()
            if total > limit:
                raise AppError('GITHUB_POOL_LIMIT_EXCEEDED', 'GitHub erişim listesi desteklenen sınırı aşıyor.', 409)
            if expected is not None and total != expected:
                raise provider_error()  # A changing pool must be retried, never partially verified.
            expected = total
            for item in batch:
                if not isinstance(item, dict):
                    raise provider_error()
                identity = numeric_id(item.get('id'))
                if identity in seen:
                    raise provider_error()
                seen.add(identity)
            items.extend(batch)
            if len(items) == total:
                return items
            if len(items) > total or len(batch) != 100:
                raise provider_error()
        raise provider_error()

    def installations(self, token):
        values = self.collection('/user/installations', 'installations', 100, token)
        output = []
        for value in values:
            account = value.get('account')
            if not isinstance(account, dict) or account.get('type') not in ('User', 'Organization'):
                raise provider_error()
            if value.get('suspended_at'):
                continue
            output.append(GitHubInstallation(id=numeric_id(value['id']), account_id=numeric_id(account.get('id')),
                account_login=login(account.get('login')), account_type=account['type']))
        return output

    def repositories(self, token, installation_id):
        if installation_id not in {v.id for v in self.installations(token)}:
            raise AppError('GITHUB_REPOSITORY_NOT_ACCESSIBLE', 'Kurulum erişimi doğrulanamadı.', 409)
        values = self.collection(f'/user/installations/{installation_id}/repositories', 'repositories', 500, token)
        output = []
        for value in values:
            owner = value.get('owner')
            full_name = value.get('full_name')
            if (not isinstance(owner, dict) or owner.get('type') not in ('User', 'Organization') or
                    not isinstance(full_name, str) or not re.fullmatch(r'[A-Za-z0-9-]+/[A-Za-z0-9_.-]{1,100}', full_name)):
                raise provider_error()
            owner_login = login(owner.get('login'))
            if full_name.split('/')[0].casefold() != owner_login.casefold():
                raise provider_error()
            url = value.get('html_url')
            if url != 'https://github.com/' + full_name:
                raise provider_error()
            permissions = value.get('permissions', {})
            if not isinstance(permissions, dict) or any(type(v) is not bool for v in permissions.values()):
                raise provider_error()
            permissions = {k: v for k, v in permissions.items() if k in {'admin','maintain','push','triage','pull'}}
            if type(value.get('private', True)) is not bool:
                raise provider_error()
            output.append(GitHubRepository(private=value.get('private', True), id=numeric_id(value['id']), full_name=full_name, html_url=url,
                owner_id=numeric_id(owner.get('id')), owner_login=owner_login, owner_type=owner['type'], permissions=permissions))
        return output


def get_account_provider():
    return GitHubAccountProvider()
