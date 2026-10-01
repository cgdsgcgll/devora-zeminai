import re
from urllib.parse import urlsplit

from app.core.errors import AppError


def normalize_repository_url(value: str) -> str:
    try:
        parts = urlsplit(value.strip())
        valid = (parts.scheme == 'https' and parts.netloc.lower() == 'github.com'
                 and not parts.query and not parts.fragment)
        path = parts.path.rstrip('/')
        if path.endswith('.git'):
            path = path[:-4]
        valid = valid and bool(re.fullmatch(r'/[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}', path))
        valid = valid and path.split('/')[-1] not in {'.', '..'}
    except ValueError:
        valid = False
    if not valid:
        raise AppError('INVALID_SOURCE_URL', 'Herkese açık https://github.com/owner/repo adresi kullanın.', 422)
    return 'https://github.com' + path
