from pathlib import Path
from app.core.config import Settings


def test_config_path_is_absolute_and_not_dependent_on_shell(monkeypatch, tmp_path):
    expected = Path(__file__).resolve().parents[2] / '.env'
    monkeypatch.chdir(tmp_path)
    assert Settings.model_config['env_file'] == expected


def test_windows_bom_env_file_loads_without_changing_secure_default(tmp_path):
    env = tmp_path / 'local.env'
    env.write_text('ENVIRONMENT=development\nGITHUB_APP_SLUG=test-app\n', encoding='utf-8-sig')
    settings = Settings(_env_file=env)
    assert settings.github_app_slug == 'test-app'
    assert settings.session_cookie_secure is True
