from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.domain import Candidate

class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128, repr=False)

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip()
        import re
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError('Geçerli bir e-posta adresi girin.')
        return value

class Register(Login):
    password: str = Field(min_length=12, max_length=128, repr=False)
    role: Literal['candidate', 'institution']
    display_name: str = Field(min_length=1, max_length=200)

    @field_validator('display_name')
    @classmethod
    def name(cls, value):
        if not value.strip():
            raise ValueError('Ad boş olamaz.')
        return value.strip()

class Account(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: str
    role: Literal['candidate', 'institution']

class AuthState(BaseModel):
    user: Account
    candidate: Candidate | None = None
