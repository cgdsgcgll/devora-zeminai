import pytest
from scripts.demo_preflight import prepare, main


def test_no_implicit_sqlite_fallback(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'sqlite://')
    with pytest.raises(ValueError, match='POSTGRESQL_REQUIRED'):
        prepare(config_only=True)


def test_explicit_postgres_config(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://test@127.0.0.1:55443/postgres')
    prepare(config_only=True)


def test_missing_explicit_database_config(monkeypatch):
    from app.core.config import Settings
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setattr('app.core.config.Settings', lambda: Settings(_env_file=None))
    with pytest.raises(ValueError, match='DATABASE_URL_REQUIRED'):
        prepare(config_only=True)


def test_unavailable_database_no_secret_output(monkeypatch, capsys):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://test:never-print-this@127.0.0.1:1/postgres')
    monkeypatch.setattr('sys.argv', ['demo_preflight'])
    assert main() == 1
    output = capsys.readouterr().out
    assert 'DATABASE_SETUP_FAILED' in output
    assert 'never-print-this' not in output
    assert '127.0.0.1' not in output
