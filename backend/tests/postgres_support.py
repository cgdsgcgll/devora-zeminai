"""Dedicated generated schemas; never migrate/drop the caller's existing schema."""
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from app.core.config import settings
from app.models import github_account  # Explicit metadata registration for schema checks.
from pytest import MonkeyPatch


def migration_config():
    return Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))


def assert_current_schema(connection):
    head=ScriptDirectory.from_config(migration_config()).get_current_head()
    actual=connection.scalar(text('SELECT version_num FROM alembic_version'))
    assert actual==head, f'Test schema must be migrated to {head}; found {actual}.'
    tables=set(inspect(connection).get_table_names())
    required={github_account.GitHubConnection.__tablename__,github_account.GitHubOAuthState.__tablename__,
              github_account.GitHubRepositoryLink.__tablename__}
    assert required<=tables, f'Missing GitHub test tables: {sorted(required-tables)}'
    indexes={i['name'] for i in inspect(connection).get_indexes('github_connections')}
    assert {'uq_github_active_candidate','uq_github_active_identity'}<=indexes
    assert len(inspect(connection).get_foreign_keys('github_repository_links'))==2


@contextmanager
def isolated_postgres_schema(base_url, *, migrate=True):
    url=make_url(base_url)
    assert url.get_backend_name()=='postgresql', 'Expected a PostgreSQL test URL.'
    schema='zeminai_pytest_'+uuid4().hex
    admin=create_engine(url,connect_args={'connect_timeout':5},hide_parameters=True)
    scoped=url.update_query_dict({'options':str(url.query.get('options',''))+' -csearch_path='+schema})
    created=False
    try:
        with admin.begin() as connection:
            connection.execute(text('CREATE SCHEMA "'+schema+'"'))
        created=True
        if migrate:
            with MonkeyPatch.context() as patch:
                patch.setattr(settings,'database_url',scoped.render_as_string(hide_password=False))
                command.upgrade(migration_config(),'head')
                command.check(migration_config())
            engine=create_engine(scoped,hide_parameters=True)
            try:
                with engine.connect() as connection:
                    assert connection.scalar(text('SELECT current_schema()'))==schema
                    assert_current_schema(connection)
            finally:
                engine.dispose()
        yield scoped
    finally:
        if created:
            # Only this invocation's generated schema, never a caller-provided name.
            with admin.begin() as connection:
                connection.execute(text('DROP SCHEMA "'+schema+'" CASCADE'))
        admin.dispose()
