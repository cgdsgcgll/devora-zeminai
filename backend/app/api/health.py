from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.readiness import check_database
from app.core.errors import AppError
from app.schemas.domain import Health, ErrorResponse

router = APIRouter()

class Liveness(BaseModel):
    status: Literal['ok'] = 'ok'

@router.get('/health/live', response_model=Liveness)
def live():
    return Liveness()

@router.get('/health/ready', response_model=Health, responses={503: {'model': ErrorResponse}})
def ready(db: Session = Depends(get_db)):
    try:
        check_database(db.connection())
    except Exception as exc:
        raise AppError('NOT_READY', 'Servis henüz trafik almaya hazır değil.', 503, True) from exc
    return Health(status='ok', database='ok')
