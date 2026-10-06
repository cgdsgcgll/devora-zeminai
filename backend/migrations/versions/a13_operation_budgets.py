"""Persistent operation budgets; preserve live budgets during downgrade."""
from alembic import op
import sqlalchemy as sa
revision = 'a13_operation_budgets'
down_revision = 'a12_auth_ownership'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('rate_buckets', sa.Column('key', sa.String(64), primary_key=True),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_rate_buckets_expires_at', 'rate_buckets', ['expires_at'])


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM rate_buckets WHERE expires_at > CURRENT_TIMESTAMP')):
        raise RuntimeError('Active rate budgets exist; stop traffic and wait for expiry before downgrade.')
    op.drop_table('rate_buckets')
