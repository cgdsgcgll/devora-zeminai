import json
import re
import time

import httpx

from app.core.errors import AppError


class GeminiProvider:
    """Google generateContent REST adapter; domain validation remains in analyzers."""
    name = 'gemini'

    def __init__(self, api_key: str, model: str, timeout: float = 30, max_retries: int = 2,
                 max_output_tokens: int = 4000, transport: httpx.BaseTransport | None = None):
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_retries = min(2, max(0, max_retries))
        self.max_output_tokens = max_output_tokens
        self.transport = transport

    def generate_structured(self, *, instructions: str, context: str,
                            schema: dict, schema_name: str) -> str:
        model_id = self.model.removeprefix('models/')
        if not self._api_key.strip() or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', model_id):
            raise AppError('LLM_NOT_CONFIGURED', 'Gemini için GEMINI_API_KEY ve geçerli GEMINI_MODEL gereklidir.', 503)
        payload = {
            'systemInstruction': {'parts': [{'text': instructions}]},
            'contents': [{'role': 'user', 'parts': [{'text': context}]}],
            'generationConfig': {
                'candidateCount': 1, 'maxOutputTokens': self.max_output_tokens,
                'responseFormat': {'text': {'mimeType': 'APPLICATION_JSON', 'schema': schema}},
            },
        }
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent'
        with httpx.Client(timeout=self.timeout, transport=self.transport, follow_redirects=False) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    with client.stream('POST', url, headers={'x-goog-api-key': self._api_key}, json=payload) as response:
                        if response.status_code != 200:
                            retryable = response.status_code in {408, 429} or response.status_code >= 500
                            raise AppError('LLM_PROVIDER_ERROR', 'Gemini isteği tamamlanamadı.', 502,
                                           retryable, {'upstream_status': response.status_code})
                        raw = bytearray()
                        for chunk in response.iter_bytes():
                            raw.extend(chunk)
                            if len(raw) > 1_000_000:
                                raise AppError('INVALID_MODEL_OUTPUT', 'Gemini yanıtı boyut sınırını aştı.', 502)
                        return self._output_text(json.loads(raw))
                except httpx.TimeoutException:
                    error = AppError('LLM_TIMEOUT', 'Gemini isteği zaman aşımına uğradı.', 504, True)
                except httpx.RequestError:
                    error = AppError('LLM_PROVIDER_ERROR', 'Gemini sağlayıcısına erişilemedi.', 502, True)
                except (ValueError, KeyError, TypeError, AttributeError):
                    error = AppError('INVALID_MODEL_OUTPUT', 'Gemini yanıtı geçerli yapılandırılmış çıktı içermiyor.', 502)
                except AppError as exc:
                    error = exc
                if not error.retryable or attempt == self.max_retries:
                    raise error from None
                time.sleep(0.25 * 2**attempt)
        raise AssertionError('Unreachable')

    @staticmethod
    def _output_text(body: dict) -> str:
        if body.get('promptFeedback', {}).get('blockReason'):
            raise AppError('LLM_PROVIDER_ERROR', 'Gemini sağlayıcısı analizi reddetti.', 502)
        candidates = body.get('candidates', [])
        if not isinstance(candidates, list) or len(candidates) != 1:
            raise AppError('INVALID_MODEL_OUTPUT', 'Tek bir Gemini yanıtı bekleniyordu.', 502)
        candidate = candidates[0]
        if candidate.get('finishReason') != 'STOP':
            raise AppError('INVALID_MODEL_OUTPUT', 'Gemini yanıtı tamamlanmadı veya engellendi.', 502)
        parts = candidate.get('content', {}).get('parts', [])
        text = ''.join(part['text'] for part in parts if not part.get('thought') and 'text' in part)
        # No markdown stripping or regex repair. Pydantic subsequently validates the shared schema.
        if not isinstance(json.loads(text), dict):
            raise ValueError('Expected a JSON object')
        return text
