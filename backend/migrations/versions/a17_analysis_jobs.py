"""Durable, bounded project analysis queue."""
from alembic import op
import sqlalchemy as sa
revision = 'a17_analysis_jobs'
down_revision = 'a16_project_lifecycle'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('analysis_jobs',
        sa.Column('id',sa.Uuid(),primary_key=True),
        sa.Column('created_at',sa.DateTime(timezone=True),nullable=False),
        sa.Column('project_id',sa.Uuid(),sa.ForeignKey('projects.id'),nullable=False),
        sa.Column('run_id',sa.Uuid(),sa.ForeignKey('analysis_runs.id'),unique=True),
        sa.Column('status',sa.String(20),nullable=False),
        sa.Column('deadline',sa.DateTime(timezone=True),nullable=False),
        sa.Column('finished_at',sa.DateTime(timezone=True)),
        sa.Column('error_code',sa.String(100)),
        sa.CheckConstraint("status IN ('queued','analyzing','succeeded','failed')",name='ck_analysis_job_status'))
    op.create_index('ix_analysis_jobs_project_id','analysis_jobs',['project_id'])
    op.create_index('ix_analysis_jobs_deadline','analysis_jobs',['deadline'])
    op.create_index('uq_active_analysis_job','analysis_jobs',['project_id'],unique=True,
        sqlite_where=sa.text("status IN ('queued','analyzing')"),postgresql_where=sa.text("status IN ('queued','analyzing')"))


def downgrade():
    if op.get_bind().execute(sa.text('SELECT 1 FROM analysis_jobs LIMIT 1')).first():
        raise RuntimeError('preserve/export analysis jobs before downgrade')
    op.drop_table('analysis_jobs')
