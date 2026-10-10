from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID
from pydantic import Field
from app.schemas.profile import ProfileContract

GitHubID = Annotated[str, Field(pattern=r'^[1-9][0-9]{0,19}$')]


class GitHubConnectURL(ProfileContract):
    authorization_url: str


class GitHubInstallationURL(ProfileContract):
    installation_url: Annotated[str, Field(
        pattern=r'^https://github\.com/apps/[a-z0-9]+(?:-[a-z0-9]+)*/installations/new$')]


class GitHubConnectionView(ProfileContract):
    id: UUID
    github_user_id: GitHubID
    github_login: str
    created_at: datetime
    revoked_at: datetime | None


class GitHubConnectionStatus(ProfileContract):
    connection: GitHubConnectionView | None


class GitHubInstallation(ProfileContract):
    id: GitHubID
    account_id: GitHubID
    account_login: str
    account_type: Literal['User', 'Organization']


class GitHubRepository(ProfileContract):
    private: bool = True
    imported_project_id: UUID | None = None
    id: GitHubID
    full_name: str
    html_url: str
    owner_id: GitHubID
    owner_login: str
    owner_type: Literal['User', 'Organization']
    permissions: dict[Literal['admin', 'maintain', 'push', 'triage', 'pull'], bool]


class GitHubLinkInput(ProfileContract):
    installation_id: GitHubID
    repository_id: GitHubID


class GitHubRelationship(ProfileContract):
    id: UUID
    project_id: UUID
    github_repository_id: GitHubID
    installation_id: GitHubID
    full_name: str
    owner_id: GitHubID
    owner_login: str
    owner_type: Literal['User', 'Organization']
    permissions: dict[Literal['admin', 'maintain', 'push', 'triage', 'pull'], bool]
    relationship: Literal['personal_owner', 'account_access']
    updated_at: datetime
    revoked_at: datetime | None


class GitHubRelationshipStatus(ProfileContract):
    link: GitHubRelationship | None


from app.schemas.domain import Project, AnalysisRun, SkillEvidence


class AnalysisState(ProfileContract):
    state: Literal['not_started','queued','analyzing','succeeded','failed']
    job_id: UUID | None = None
    error_code: str | None = None
    retryable: bool | None = None
    deadline: datetime | None = None


class GitHubImportResult(ProfileContract):
    project: Project
    created: bool
    analysis: AnalysisState


class GitHubBatchInput(ProfileContract):
    installation_id: GitHubID
    repository_ids: list[GitHubID] = Field(min_length=1,max_length=20)


class GitHubImportItem(ProfileContract):
    repository_id: GitHubID
    status: Literal['imported','existing','failed']
    result: GitHubImportResult | None = None
    error_code: str | None = None


class GitHubBatchResult(ProfileContract):
    items: list[GitHubImportItem]


class ProjectActivity(ProfileContract):
    project: Project
    link: GitHubRelationship | None
    run: AnalysisRun | None
    evidence: list[SkillEvidence]
    analysis: AnalysisState
