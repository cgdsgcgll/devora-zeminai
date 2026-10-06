from typing import Any


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400,
                 retryable: bool = False, details: dict[str, Any] | None = None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable
        self.details = details or {}
        self.headers = headers or {}

    def body(self) -> dict:
        return {'error': {'code': self.code, 'message': self.message,
                          'retryable': self.retryable, 'details': self.details}}
