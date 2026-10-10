"""Archive projects without deleting frozen evidence; immutable import identity."""
from alembic import op
import sqlalchemy as sa
revision = 'a16_project_lifecycle'
down_revision = 'a15_github_verification'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('projects', sa.Column('github_repository_id', sa.String(20), nullable=True))
    op.add_column('projects', sa.Column('repository_private', sa.Boolean(), nullable=True))
    op.create_index('uq_active_import_repository', 'projects', ['candidate_id', 'github_repository_id'], unique=True,
        sqlite_where=sa.text('archived_at IS NULL AND github_repository_id IS NOT NULL'),
        postgresql_where=sa.text('archived_at IS NULL AND github_repository_id IS NOT NULL'))


def downgrade():
    if op.get_bind().execute(sa.text('SELECT 1 FROM projects WHERE archived_at IS NOT NULL OR github_repository_id IS NOT NULL LIMIT 1')).first():
        raise RuntimeError('preserve/export project lifecycle data before downgrade')
    op.drop_index('uq_active_import_repository', table_name='projects')
    op.drop_column('projects', 'repository_private')
    op.drop_column('projects', 'github_repository_id')
    op.drop_column('projects', 'archived_at')
