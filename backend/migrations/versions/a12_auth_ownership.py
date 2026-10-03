"""Accounts, hashed sessions and nullable legacy ownership."""
from alembic import op
import sqlalchemy as sa

revision = 'a12_auth_ownership'
down_revision = '529ac1_living_portfolio'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('auth_throttles',
        sa.Column('key', sa.String(64), primary_key=True),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_auth_throttles_expires_at', 'auth_throttles', ['expires_at'])
    op.create_table('users',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('email', sa.String(254), nullable=False),
        sa.Column('normalized_email', sa.String(254), nullable=False),
        sa.Column('password_hash', sa.String(500), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('display_name', sa.String(200), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('candidate', 'institution')", name='ck_user_role'))
    op.create_index('ix_users_normalized_email', 'users', ['normalized_email'], unique=True)
    op.create_table('user_sessions',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True)))
    for field in ('user_id', 'token_hash', 'expires_at'):
        op.create_index('ix_user_sessions_' + field, 'user_sessions', [field], unique=field == 'token_hash')
    for table in ('candidates', 'organization_needs'):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column('owner_user_id', sa.Uuid(), nullable=True))
            batch.create_foreign_key('fk_' + table + '_owner', 'users', ['owner_user_id'], ['id'])
            batch.create_index('ix_' + table + '_owner_user_id', ['owner_user_id'], unique=table == 'candidates')

def downgrade():
    if op.get_bind().scalar(sa.text('SELECT count(*) FROM users')):
        raise RuntimeError('Auth accounts exist; preserve/export accounts and ownership before downgrade.')
    for table in ('organization_needs', 'candidates'):
        with op.batch_alter_table(table) as batch:
            batch.drop_index('ix_' + table + '_owner_user_id')
            batch.drop_constraint('fk_' + table + '_owner', type_='foreignkey')
            batch.drop_column('owner_user_id')
    op.drop_table('user_sessions')
    op.drop_table('users')
    op.drop_table('auth_throttles')
