import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from app.api.routes import router
from app.core.errors import AppError
from app.core.config import settings

logger = logging.getLogger(__name__)
app = FastAPI(title='ZeminAI', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
app.include_router(router)


@app.exception_handler(AppError)
async def app_error(request: Request, exc: AppError):
    return JSONResponse(exc.body(), status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not echo arbitrary input, credentials, or non-serializable exception contexts.
    details = {'issues': [{'location': list(e['loc']), 'type': e['type'], 'message': e['msg']}
                          for e in exc.errors()]}
    return JSONResponse(AppError('VALIDATION_ERROR', 'İstek veri sözleşmesine uygun değil.', 422,
                                 details=details).body(), status_code=422)


@app.exception_handler(SQLAlchemyError)
async def database_error(request: Request, exc: SQLAlchemyError):
    logger.error('Database operation failed: %s', type(exc).__name__)
    return JSONResponse(AppError('DATABASE_ERROR', 'Veritabanı işlemi tamamlanamadı.', 503, True).body(), status_code=503)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(AppError('HTTP_ERROR', str(exc.detail), exc.status_code).body(), status_code=exc.status_code)


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error('Unexpected error: %s', type(exc).__name__)
    return JSONResponse(AppError('INTERNAL_ERROR', 'İşlem tamamlanamadı.', 500).body(), status_code=500)
