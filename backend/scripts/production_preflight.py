"""Read-only production checks. Never migrate, contact providers or print secrets."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    try:
        from app.core.config import Settings
        config = Settings()
        if config.environment != 'production':
            raise ValueError('Production environment required')
    except Exception:
        print('CONFIG_INVALID')
        return 1
    try:
        from sqlalchemy import create_engine
        from app.db.session import engine_options
        from app.core.readiness import check_database
        engine = create_engine(config.database_url, **engine_options(config))
        try:
            with engine.connect() as connection:
                check_database(connection)
        finally:
            engine.dispose()
    except Exception:
        print('DATABASE_OR_MIGRATION_NOT_READY')
        return 1
    print('PRODUCTION_PREFLIGHT_OK')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
