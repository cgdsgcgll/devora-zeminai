from typing import Protocol


class LLMProvider(Protocol):
    name: str
    model: str

    def generate_structured(self, *, instructions: str, context: str,
                            schema: dict, schema_name: str) -> str: ...
