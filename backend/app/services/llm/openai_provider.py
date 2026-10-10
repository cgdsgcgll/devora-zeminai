import json
import time

import httpx

from app.core.errors import AppError
from app.services.llm import diagnostics, retry
from app.services.llm.capacity import provider_slot


class OpenAIProvider:
    """Responses REST adapter. No domain models, database access, or SDK dependency."""
    name = 'openai'

    def __init__(self, api_key: str, model: str, timeout: float = 30, max_retries: int = 2,
                 max_output_tokens: int = 4000, transport: httpx.BaseTransport | None = None):
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_retries = min(2, max(0, max_retries))
        self.max_output_tokens = max_output_tokens
        self.transport = transport

    @provider_slot
    def generate_structured(self, *, instructions: str, context: str,
                            schema: dict, schema_name: str) -> str:
        if not self._api_key.strip() or not self.model.strip():
            raise AppError('LLM_NOT_CONFIGURED', 'OpenAI için LLM_API_KEY ve LLM_MODEL gereklidir.', 503)
        payload = {'model': self.model, 'store': False, 'instructions': instructions,
                   'input': [{'role': 'user', 'content': context}],
                   'max_output_tokens': self.max_output_tokens,
                   'text': {'format': {'type': 'json_schema', 'name': schema_name,
                                        'strict': True, 'schema': schema}}}
        with httpx.Client(timeout=self.timeout, transport=self.transport, follow_redirects=False) as client:
            for attempt in range(self.max_retries + 1):
                retry_delay = None
                started = time.perf_counter()
                try:
                    remaining = diagnostics.remaining()
                    client.timeout = httpx.Timeout(min(self.timeout, remaining) if remaining is not None else self.timeout)
                    with client.stream('POST', 'https://api.openai.com/v1/responses',
                                       headers={'Authorization': f'Bearer {self._api_key}'}, json=payload) as response:
                        if response.status_code != 200:
                            retry_delay = retry.retry_after(response.headers.get("retry-after"))
                            raise diagnostics.http_error(response.status_code)
                        raw = bytearray()
                        for chunk in response.iter_bytes():
                            raw.extend(chunk)
                            if len(raw) > 1_000_000:
                                raise AppError('INVALID_MODEL_OUTPUT', 'LLM yanıtı boyut sınırını aştı.', 502)
                        result = self._output_text(json.loads(raw))
                        diagnostics.event('llm_request', provider=self.name, model=self.model,
                            attempt=attempt + 1, duration_ms=(time.perf_counter()-started)*1000)
                        return result
                except httpx.TimeoutException:
                    error = AppError('LLM_TIMEOUT', 'LLM isteği zaman aşımına uğradı.', 504, True)
                except httpx.RequestError:
                    error = AppError('LLM_UNAVAILABLE', 'LLM sağlayıcısına erişilemedi.', 502, True)
                except (ValueError, KeyError, TypeError, AttributeError):
                    error = AppError('INVALID_MODEL_OUTPUT', 'LLM yanıtı geçerli yapılandırılmış çıktı içermiyor.', 502)
                except AppError as exc:
                    error = exc
                diagnostics.event('llm_request', provider=self.name, model=self.model, attempt=attempt + 1,
                    duration_ms=(time.perf_counter()-started)*1000, error=error)
                if not error.retryable or attempt == self.max_retries:
                    raise error from None
                retry.pause(attempt, error, retry_delay)
        raise AssertionError('Unreachable')

    @staticmethod
    def _output_text(body: dict) -> str:
        if not isinstance(body, dict) or body.get('status') != 'completed':
            raise AppError('INVALID_MODEL_OUTPUT', 'LLM yanıtı tamamlanmadı.', 502)
        outputs = []
        for item in body.get('output', []):
            if item.get('type') != 'message':
                continue  # Reasoning items are not the structured answer.
            for part in item.get('content', []):
                if part.get('type') == 'refusal':
                    raise AppError('LLM_REQUEST_REJECTED', 'LLM sağlayıcısı analizi reddetti.', 502)
                if part.get('type') == 'output_text':
                    outputs.append(part['text'])
        if len(outputs) != 1 or not isinstance(outputs[0], str):
            raise AppError('INVALID_MODEL_OUTPUT', 'Tek bir yapılandırılmış LLM çıktısı bekleniyordu.', 502)
        return outputs[0]
