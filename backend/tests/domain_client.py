"""Domain regression harness selects the owning test actor, never bypasses auth.
Security tests use ordinary TestClient instances and deliberately keep the wrong actor.
"""
import secrets
from datetime import timedelta
from uuid import UUID, uuid4
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.models import domain as m
from app.core.auth import digest
from app.core.config import settings
from app.schemas.domain import utcnow

def actor(db, role):
    user=m.User(email=f'{uuid4()}@test.example',normalized_email=f'{uuid4()}@test.example',
        display_name='Test actor',password_hash='not-used-by-cookie-domain-tests',role=role)
    db.add(user);db.flush()
    return user

def own_fixture_candidates(db):
    for candidate in db.scalars(select(m.Candidate).where(m.Candidate.owner_user_id.is_(None))):
        candidate.owner_user_id=actor(db,'candidate').id
    db.commit()

class DomainClient(TestClient):
    def __init__(self,*args,db,**kwargs):
        super().__init__(*args,**kwargs)
        self.db=db; self.tokens={};self.institution=actor(db,'institution');self.candidate=actor(db,'candidate');db.commit()
    def request(self,method,url,**kwargs):
        path=str(url).split('?')[0]; parts=path.strip('/').split('/')
        user=self.institution if parts[0] in {'needs','matches'} else self.candidate
        if method=='POST' and path=='/candidates':
            user=actor(self.db,'candidate');self.candidate=user;self.db.commit()
        if len(parts)>1:
            try: record_id=UUID(parts[1])
            except ValueError: record_id=None
            model={'candidates':m.Candidate,'projects':m.Project,'profile-evidence':m.ProfileEvidenceItem,
                'evidence':m.SkillEvidence,'snapshots':m.RepositorySnapshot,'analysis-runs':m.AnalysisRun,
                'needs':m.OrganizationNeed,'matches':m.MatchResult}.get(parts[0])
            record=self.db.get(model,record_id) if model and record_id else None
            if record is not None:
                if isinstance(record,m.MatchResult): record=self.db.get(m.OrganizationNeed,record.need_id)
                if isinstance(record,m.AnalysisRun):
                    record=self.db.get(m.Project,record.project_id) if record.project_id else self.db.get(m.OrganizationNeed,record.need_id)
                if isinstance(record,m.RepositorySnapshot):record=self.db.get(m.Project,record.project_id)
                if isinstance(record,(m.Project,m.ProfileEvidenceItem,m.SkillEvidence)):record=self.db.get(m.Candidate,record.candidate_id)
                if record.owner_user_id:user=self.db.get(m.User,record.owner_user_id)
        if user.id not in self.tokens:
            token=secrets.token_urlsafe(32);self.tokens[user.id]=token
            self.db.add(m.UserSession(user_id=user.id,token_hash=digest(token),expires_at=utcnow()+timedelta(days=1)));self.db.commit()
        self.cookies.clear();self.cookies.set(settings.session_cookie_name,self.tokens[user.id])
        kwargs['headers']={'Origin':'http://localhost:3000',**(kwargs.get('headers') or {})}
        return super().request(method,url,**kwargs)
