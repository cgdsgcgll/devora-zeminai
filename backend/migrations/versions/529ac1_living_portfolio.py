"""Allow portfolio links without fetching or asserting verification."""
from alembic import op
import sqlalchemy as sa

revision = '529ac1_living_portfolio'
down_revision = '41c0cbaf4250'
branch_labels = None
depends_on = None


def change_category(include_portfolio):
    bind = op.get_bind()
    table = sa.Table('profile_evidence_items', sa.MetaData(), autoload_with=bind)
    old = next(c for c in table.constraints if isinstance(c, sa.CheckConstraint) and 'category' in str(c.sqltext))
    categories = "'education', 'certification', 'hackathon', 'event', 'community'"
    if include_portfolio:
        categories += ", 'portfolio'"
    if bind.dialect.name == 'sqlite':
        # SQLite's original check is unnamed. Reflect and replace only that check.
        table.constraints.remove(old)
        table.append_constraint(sa.CheckConstraint(f'category IN ({categories})', name='ck_profile_category'))
        with op.batch_alter_table(table.name, copy_from=table, recreate='always'):
            pass
    else:
        op.drop_constraint(old.name, table.name, type_='check')
        op.create_check_constraint('ck_profile_category', table.name, f'category IN ({categories})')


def upgrade():
    change_category(True)


def downgrade():
    if op.get_bind().execute(sa.text("SELECT 1 FROM profile_evidence_items WHERE category = 'portfolio' LIMIT 1")).first():
        raise RuntimeError('Downgrade blocked: preserve/export portfolio records before removing portfolio support.')
    change_category(False)
