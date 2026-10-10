"""Account/access provenance only; deliberately not referenced by the scorer."""
from datetime import datetime
from uuid import UUID
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from app.models.domain import Base, Identity, Updated


class GitHubConnection(Identity, Updated, Base):
    __tablename__ = 'github_connections'
    __table_args__ = (
        UniqueConstraint('id', 'candidate_id'),
        Index('uq_github_active_candidate', 'candidate_id', unique=True,
              sqlite_where=text('revoked_at IS NULL'), postgresql_where=text('revoked_at IS NULL')),
        Index('uq_github_active_identity', 'github_user_id', unique=True,
              sqlite_where=text('revoked_at IS NULL'), postgresql_where=text('revoked_at IS NULL')),
    )
    candidate_id: Mapped[UUID] = mapped_column(ForeignKey('candidates.id'))
    github_user_id: Mapped[str] = mapped_column(String(20))
    github_login: Mapped[str] = mapped_column(String(100))
    access_ciphertext: Mapped[str | None] = mapped_column(Text)
    refresh_ciphertext: Mapped[str | None] = mapped_column(Text)
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refresh_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GitHubOAuthState(Identity, Base):
    __tablename__ = 'github_oauth_states'
    state_hash: Mapped[str] = mapped_column(String(64), unique=True)
    candidate_id: Mapped[UUID] = mapped_column(ForeignKey('candidates.id'), index=True)
    session_id: Mapped[UUID] = mapped_column(ForeignKey('user_sessions.id'))
    verifier_ciphertext: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class GitHubRepositoryLink(Identity, Updated, Base):
    __tablename__ = 'github_repository_links'
    __table_args__ = (
        ForeignKeyConstraint(['project_id', 'candidate_id'], ['projects.id', 'projects.candidate_id']),
        ForeignKeyConstraint(['connection_id', 'candidate_id'], ['github_connections.id', 'github_connections.candidate_id']),
        CheckConstraint("relationship IN ('personal_owner', 'account_access')", name='ck_github_relationship'),
        CheckConstraint("owner_type IN ('User', 'Organization')", name='ck_github_owner_type'),
        UniqueConstraint('project_id'),
    )
    project_id: Mapped[UUID] = mapped_column()
    candidate_id: Mapped[UUID] = mapped_column()
    connection_id: Mapped[UUID] = mapped_column(index=True)
    github_repository_id: Mapped[str] = mapped_column(String(20))
    installation_id: Mapped[str] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(250))
    owner_id: Mapped[str] = mapped_column(String(20))
    owner_login: Mapped[str] = mapped_column(String(100))
    owner_type: Mapped[str] = mapped_column(String(20))
    permissions: Mapped[dict] = mapped_column(JSON)
    relationship: Mapped[str] = mapped_column(String(30))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
