"""Persist safe failure classification; existing job history is preserved."""
from alembic import op
import sqlalchemy as sa

revision = 'a18_analysis_diagnostics'
down_revision = 'a17_analysis_jobs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('analysis_jobs', sa.Column('retryable', sa.Boolean(), nullable=True))
    op.add_column('analysis_jobs', sa.Column('diagnostics', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('analysis_jobs', 'diagnostics')
    op.drop_column('analysis_jobs', 'retryable')
