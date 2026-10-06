from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from app.core import auth
from app.core.rate_limits import consume
from app.db.session import get_db
from app.schemas import proof as s
from app.schemas.domain import ErrorResponse
from app.services import proof
from app.models.domain import ProofRequest

router = APIRouter(prefix='/proof-requests', dependencies=[Depends(auth.check_origin)],
    responses={code: {'model': ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 429, 503)})


@router.post('', response_model=s.ProofItem, status_code=201)
def create(data: s.ProofCreate, request: Request, db: Session = Depends(get_db), user=Depends(auth.require_institution)):
    auth.match_record(db, data.match_id, user)
    consume(request, db, user, 'compute')
    return proof.create(db, data, user)


@router.get('', response_model=list[s.ProofItem])
def inbox(offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    return [proof.serialize(row) for row in db.execute(proof.query(user).order_by(ProofRequest.created_at.desc(), ProofRequest.id).offset(offset).limit(limit))]


@router.get('/{request_id}', response_model=s.ProofItem)
def detail(request_id: UUID, db: Session = Depends(get_db), user=Depends(auth.get_current_user)):
    return proof.serialize(proof.record(db, request_id, user))


@router.post('/{request_id}/submit', response_model=s.ProofItem)
def submit(request_id: UUID, data: s.ProofSubmit, db: Session = Depends(get_db), user=Depends(auth.require_candidate)):
    return proof.submit(db, request_id, data, user)


@router.patch('/{request_id}', response_model=s.ProofItem)
def review(request_id: UUID, data: s.ProofReview, db: Session = Depends(get_db), user=Depends(auth.require_institution)):
    return proof.review(db, request_id, data, user)
