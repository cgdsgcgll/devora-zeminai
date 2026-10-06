"""Frozen trace and match-scoped proof requests. No changes to scoring."""
from alembic import op
import sqlalchemy as sa
revision = 'a14_proof_requests'
down_revision = 'a13_operation_budgets'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('match_criteria', sa.Column('trace_items', sa.JSON(), nullable=True))
    op.create_table('proof_requests',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('match_criterion_id', sa.Uuid(), sa.ForeignKey('match_criteria.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('submission', sa.JSON(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True)),
        sa.Column('resolved_at', sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('open', 'submitted', 'closed', 'cancelled')", name='ck_proof_status'))
    op.create_index('ix_proof_requests_match_criterion_id', 'proof_requests', ['match_criterion_id'])
    op.create_index('uq_proof_active_criterion', 'proof_requests', ['match_criterion_id'], unique=True,
        sqlite_where=sa.text("status IN ('open', 'submitted')"), postgresql_where=sa.text("status IN ('open', 'submitted')"))


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM proof_requests')) or op.get_bind().scalar(sa.text('SELECT count(*) FROM match_criteria WHERE trace_items IS NOT NULL')):
        raise RuntimeError('Proof requests or frozen traces exist; export/preserve data before downgrade.')
    op.drop_table('proof_requests')
    op.drop_column('match_criteria', 'trace_items')
