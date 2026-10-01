# Uygulama raporu — 30 Eylül 2026

> Tarihsel v0.1 raporu. Güncel v0.2 davranışı için `LLM_IMPLEMENTATION_REPORT.md` ve ana README'yi okuyun.

## Mevcut repo durumu

Uzak ref incelemesinde yalnız `main` bulundu. Başlangıç commit'i: `2909e32acd8217e5c5a149f17ad572f66df741ea`.
Repository yalnızca README içeriyordu. README'deki React/Next.js, FastAPI, LLM ve PostgreSQL ifadeleri plan niteliğindeydi;
çalışan uygulama, paket manifesti veya migration bulunmuyordu. Orijinal README `docs/VISION.md` içinde korundu.

## Yapılan değişiklikler

- `backend/app/schemas`: Entity/input/output sözleşmeleri ve enum'lar.
- `backend/app/models`, `db`, `migrations`: PostgreSQL/SQLAlchemy ilişkileri ve dondurulmuş Alembic migration.
- `backend/app/services`: Bounded GitHub fetch, analyzer protokolleri, kural tabanlı analiz ve deterministik matching.
- `backend/app/api`, `main.py`: CRUD temeli, analiz/eşleşme akışları, standart hatalar ve health check.
- `backend/tests`: 45 test; HTTP mock'ları, API akışı, kanıt semantiği, skor ve migration testleri.
- `.env.example`, `docker-compose.yml`, `.gitignore`, `README.md`: Yerel kurulum ve gerçek uygulama durumu.
- `frontend/README.md`: Next.js/TypeScript için plan notu; frontend uygulaması oluşturulmadı.

Değişiklikler teslim edilen yerel repository kopyasındadır; uzak GitHub'a push veya PR yapılmadı.

## Oluşturulan API endpointleri

```text
POST /candidates
GET  /candidates/{candidate_id}
POST /candidates/{candidate_id}/projects
GET  /projects/{project_id}
POST /projects/{project_id}/analyze
GET  /snapshots/{snapshot_id}
GET  /evidence/{evidence_id}
GET  /analysis-runs/{run_id}
POST /needs
GET  /needs/{need_id}
POST /matches
GET  /matches/{match_id}
GET  /health
```

## Database modeli

`candidates → projects → repository_snapshots/skill_evidence`;
`organization_needs → need_criteria`;
`analysis_runs → project veya need`;
`match_results → candidate + need`;
`match_criteria → match_result + need_criterion`;
`match_evidence → match_criterion + skill_evidence`.

Toplam 10 domain tablosu; ayrıca Alembic sürüm tablosu. UUID anahtarlar, foreign key, unique ve check kısıtları.
Eski snapshot/kanıtlar tutulur; her projenin son başarılı analizi kullanılır ve tarihi match sonuçları değiştirilmez.

## Matching algoritması

Sadece `observed` durumundaki aynı skill_key kanıtları kapsama sayılır.
Preferred varsa `100 × (0.80 × requiredCoverage + 0.20 × preferredCoverage)`;
yoksa `100 × requiredCoverage`. Sürüm: `evidence-coverage-v0.1`.
Required boşsa coverage=1; yalnız preferred kriterlerde 80 taban puan vardır. Tüm kriterler boşsa 422 hata.
Hiç başarılı proje analizi yoksa 409 hata. README-only beyanları skoru yükseltmez.
Kanıt gücü beceri seviyesi değildir. Skor işe alınma ihtimali veya genel yetenek puanı değildir.

## Test sonucu

Python 3.12 ortamında gerçekten çalıştırıldı:

| Kontrol | Sonuç |
|---|---|
| `python -m pytest -q` (SQLite) | 45 passed |
| `TEST_DATABASE_URL` ile `python -m pytest -q` (PostgreSQL 18.6) | 45 passed |
| PostgreSQL: `python -m alembic upgrade head` | Başarılı |
| PostgreSQL: `python -m alembic downgrade base`, tekrar `upgrade head` | Başarılı |
| PostgreSQL: `python -m alembic check` | No new upgrade operations detected |
| `python -m compileall -q app tests migrations` | Başarılı |
| `python -c "from app.main import app; print(app.title, len(app.openapi()['paths']))"` | ZeminAI, 13 path |
| `python -m pip check` | No broken requirements found |
| `git diff --check` | Whitespace hatası yok; Windows LF/CRLF bilgilendirmesi |
| Gerçek Uvicorn HTTP + PostgreSQL + canlı GitHub smoke testi | Başarılı |

HTTP smoke testi gerçek `/health` (200), aday/proje/ihtiyaç kaydı, canlı GitHub snapshot/analiz,
`POST /matches`, `GET /matches` eşitliği ve `/openapi.json` (200) işlemlerini kapsadı.
Başlangıç GitHub README'si `declared_only` olarak analiz edildi; skor 0 kalıcı olarak kaydedildi.
Mock tabanlı API testinde Python/FastAPI required ve Docker preferred için skor 80 doğrulandı.

Bir Starlette/AnyIO deprecation uyarısı mevcut; test başarısızlığı yok.
Docker çalıştırılmadı (makinede yok); Compose PostgreSQL 16 görüntüsü bu makinede denenmedi.
Frontend oluşturulmadığından npm install/lint/build uygulanmadı.
PyPI dosya sunucusu bağlantısı kesildiği için test bağımlılıkları geçici PyPI aynasıyla kuruldu;
repository'ye kalıcı ayna yapılandırması yazılmadı.

## Çalıştırma

Teslim klasöründe PowerShell:

```powershell
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
docker compose up -d
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Docker alternatifi ve Linux/macOS komutları ana README'dedir. Swagger: `http://127.0.0.1:8000/docs`.

## Henüz yapılmayanlar

Gerçek LLM entegrasyonu, frontend, contributor doğrulaması, derin semantik GitHub analizi,
tam hesap aktarımı, sürekli güncelleme, background queue, authentication/authorization ve deployment.
Gerçek GitHub fetch ve sınırlı kural tabanlı analiz yapılmıştır; bunlar tam AI yetenek analizi değildir.

## Sonraki en mantıklı adım

1. Pydantic çıktısı ve kaynak referansları doğrulanan gerçek LLM adapter'ı ekleyin.
2. OpenAPI sözleşmesi üzerinden aday/proje/ihtiyaç/eşleşme frontend akışını bağlayın.
3. Dış kullanıma açmadan kimlik/kurum izolasyonu ve analiz iş kuyruğunu ekleyin.
