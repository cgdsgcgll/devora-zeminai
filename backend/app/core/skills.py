import re
import unicodedata

ALIASES = {'python': 'python', 'fastapi': 'fastapi', 'postgres': 'postgresql',
           'postgresql': 'postgresql', 'nextjs': 'nextjs', 'reactjs': 'react',
           'react': 'react', 'dockercompose': 'docker-compose', 'docker': 'docker',
           'cplusplus': 'cpp', 'c++': 'cpp', 'c#': 'csharp'}


def normalize_skill(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError('Skill name must be a string.')
    value = unicodedata.normalize('NFKD', value.strip().lower()).encode('ascii', 'ignore').decode()
    compact = re.sub(r'[\s._-]', '', value)
    key = ALIASES.get(compact) or re.sub(r'[^a-z0-9]+', '-', value).strip('-')
    if not key or not key[0].isalpha() or len(key) > 64:
        raise ValueError('Invalid skill name.')
    return key


def supported_skill(key: str, label: str, text: str) -> bool:
    """Conservative lexical grounding; deliberately rejects implicit industry assumptions."""
    candidates = [label, key.replace('-', ' ')]
    candidates.extend(alias for alias, canonical in ALIASES.items() if canonical == key)
    candidates.extend({'nextjs': ['Next.js'], 'react': ['React.js'], 'postgresql': ['Postgres'],
                       'docker-compose': ['Docker Compose']}.get(key, []))
    return any(re.search(r'(?<!\w)' + re.escape(c) + r'(?!\w)', text, re.I) for c in candidates if c)
