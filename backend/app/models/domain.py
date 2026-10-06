from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (JSON, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer,
                        ForeignKeyConstraint, String, Text, UniqueConstraint, Uuid)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.schemas.domain import utcnow


class Base(DeclarativeBase):
    pass


class Identity:
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)


class Created:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Updated(Created):
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(Identity, Updated, Base):
    __tablename__ = 'users'
    __table_args__ = (CheckConstraint("role IN ('candidate', 'institution')", name='ck_user_role'),)
    email: Mapped[str] = mapped_column(String(254))
    normalized_email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    role: Mapped[str] = mapped_column(String(20))
    display_name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserSession(Identity, Created, Base):
    __tablename__ = 'user_sessions'
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthThrottle(Base):
    __tablename__ = 'auth_throttles'
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Candidate(Identity, Updated, Base):
    __tablename__ = 'candidates'
    owner_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id'), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    projects: Mapped[list['Project']] = relationship(back_populates='candidate')


class ProfileEvidenceItem(Identity, Updated, Base):
    __tablename__ = 'profile_evidence_items'
    __table_args__ = (
        CheckConstraint("category IN ('education', 'certification', 'hackathon', 'event', 'community', 'portfolio')", name='ck_profile_category'),
        CheckConstraint("verification_status IN ('declared_only', 'linked', 'verified')"),
    )
    candidate_id: Mapped[UUID] = mapped_column(ForeignKey('candidates.id'), index=True)
    category: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    organization: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    started_at: Mapped[date | None] = mapped_column(Date)
    ended_at: Mapped[date | None] = mapped_column(Date)
    source_url: Mapped[str | None] = mapped_column(String(2000))
    source_label: Mapped[str] = mapped_column(String(200))
    verification_status: Mapped[str] = mapped_column(String(20))
    metadata_json: Mapped[dict] = mapped_column(JSON)


class Project(Identity, Updated, Base):
    __tablename__ = 'projects'
    __table_args__ = (UniqueConstraint('id', 'candidate_id'),
                      CheckConstraint("source_type = 'github'"))
    candidate_id: Mapped[UUID] = mapped_column(ForeignKey('candidates.id'), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(20), default='github')
    source_url: Mapped[str] = mapped_column(String(500))
    candidate: Mapped[Candidate] = relationship(back_populates='projects')
    snapshots: Mapped[list['RepositorySnapshot']] = relationship()
    evidence: Mapped[list['SkillEvidence']] = relationship()


class RepositorySnapshot(Identity, Base):
    __tablename__ = 'repository_snapshots'
    __table_args__ = (UniqueConstraint('id', 'project_id'),)
    project_id: Mapped[UUID] = mapped_column(ForeignKey('projects.id'), index=True)
    repository_url: Mapped[str] = mapped_column(String(500))
    default_branch: Mapped[str] = mapped_column(String(255))
    commit_sha: Mapped[str] = mapped_column(String(64))
    readme: Mapped[str] = mapped_column(Text)
    languages: Mapped[dict] = mapped_column(JSON)
    files: Mapped[list] = mapped_column(JSON)
    limitations: Mapped[list] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OrganizationNeed(Identity, Updated, Base):
    __tablename__ = 'organization_needs'
    owner_user_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id'), index=True)
    description: Mapped[str] = mapped_column(Text)
    target_role: Mapped[str | None] = mapped_column(String(200))
    expected_output: Mapped[str | None] = mapped_column(Text)
    uncertainties: Mapped[list] = mapped_column(JSON, default=list)
    analysis_version: Mapped[str] = mapped_column(String(100))
    criteria: Mapped[list['NeedCriterion']] = relationship(back_populates='need', order_by='NeedCriterion.skill_key')


class NeedCriterion(Identity, Created, Base):
    __tablename__ = 'need_criteria'
    __table_args__ = (UniqueConstraint('need_id', 'skill_key'),
                      CheckConstraint("priority IN ('required', 'preferred')"))
    need_id: Mapped[UUID] = mapped_column(ForeignKey('organization_needs.id'), index=True)
    kind: Mapped[str] = mapped_column(String(30), default='technical_skill', server_default='technical_skill')
    skill_key: Mapped[str] = mapped_column(String(64))
    skill_label: Mapped[str] = mapped_column(String(200))
    priority: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str | None] = mapped_column(Text)
    need: Mapped[OrganizationNeed] = relationship(back_populates='criteria')


class AnalysisRun(Identity, Base):
    __tablename__ = 'analysis_runs'
    __table_args__ = (
        CheckConstraint("status IN ('running', 'completed', 'failed')"),
        CheckConstraint("(analysis_type = 'project' AND project_id IS NOT NULL AND need_id IS NULL) OR "
                        "(analysis_type = 'need' AND need_id IS NOT NULL AND project_id IS NULL)"),
    )
    project_id: Mapped[UUID | None] = mapped_column(ForeignKey('projects.id'), index=True)
    need_id: Mapped[UUID | None] = mapped_column(ForeignKey('organization_needs.id'), index=True)
    analysis_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    analysis_version: Mapped[str] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    limitations: Mapped[list] = mapped_column(JSON, default=list)
    uncertainties: Mapped[list] = mapped_column(JSON, default=list)
    provider: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(200))
    commit_sha: Mapped[str | None] = mapped_column(String(64))


class SkillEvidence(Identity, Created, Base):
    __tablename__ = 'skill_evidence'
    __table_args__ = (
        ForeignKeyConstraint(['project_id', 'candidate_id'], ['projects.id', 'projects.candidate_id']),
        ForeignKeyConstraint(['snapshot_id', 'project_id'], ['repository_snapshots.id', 'repository_snapshots.project_id']),
        CheckConstraint("evidence_status IN ('observed', 'declared_only', 'not_found')"),
        CheckConstraint("evidence_strength IN ('weak', 'medium', 'strong')"),
        CheckConstraint("evidence_type IN ('project_description', 'readme', 'source_file', 'dependency_file', 'repository_language', 'user_claim')"),
    )
    candidate_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    project_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    snapshot_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    analysis_run_id: Mapped[UUID] = mapped_column(ForeignKey('analysis_runs.id'), index=True)
    skill_key: Mapped[str] = mapped_column(String(64), index=True)
    skill_label: Mapped[str] = mapped_column(String(200))
    evidence_status: Mapped[str] = mapped_column(String(20))
    evidence_strength: Mapped[str] = mapped_column(String(20))
    evidence_type: Mapped[str] = mapped_column(String(30))
    source_url: Mapped[str] = mapped_column(Text)
    path: Mapped[str | None] = mapped_column(Text)
    excerpt: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    limitations: Mapped[list] = mapped_column(JSON)


class MatchResult(Identity, Created, Base):
    __tablename__ = 'match_results'
    __table_args__ = (CheckConstraint('score >= 0 AND score <= 100'),
                      CheckConstraint('required_coverage >= 0 AND required_coverage <= 1'),
                      CheckConstraint('preferred_coverage >= 0 AND preferred_coverage <= 1'))
    candidate_id: Mapped[UUID] = mapped_column(ForeignKey('candidates.id'), index=True)
    need_id: Mapped[UUID] = mapped_column(ForeignKey('organization_needs.id'), index=True)
    score: Mapped[float] = mapped_column(Float)
    score_type: Mapped[str] = mapped_column(String(50))
    required_coverage: Mapped[float] = mapped_column(Float)
    preferred_coverage: Mapped[float] = mapped_column(Float)
    score_explanation: Mapped[str] = mapped_column(Text)
    strengths: Mapped[list] = mapped_column(JSON)
    gaps: Mapped[list] = mapped_column(JSON)
    uncertainties: Mapped[list] = mapped_column(JSON)
    analysis_version: Mapped[str] = mapped_column(Text)
    scoring_version: Mapped[str] = mapped_column(String(100))
    criteria: Mapped[list['MatchCriterion']] = relationship(order_by='MatchCriterion.skill_key')


class MatchCriterion(Identity, Base):
    __tablename__ = 'match_criteria'
    __table_args__ = (UniqueConstraint('match_id', 'criterion_id'),)
    match_id: Mapped[UUID] = mapped_column(ForeignKey('match_results.id'), index=True)
    criterion_id: Mapped[UUID] = mapped_column(ForeignKey('need_criteria.id'))
    kind: Mapped[str] = mapped_column(String(30), default='technical_skill', server_default='technical_skill')
    # Immutable snapshots allow edits/deletions without rewriting historical results.
    profile_evidence: Mapped[list] = mapped_column(JSON, default=list, server_default='[]')
    # Freeze labels/priority so historical explanations remain reproducible.
    skill_key: Mapped[str] = mapped_column(String(64))
    skill_label: Mapped[str] = mapped_column(String(200))
    priority: Mapped[str] = mapped_column(String(20))
    matched: Mapped[bool] = mapped_column(Boolean)
    explanation: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list['MatchEvidence']] = relationship(order_by='MatchEvidence.evidence_id')


class MatchEvidence(Base):
    __tablename__ = 'match_evidence'
    match_criterion_id: Mapped[UUID] = mapped_column(ForeignKey('match_criteria.id'), primary_key=True)
    evidence_id: Mapped[UUID] = mapped_column(ForeignKey('skill_evidence.id'), primary_key=True)


class RateBucket(Base):
    __tablename__ = 'rate_buckets'
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
