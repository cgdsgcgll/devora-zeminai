from datetime import date, datetime
from ipaddress import ip_address
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Category = Literal['education', 'certification', 'hackathon', 'event', 'community']
Participation = Literal['participant', 'organizer', 'speaker', 'mentor', 'volunteer', 'member', 'leader']


def safe_profile_url(value: str | None) -> str | None:
    if value is None:
        return None
    if any(ord(c) < 33 for c in value) or '\\' in value:
        raise ValueError('Source URL must be a public HTTPS link.')
    parts = urlsplit(value)
    host = parts.hostname or ''
    if parts.scheme != 'https' or not host or parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError('Source URL must be a public HTTPS link without credentials.')
    if '.' not in host or host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('Source URL must use a public hostname.')
    try:
        address = ip_address(host)
    except ValueError:
        address = None
    if address is not None:
        raise ValueError('IP address links are not accepted.')
    return value


class ProfileContract(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, from_attributes=True)


class ProfileMetadata(ProfileContract):
    program: str | None = Field(default=None, max_length=200)
    education_type: Literal['degree', 'course', 'bootcamp', 'other'] | None = None
    status: Literal['ongoing', 'completed', 'left'] | None = None
    student_year: int | None = Field(default=None, ge=1, le=6)
    credential_id: str | None = Field(default=None, max_length=200)
    issued_at: date | None = None
    expires_at: date | None = None
    project_name: str | None = Field(default=None, max_length=200)
    result: Literal['participant', 'finalist', 'winner'] | None = None
    participation_type: Participation | None = None
    responsibility: str | None = Field(default=None, max_length=1000)

    @model_validator(mode='after')
    def dates(self):
        if self.issued_at and self.expires_at and self.expires_at < self.issued_at:
            raise ValueError('Expiry cannot precede issue date.')
        return self


METADATA_FIELDS = {
    'education': {'program', 'education_type', 'status', 'student_year'},
    'certification': {'credential_id', 'issued_at', 'expires_at'},
    'hackathon': {'project_name', 'result'},
    'event': {'participation_type', 'responsibility'},
    'community': {'participation_type', 'responsibility'},
}


class ProfileEvidenceCreate(ProfileContract):
    category: Category
    title: str = Field(min_length=1, max_length=200)
    organization: str = Field(default='', max_length=200)
    role: str = Field(default='', max_length=200)
    description: str = Field(default='', max_length=4000)
    started_at: date | None = None
    ended_at: date | None = None
    source_url: str | None = Field(default=None, max_length=2000)
    source_label: str = Field(default='', max_length=200)
    metadata_json: ProfileMetadata = Field(default_factory=ProfileMetadata)

    _url = field_validator('source_url')(safe_profile_url)

    @model_validator(mode='after')
    def consistent(self):
        if self.started_at and self.ended_at and self.ended_at < self.started_at:
            raise ValueError('End date cannot precede start date.')
        provided = set(self.metadata_json.model_dump(exclude_none=True))
        if provided - METADATA_FIELDS[self.category]:
            raise ValueError('Metadata fields do not belong to this category.')
        return self


class ProfileEvidencePatch(ProfileContract):
    # Category is immutable; create a new item to change its evidence family.
    title: str | None = Field(default=None, min_length=1, max_length=200)
    organization: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    started_at: date | None = None
    ended_at: date | None = None
    source_url: str | None = Field(default=None, max_length=2000)
    source_label: str | None = Field(default=None, max_length=200)
    metadata_json: ProfileMetadata | None = None
    _url = field_validator('source_url')(safe_profile_url)


class ProfileEvidenceItem(ProfileEvidenceCreate):
    id: UUID
    candidate_id: UUID
    verification_status: Literal['declared_only', 'linked', 'verified']
    created_at: datetime
    updated_at: datetime
