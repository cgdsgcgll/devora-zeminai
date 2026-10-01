# Devora – ZeminAI

Zemin360 kapsamında doğrulanabilir proje kanıtları ve açıklanabilir ihtiyaç eşleştirmesi için backend MVP.
Başlangıç deposu yalnızca README içeriyordu (`main`, `2909e32acd8217e5c5a149f17ad572f66df741ea`).
Orijinal ürün vizyonu değiştirilmeden [docs/VISION.md](docs/VISION.md) içinde korunmuştur.
İkinci turda önceki backend bu çalışma klasörüne aktarılmıştır; klasör başlangıçta yalnızca boş `.git` içeriyordu.
Mevcut sürüm: scoring v0.2 + seçilebilir rule_based/OpenAI/Gemini analiz. Ayrıntılar: [LLM raporu](docs/LLM_IMPLEMENTATION_REPORT.md).

## Mevcut teknoloji ve yapı

Çalışan kod: Python 3.12+, FastAPI, Pydantic 2, SQLAlchemy 2, PostgreSQL, Alembic ve pytest.
REST/OpenAPI veri sözleşmesi `/openapi.json`, etkileşimli dokümantasyon `/docs` üzerinden sunulur.
Next.js + TypeScript planlanmıştır; `frontend/` şu anda yalnızca açıklama içerir.

```text
backend/app/api/                 HTTP endpointleri
backend/app/core/                Ayarlar ve standart hatalar
backend/app/db/                  Session/engine
backend/app/models/              İlişkisel SQLAlchemy modelleri
backend/app/schemas/             Pydantic ortak veri sözleşmesi
backend/app/services/github/     Sınırlı public GitHub okuyucusu
backend/app/services/analysis/   Sağlayıcı arayüzleri ve sınırlı kural tabanlı analiz
backend/app/services/llm/        Provider protokolü, OpenAI ve Gemini REST adapter
backend/app/services/matching/   Saf/deterministik skor fonksiyonu
backend/app/services/workflows.py Kayıt ve analiz akışları
backend/migrations/              Sürümlü Alembic şeması
backend/tests/                   Ağdan bağımsız testler
```

## Prerequisites

- Python 3.12 veya üzeri.
- Docker Compose veya yerel PostgreSQL. Compose PostgreSQL 16 kullanır.
- GitHub okuma işlemi için internet; public repository için token zorunlu değil.
- Bu sürüm yerel geliştirme içindir. Kimlik doğrulama ve tenant izolasyonu henüz yoktur.

## Backend setup / Database setup

Aşağıdaki komutlar bu dosyanın bulunduğu repo kökünden çalıştırılır.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
docker compose up -d
cd backend
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Linux/macOS:

```bash
cp .env.example .env
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
docker compose up -d
cd backend
../.venv/bin/python -m alembic upgrade head
../.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Yerel PostgreSQL kullanılıyorsa `zeminai` veritabanını oluşturup `.env` içindeki `DATABASE_URL` değerini değiştirin;
Docker komutunu atlayın. Uygulama başlangıcı tablo oluşturmaz; migration komutu gereklidir.

## Environment variables

| Değişken | Açıklama |
|---|---|
| DATABASE_URL | `postgresql+psycopg://postgres:postgres@localhost:5432/zeminai` yerel Compose örneği |
| GITHUB_TOKEN | İsteğe bağlı GitHub token; token ile erişilse bile private repo reddedilir |
| LLM_API_KEY | OpenAI modunda gerekli; rule_based modunda kullanılmaz |
| LLM_PROVIDER | `rule_based` (kod varsayılanı), `openai` veya `gemini` (`.env.example` demo seçimi); bilinmeyen değer analizde kontrollü hata verir |
| LLM_MODEL | OpenAI modunda gerekli; model kodda sabitlenmez |
| GEMINI_API_KEY | Gemini modunda gerekli; yalnızca sunucuda tutulur |
| GEMINI_MODEL | Gemini modunda gerekli; model kodda sabitlenmez |
| LLM_TIMEOUT_SECONDS | HTTP timeout: kod varsayılanı 30, demo örneği 120 saniye; her deneme için geçerli |
| LLM_MAX_RETRIES | Geçici HTTP/network hatalarında ek deneme sayısı; 0–2, varsayılan 2 |
| LLM_MAX_INPUT_BYTES | Serialize edilmiş kullanıcı bağlamı UTF-8 sınırı: 24000 bayt |
| LLM_MAX_OUTPUT_TOKENS | OpenAI/Gemini çıktı token sınırı: 4000 |

Repo kökündeki `.env` otomatik okunur. Ortam değişkenleri önceliklidir. `.env` Git dışında tutulur.
Compose parolası yalnızca yerel geliştirme örneğidir ve port sadece loopback üzerinde açılır.

## Migration command

`backend/` içinde, etkin sanal ortamla:

```bash
python -m alembic upgrade head
python -m alembic current
python -m alembic check
```

`python -m alembic downgrade base` tüm uygulama tablolarını siler; yalnızca boş/geçici test veritabanında kullanın.
İlk migration dondurulmuş açık tablo tanımları içerir; uygulamadaki güncel metadata'ya bağımlı değildir.

## Run command / Health check

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/health
```

Başarılı cevap: `{"status":"ok","service":"zeminai-api","database":"ok"}`.
DB erişilemiyorsa HTTP 503 ve standart `DATABASE_ERROR` cevabı döner. Dokümantasyon: http://127.0.0.1:8000/docs

## API endpointleri

| Method | Path | İşlev |
|---|---|---|
| POST | /candidates | Aday oluştur |
| GET | /candidates/{candidate_id} | Aday getir |
| POST | /candidates/{candidate_id}/projects | GitHub projesi oluştur |
| GET | /projects/{project_id} | Proje getir |
| POST | /projects/{project_id}/analyze | Snapshot al, seçili sağlayıcıyla analiz et ve kanıtları kaydet |
| GET | /snapshots/{snapshot_id} | Kaynak veriyi tekrar incele |
| GET | /evidence/{evidence_id} | Kanıtı getir |
| GET | /analysis-runs/{run_id} | Analiz durumunu ve hatasını getir |
| POST | /needs | İhtiyaç ve kriterlerini oluştur |
| GET | /needs/{need_id} | İhtiyaç ve kriterlerini getir |
| POST | /matches | Kanıtlarla eşleştir ve sonucu kaydet |
| GET | /matches/{match_id} | Skor, kriterler ve kanıt referanslarını getir |
| GET | /health | Uygulama ve DB sağlık kontrolü |

### Örnek akış

`/docs` üzerinden sırayla:

1. `POST /candidates`: `{"name":"Ada"}` → aday ID'sini alın.
2. `POST /candidates/{id}/projects`: `{"name":"Demo","description":"API projesi","source_url":"https://github.com/owner/repo"}` → gerçek public repo kullanın.
3. `POST /projects/{id}/analyze`: gövde gerekmez. Snapshot, analysis run ve evidence döner.
4. `POST /needs`: `{"description":"Python ve FastAPI gerekli; Docker tercih edilir"}`.
5. `POST /matches`: `{"candidate_id":"...","need_id":"..."}`.
6. `GET /matches/{id}` ile kaydedilen açıklamayı tekrar okuyun; `evidence_ids` referanslarını `/evidence/{id}` ile açın.

İhtiyaç önceliklerini açık belirtmek için `POST /needs` gövdesine ekleyin:

```json
{
  "description": "Python API geliştirme",
  "criteria": [
    {"skill_key":"python","skill_label":"Python","priority":"required"},
    {"skill_key":"docker","skill_label":"Docker","priority":"preferred"}
  ]
}
```

Açık kriterler doğal dil analizine üstün gelir. `skill_key` küçük harfli, boşluksuz kanonik anahtardır.
Tekrarlanan beceri kriterleri reddedilir. Açık liste boşsa doğal dil analizine başvurulur.

## Analiz ve kanıt semantiği

- Sağlayıcıdan bağımsız `SkillAnalyzer`, `NeedAnalyzer` ve `LLMProvider` arayüzleri mevcuttur. Varsayılan `rule_based` modu LLM kullanmaz.
- Aşağıdaki kural kataloğu `rule_based` modunu anlatır; `openai` modu aşağıdaki ayrı bölümde açıklanır.
- README ve proje açıklamasındaki teknoloji isimleri `declared_only/weak` olur; skora girmez.
- `requirements.txt`, `pyproject.toml`, `package.json` içindeki yapılandırılmış bağımlılıklar `observed/medium` olabilir.
- Ayrıştırılabilen Python kaynak dosyası ve AST üzerinden FastAPI import'u `observed/strong` kanıt oluşturur.
- GitHub Python dil metadatası `observed/weak` olur. Dil metadatası commit anına sabitlenemez; bu sınırlama kayıtlıdır.
- Kural kataloğu Python, FastAPI, PostgreSQL, React, Next.js, Docker isimlerini tanır; her teknoloji için kaynak kodu çıkarıcısı yoktur.
- JS/TS çalışma zamanı, SQL kullanımı veya Docker yapılandırması için derin doğrulama henüz yapılmaz.
- README, source ve provider çıktıları veridir; talimat olarak yürütülmez. Kod import/execute edilmez; Python AST ile ayrıştırılır.
- Contributor doğrulaması yoktur. Kodun adaya ait olduğu varsayılmaz; her kanıtta limitation tutulur.
- `evidence_strength` beceri seviyesi değildir; skor ağırlığı olarak kullanılmaz.
- `not_found`, becerinin bulunmadığını ispatlamaz. Gereksiz sentetik `not_found` satırları üretilmez; eksik kriterler matching sırasında açıklanır.
- Model çıktısı Pydantic ile doğrulanır. `validate_model_output` geçersiz çıktıyı `INVALID_MODEL_OUTPUT` olarak reddeder.
- Doğal dil analizinde `tercih/optional/preferred` bulunan cümlecikler preferred, diğer eşleşmeler required olur.
  Basit olumsuz ifadeler atlanır; karmaşık dil/olumsuzluk/öncelik çözümü yoktur. Açık criteria kullanımı önerilir.

### Supported analysis modes

- `rule_based`
- `openai`
- `gemini`

### OpenAI analizi

Yerel geliştirme (anahtar gerektirmez):

```env
LLM_PROVIDER=rule_based
```

Gerçek LLM kullanımı için repo kökündeki `.env` dosyasında:

```env
LLM_PROVIDER=openai
LLM_MODEL=<structured-output-destekleyen-model>
LLM_API_KEY=<kendi-api-anahtarınız>
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=2
```

Model adı hesabınızda erişilebilir, Responses strict structured output destekleyen bir model olmalıdır.
Yer tutucuları gerçek ayarlarla değiştirin. Model kod içinde seçilmez. Anahtarı commit etmeyin.
Mevcut `httpx` bağımlılığı ile `/v1/responses` çağrılır; yeni SDK bağımlılığı eklenmedi.
İstek `text.format.type=json_schema`, `strict=true`, `store=false` kullanır.
Sözleşme [resmi Structured Outputs belgesine](https://developers.openai.com/api/docs/guides/structured-outputs) göre uygulanmıştır.

`openai` seçiliyken key/model eksikse uygulama açılır, analiz çağrısı `LLM_NOT_CONFIGURED` döner;
sessiz rule-based fallback **yoktur**. Açık `criteria` ile oluşturulan ihtiyaçlar LLM çağırmaz.
Hatalı provider, key ve model ayarları analiz run kaydında failed olarak izlenebilir.

### Gemini demo kurulumu

Repo kökündeki ignore edilen `.env` dosyasında:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
LLM_TIMEOUT_SECONDS=120
LLM_MAX_RETRIES=2
LLM_MAX_INPUT_BYTES=24000
LLM_MAX_OUTPUT_TOKENS=4000
```

[Google AI Studio](https://aistudio.google.com/apikey) üzerinden API key oluşturup
`GEMINI_API_KEY` değerini yerel olarak doldurun ([resmi anahtar kılavuzu](https://ai.google.dev/gemini-api/docs/api-key)).
Canlı olarak doğrulanan demo modeli `gemini-3.1-flash-lite`, kullanılan HTTP timeout 120 saniyedir.
Model `GEMINI_MODEL` environment değişkeninden okunur; kodda sabitlenmez.
Key/model eksikse `LLM_NOT_CONFIGURED` döner; fallback yapılmaz.

Kullanıcının bildirdiği gerçek API smoke testi sonucu:

- Gemini live smoke test passed.
- Project structured output validated (Pydantic).
- Need structured output validated (Pydantic).
- Evidence grounding validated.

Python `observed / repository_language / weak`, FastAPI `observed / source_file / strong` olarak doğrulandı.
İhtiyaç analizinde Python ve FastAPI required, Docker preferred çıktı; uydurma kriter görülmedi.
`gemini-3.8-flash` ile 30 saniyelik istekte timeout yaşandığından demo örneği doğrulanan 3.1 Flash Lite'ı kullanır.
Bu kayıt demo smoke doğrulamasıdır; production-ready değerlendirmesi değildir.

Resmi Python SDK `google-genai` Pydantic destekler; bu projede mevcut `httpx` transport/retry yapısını
korumak için tek bir [generateContent REST adaptörü](https://ai.google.dev/api/generate-content) kullanılır.
Yeni bağımlılık eklenmedi. Key URL parametresi yerine `x-goog-api-key` header'ında gönderilir.
`generationConfig.responseFormat.text` içinde `mimeType=APPLICATION_JSON` ve ortak Pydantic modellerinin
JSON Schema çıktısı gönderilir. [Structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
yanıtı JSON olarak okunur, ardından mevcut strict Pydantic ve kaynak doğrulamasından geçer;
markdown/regex ile JSON onarımı yapılmaz. Tamamlanmamış veya hatalı çıktı reddedilir.

1 Ekim 2026 kontrolünde resmi [fiyatlandırma tablosu](https://ai.google.dev/gemini-api/docs/pricing)
Gemini 2.5 Flash ve Flash-Lite standard metin giriş/çıkışında Free Tier gösteriyor.
Bu bir model varsayılanı veya ücretsiz erişim garantisi değildir: hesap/proje erişimi, modeller ve limitler
Google tarafından değiştirilebilir. Demo öncesi AI Studio'daki erişim ve kotayı kontrol edin.

### Ortak LLM analiz akışı

Project akışı: GitHub snapshot → sınırlı LLM context → strict yapılandırılmış çıktı → Pydantic doğrulaması →
kaynak/path/alinti kontrolü → domain evidence → DB. Snapshot analiz hatasında da korunur.
Need akışı: description/target_role/expected_output → yapılandırılmış kriterler → Pydantic →
her kriter için tam kaynak alıntısı ve beceri adı kontrolü → need criteria. Genel backend isteğinden stack türetilmez.

- Model source_url, analiz sürümü veya timestamp belirlemez; bunlar backend tarafından atanır.
- README/açıklama kanıtı model observed/strong dese bile declared_only/weak yapılır.
- Dependency-only kanıt en fazla medium; repository language en fazla weak olur.
- Uydurma dosya yolu, gönderilmeyen alıntı ve ihtiyaçta bulunmayan beceriler `INVALID_MODEL_OUTPUT` üretir.
- Skill alias'ları: Postgres→postgresql, Next.js/NextJS→nextjs, React.js→react, Docker Compose→docker-compose.
- Unknown skill'ler deterministik slug alır. Etiket/anahtar uyuşmazlıkları ve duplicate kriterler reddedilir.
- Kaynak kontrolü muhafazakâr sözcük/alıntı kontrolüdür; kodun çalıştığını veya kişisel katkıyı ispatlamaz.
  Örtük beceriler ve alışılmadık alias'lar reddedilebilir; yorum/metin içeren kodun anlamı için ayrıca değerlendirme gerekir.
- Repository içeriği user-data olarak gönderilir; sistem talimatı yapılmaz. Prompt injection'a karşı talimat ve
  kaynak doğrulaması vardır; bunlar modelin semantik olarak her zaman doğru olduğunu garanti etmez.

LLM context sınırı gerçek serialize edilmiş UTF-8 baytlarıyla uygulanır; modelden bağımsız muhafazakâr bir giriş sınırıdır,
kesin tokenizer sayımı değildir. System prompt ve JSON schema için ayrıca context alanı gerekir.
İlk 30 dosyadan en fazla dosya başına 2500 bayt; README 2500, açıklama 2000 bayt örneklenir; toplam 24000 bayt sınırı aşılmaz.
Need girdisi sınırı aşarsa kesilip anlam kaybettirilmez; kontrollü 422 döner.
Çıktı `max_output_tokens` ile sınırlandırılır. HTTP cevap limiti 1 MB'dır.
Timeout/429/5xx için en fazla 2 ek deneme; format/doğrulama/refusal/401 hatalarında otomatik tekrar yoktur.
Timeout, işlem başına toplam süre değil HTTP işlemleri için sınırdır; retry toplam süreyi uzatabilir.

Analiz metadata'sı: `provider`, yapılandırılmış `model`, `analysis_version`, `commit_sha`, başlangıç/bitiş zamanı.
API key kaydedilmez. Önceki kayıtlarda yeni nullable metadata alanları null kalır.
Gerekli migration: `python -m alembic upgrade head` (`6b02_llm_metadata`). Skor sürümü String olduğu için ayrı skor migration'ı gerekmez.

İsteğe bağlı, gerçek API çağrısı yapan manuel test (`backend/` içinde):

```bash
python scripts/smoke_llm.py
```

Seçilen OpenAI/Gemini provider için key/model yoksa `SKIPPED` döner. Mevcutsa iki canlı çağrı yapar; ücret doğurabilir.
Unit testler gerçek API anahtarı veya internet gerektirmez. Kullanıcının doğruladığı canlı Gemini sonucu yukarıdaki demo bölümündedir.

### GitHub sınırları

En fazla 30 UTF-8 metin dosyası, dosya başına 100.000 bayt, toplam 1.000.000 bayt içerik.
Tree/API yanıtı en fazla 8.000.000 bayt; blob yanıtı en fazla 200.000 bayt. İstek başına 15 saniye timeout.
Binary, symlink, submodule, vendor/node_modules/build gibi dizinler atlanır. README ve dependency dosyaları önce seçilir.
Tüm repo indirilmez. Commit SHA ve commit referanslı dosya URL'leri snapshot'ta saklanır.
GitHub 404, bulunmayan ve yetkisiz private repository durumlarını ayırmaz; hata bunu açıkça belirtir.
Token ile private olduğu görülen repo `SOURCE_NOT_PUBLIC` döndürür. Hız limiti geçici/retryable hata olarak döner.
Analiz senkrondur; job queue ve otomatik retry yoktur.

## Database modeli

- `candidates` → `projects` → `repository_snapshots` ve `skill_evidence`.
- `organization_needs` → `need_criteria`.
- `analysis_runs` → proje veya ihtiyaç; başlangıç/bitiş, sürüm, durum, hata ve sınırlamalar.
- Analizlerde provider/model/commit; ihtiyaç kriterlerinde açıklayıcı `reason` saklanır.
- `match_results` → aday + ihtiyaç.
- `match_criteria` → sonuç + ihtiyaç kriteri; matched/unmatched, dondurulmuş etiket/öncelik/açıklama.
- `match_evidence` → sonuç kriteri + kanıt; referanslar gerçek foreign key'lerdir.
- UUID anahtarlar; zaman damgaları; enum/check, benzersizlik ve foreign key kısıtları.

Snapshot ve evidence geçmişi korunur. Her projenin son başarılı analizi matching'e dahil edilir;
yeniden analiz aynı kanıtı iki kez saymaz. Başarısız yeni analiz varsa eski başarılı verinin kullanıldığı belirtilir.
Önceki match sonuçları yeni analizle değiştirilmez. Proje/ihtiyaç düzenleme ve silme endpointleri henüz yoktur.
DB bağlantısı analiz sırasında kesilirse running kayıt kalabilir; otomatik stale-run toparlama henüz yoktur.

## Matching algoritması

Yalnızca `observed` evidence ve birebir `skill_key` eşleşmesi sayılır. Aynı kriter birden fazla kanıtla daha fazla puan kazanmaz.

```text
required_coverage  = observed kanıtı bulunan required kriter / required kriter sayısı
preferred_coverage = observed kanıtı bulunan preferred kriter / preferred kriter sayısı
iki grup varsa: score = 100 * (0.80 * required_coverage + 0.20 * preferred_coverage)
sadece required: score = 100 * required_coverage
sadece preferred: score = 100 * preferred_coverage
scoring_version = evidence-coverage-v0.2
```

Skor 0–100 aralığındadır. Eksik grubun coverage değeri 0 olur ve puana katkı yapmaz.
Yalnız 3 preferred kriterde 0/1/3 eşleşme sırasıyla 0/33.333333/100 puan üretir.
Bütün kriterler boşsa HTTP 422 `MATCHING_FAILED`. Önceki v0.1 kayıtları aynı skor ve sürümle okunur; geriye dönük değiştirilmez.
En az bir başarılı proje analizi yoksa HTTP 409 `INSUFFICIENT_PROJECT_DATA`; fake evidence üretilmez.
Başarılı analizden sıfır observed kanıt çıkması geçerli bir sonuçtur ve required kriterler için sıfır kapsam oluşturur.

**Bu skor işe alınma ihtimali veya genel yetenek puanı değildir. Yalnızca ihtiyaç ile gözlemlenebilir proje kanıtlarının uyumudur.**

## Standart hatalar

```json
{"error":{"code":"INVALID_SOURCE_URL","message":"...","retryable":false,"details":{}}}
```

Desteklenen domain kodları: `VALIDATION_ERROR`, `INVALID_SOURCE_URL`, `SOURCE_UNREACHABLE`,
`SOURCE_NOT_PUBLIC`, `GITHUB_FETCH_FAILED`, `INSUFFICIENT_PROJECT_DATA`, `ANALYSIS_FAILED`,
`INVALID_MODEL_OUTPUT`, `MATCHING_FAILED`, `DATABASE_ERROR`.
LLM kodları: `LLM_NOT_CONFIGURED` (503), `LLM_TIMEOUT` (504), `LLM_PROVIDER_ERROR` (502).
Ek olarak `NOT_FOUND`, `HTTP_ERROR`, `INTERNAL_ERROR` kullanılır. Ham DB hataları veya anahtarlar cevaplara yazılmaz.
Analiz hatalarında `details.analysis_run_id`, ihtiyaç analizinde ayrıca `details.need_id` döner.

## Test command

`backend/` içinde, etkin sanal ortamla:

```bash
python -m compileall -q app tests migrations
python -m pytest -q
python -c "from app.main import app; print(app.title, len(app.openapi()['paths']))"
```

Varsayılan testler SQLite + foreign key denetimiyle çalışır; GitHub erişimi mock HTTP ile sağlanır.
PostgreSQL testleri için önce AYRI test veritabanını migrate edin, sonra `TEST_DATABASE_URL` tanımlayın.
Testler dış transaction içinde çalışıp geri alınır. Üretim veritabanı kullanmayın.

```powershell
$env:DATABASE_URL = 'postgresql+psycopg://postgres:postgres@localhost:5432/zeminai_test'
python -m alembic upgrade head
$env:TEST_DATABASE_URL = $env:DATABASE_URL
python -m pytest -q
```

## Implemented features

- Aday, proje ve ihtiyaç create/get endpointleri; Pydantic/OpenAPI sözleşmesi.
- PostgreSQL modeli, Alembic migration, yerel PostgreSQL Compose servisi.
- Bounded public GitHub fetch; commit referanslı snapshot ve kanıt saklama.
- Sınırlı kural tabanlı proje/ihtiyaç analizi; provider-independent LLM arayüzü.
- OpenAI Responses ve Gemini generateContent adapter; ortak project/need LLM analyzer'ları; mock HTTP testleri ve kullanıcı tarafından doğrulanan canlı Gemini demo smoke testi.
- Pydantic strict çıktı ve kaynak/alıntı doğrulaması; normalizasyon, timeout/retry ve kontrollü hatalar.
- Deterministik, açıklanabilir ve kalıcı matching; criterion/evidence ilişkileri.
- Standart hatalar, analysis run kayıtları ve DB health check.
- Ağdan bağımsız matching, evidence, GitHub, API ve migration testleri.

## Not implemented yet

- Gerçek OpenAI anahtarıyla canlı doğrulama, model kalitesi/eval ve production operasyon kontrolleri.
- Next.js/TypeScript frontend ve frontend entegrasyonu.
- Tam GitHub hesap aktarımı, contributor/kişisel katkı doğrulaması, derin semantik kod analizi.
- Sürekli profil güncelleme, job queue, otomatik retry ve analiz yeniden başlatma mekanizması.
- Authentication/authorization, tenant izolasyonu, production rate limiting ve deployment.
- Güncelleme/silme CRUD işlemleri ve kurum iş birliği takip arayüzü.

## İlk teslim doğrulama kaydı (v0.1, tarihsel)

Bu teslimde 45 test SQLite üzerinde, aynı 45 test ayrı PostgreSQL 18.6 test kümesinde geçti.
PostgreSQL üzerinde `alembic upgrade head`, `downgrade base`, tekrar `upgrade head` ve `alembic check` başarılı oldu.
Gerçek GitHub okuma denemesinde başlangıç deposunun README'si alındı; teknolojiler yalnızca `declared_only` çıktı.
Uvicorn gerçek HTTP sunucusunda `/health`, aday/proje/ihtiyaç kaydı, canlı GitHub analizi, match kaydı/okuması ve
`/openapi.json` doğrulandı. README-only repo için skor 0 olarak PostgreSQL'e kaydedildi.
`compileall`, FastAPI import/OpenAPI üretimi, `pip check` ve `git diff --check` başarılı oldu.
Starlette/AnyIO bağımlılığından bir deprecation uyarısı vardır; test başarısızlığı yoktur.
Docker bu makinede bulunmadığı için `docker compose up -d` burada çalıştırılmadı.
Paket sunucusuna erişim sorunu nedeniyle test ortamının bağımlılıkları geçici PyPI aynası üzerinden kuruldu;
projede kalıcı index/mirror ayarı yapılmadı.

## İkinci tur doğrulama kaydı (v0.2)

Önceki 45 test başlangıçta tekrar geçti. Yeni toplam 96 test SQLite ve PostgreSQL 18.6 üzerinde ayrı ayrı geçti.
Migration upgrade/downgrade/upgrade/check başarılı; eski kayıtların korunması ayrıca test edildi.
OpenAI istek gövdesi, structured output, malformed output, timeout, retry, provider/config hataları mock HTTP ile test edildi.
Gerçek LLM key/model bulunmadığı için manuel smoke script `SKIPPED` döndü; canlı OpenAI başarısı iddia edilmiyor.
Yeni bağımlılık eklenmedi; önceki Python 3.12 sanal ortamı doğrulamada yeniden kullanıldı.
Bu sandbox'ta pytest geçici dizin izinleri nedeniyle `--basetemp=../work/<ayrı-test-dizini>` kullanıldı.
Frontend'e başlanmadı. Değişiklikler yereldir; GitHub'a push yapılmadı.
