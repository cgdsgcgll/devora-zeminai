"""Add nullable analysis metadata and criterion rationale; preserve historical rows."""
from alembic import op
import sqlalchemy as sa

revision = '6b02_llm_metadata'
down_revision = '5aacc06c939c'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('analysis_runs', sa.Column('provider', sa.String(100), nullable=True))
    op.add_column('analysis_runs', sa.Column('model', sa.String(200), nullable=True))
    op.add_column('analysis_runs', sa.Column('commit_sha', sa.String(64), nullable=True))
    op.add_column('need_criteria', sa.Column('reason', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('need_criteria', 'reason')
    op.drop_column('analysis_runs', 'commit_sha')
    op.drop_column('analysis_runs', 'model')
    op.drop_column('analysis_runs', 'provider')
