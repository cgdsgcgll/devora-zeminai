"""Run isolated PostgreSQL tests using an ignored env file, never URL argv/logs."""
import os
from pathlib import Path
import subprocess
import sys
from dotenv import dotenv_values


def main():
    root = Path(__file__).resolve().parents[2]
    values = dotenv_values(root / 'work' / 'pg-test.env', encoding='utf-8-sig', interpolate=False)
    url = os.environ.get('TEST_DATABASE_URL') or values.get('TEST_DATABASE_URL')
    if not url:
        print('Set TEST_DATABASE_URL in ignored work/pg-test.env; do not use a production database.')
        return 2
    env = os.environ.copy()
    env['TEST_DATABASE_URL'] = url
    return subprocess.call([sys.executable, '-m', 'pytest', '-q', '-p', 'no:cacheprovider',
                            '--basetemp=' + str(root / 'work' / 'pytest-postgres'), *sys.argv[1:]],
                           cwd=root / 'backend', env=env)


if __name__ == '__main__':
    raise SystemExit(main())
