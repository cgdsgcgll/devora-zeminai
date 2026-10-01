"""Run with the backend virtualenv: python frontend/scripts/export_openapi.py."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'backend'))
from app.main import app

(root / 'frontend' / 'openapi.json').write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Exported FastAPI OpenAPI contract; no environment values included.')
