import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.api.routes import router
from app.api.auth import router as auth_router
from app.core.errors import AppError
from app.core.config import settings
from app.core.request_limits import RequestSizeLimitMiddleware
from app.api.health import router as health_router
from app.core.observability import RequestTelemetry, request_id, error_event
import json

logger = logging.getLogger(__name__)
docs_enabled = settings.api_docs_enabled if settings.api_docs_enabled is not None else settings.environment != 'production'
app = FastAPI(title='ZeminAI', version='0.1.0',
    docs_url='/docs' if docs_enabled else None, redoc_url='/redoc' if docs_enabled else None,
    openapi_url='/openapi.json' if docs_enabled else None)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=True, allow_methods=['GET', 'POST', 'PATCH', 'DELETE'], allow_headers=['Content-Type'],
                   expose_headers=['X-Request-ID', 'Retry-After'])
app.add_middleware(RequestTelemetry, config=settings)
app.include_router(router)
app.include_router(auth_router)
app.include_router(health_router)
from app.api.proof import router as proof_router
app.include_router(proof_router)


@app.exception_handler(AppError)
async def app_error(request: Request, exc: AppError):
    logger.warning(json.dumps({'event':'application_error', 'request_id':request_id.get(),
        'code':exc.code, 'status':exc.status}))
    return JSONResponse(exc.body(), status_code=exc.status, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not echo arbitrary input, credentials, or non-serializable exception contexts.
    details = {'issues': [{'location': list(e['loc']), 'type': e['type'], 'message': e['msg']}
                          for e in exc.errors()]}
    return JSONResponse(AppError('VALIDATION_ERROR', 'İstek veri sözleşmesine uygun değil.', 422,
                                 details=details).body(), status_code=422)


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError):
    error_event(exc)
    return JSONResponse(AppError('DATABASE_ERROR', 'Veritabanı işlemi tamamlanamadı.', 503, True).body(), status_code=503)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(AppError('HTTP_ERROR', str(exc.detail), exc.status_code).body(), status_code=exc.status_code)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    error_event(exc)
    return JSONResponse(AppError('INTERNAL_ERROR', 'İşlem tamamlanamadı.', 500).body(), status_code=500)
