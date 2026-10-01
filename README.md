# ZeminAI

**Doğrulanabilir Yetenek ve Akıllı Eşleşme Platformu**

ZeminAI, adayların public GitHub projelerinden gözlemlenebilir teknik kanıtlar çıkarır ve kurum ihtiyaçlarını yapılandırılmış kriterlere dönüştürür. CV ve öz-beyanın yanında incelenebilir kaynaklar sunar; eşleşme sonucunu hangi kriterin hangi proje kanıtıyla karşılandığını göstererek açıklar. Çalışan MVP, FastAPI tabanlı bir backend’dir; demo Swagger üzerinden kullanılabilir.

## Problem

CV’deki beceri beyanlarını doğrulamak ve dağınık proje bilgilerini incelemek zaman alır. Kurumların doğal dildeki ihtiyaçları her zaman açık teknik kriterlere dönüşmez; tek başına verilen bir eşleşme skoru da kararın dayanağını göstermez.

## Çözüm

```mermaid
flowchart LR
    A[Aday ve proje] --> G[Public GitHub repository]
    G --> S[Repository snapshot]
    S --> E[Beceri ve kanıt analizi]
    N[Kurum ihtiyacı] --> C[Required / preferred kriterler]
    E --> M[Deterministik matching]
    C --> M
    M --> R[Skor, karşılanan kriterler ve kaynak kanıtları]
```

Snapshot, incelenen dosyaları ve commit referansını saklar. Eşleşme sonucu kanıt kimlikleri, karşılanan/karşılanmayan kriterler ve belirsizliklerle birlikte okunabilir.

## Neden Farklı?

- Beyan (`declared_only`) ile gözlemlenen kanıt (`observed`) ayrılır; yalnız observed kanıt skora girer.
- Kanıt gücü, kişinin beceri seviyesi değildir. Kanıt bulunamaması da becerinin olmadığı anlamına gelmez.
- LLM final skoru üretmez; matching aynı girdilerle aynı sonucu veren bir fonksiyondur.
- LLM çıktısı ortak JSON Schema, strict Pydantic ve kaynak/alıntı kontrollerinden geçer.
- Repository içeriği güvenilmeyen veri olarak ele alınır. Analizler provider, model ve sürüm bilgileriyle izlenir.

## MVP Akışı

1. `Candidate` oluşturun.
2. Adaya bir `Project` eklerken public GitHub URL’sini belirtin.
3. Proje analizini başlatın; `RepositorySnapshot` ve `AnalysisRun` kaydedilir.
4. Üretilen `SkillEvidence` kayıtlarının kaynaklarını ve sınırlamalarını inceleyin.
5. `OrganizationNeed` oluşturun; doğal dil analizi `NeedCriterion` kayıtlarını üretir. Kriterler açıkça da girilebilir.
6. Aday ve ihtiyaç için match oluşturun.
7. Skor, required/preferred kapsamı, matched/unmatched kriterler ve ilişkili kanıtları okuyun.

En az bir başarılı proje analizi olmadan match oluşturulamaz. Kanıt üretilmemesi geçerli bir analiz sonucu olabilir.

## Mimari

Tek backend içinde modüler bir yapı kullanılır; ayrı mikroservisler yoktur.

```mermaid
flowchart TD
    U[Swagger / API istemcisi] --> API[FastAPI endpointleri]
    API --> W[Workflow katmanı]
    W --> G[GitHub fetch]
    G --> S[RepositorySnapshot]
    S --> A[Analiz katmanı]
    W -->|Kurum ihtiyacı| A
    A --> P[rule_based / Gemini / OpenAI]
    P --> V[Doğrulanmış domain çıktıları]
    V --> W
    W --> M[Deterministik matching]
    W --> DB[(PostgreSQL)]
    M --> W
```

Provider adaptörleri yalnız API iletişimi ve structured output taşır; veritabanı işlemleri workflow katmanındadır. Gemini ve OpenAI aynı project/need analyzer ve Pydantic sözleşmelerini kullanır. Analiz kayıtlarında provider/model, analiz sürümü, başlangıç/bitiş zamanı ve proje için commit SHA tutulur.

## Yapay Zekâ Nerede Kullanılıyor?

LLM, sınırlı proje açıklaması/README/kaynak dosya bağlamından beceri kanıtları ve açıklamalar çıkarır; kurum ihtiyacını `required` ve `preferred` kriterlere dönüştürür. Alıntıların gönderilen kaynakta bulunması ve beceriyle ilişkisi backend tarafından kontrol edilir.

AI işe alınma olasılığı veya genel yetenek puanı hesaplamaz. Final matching skoru aşağıdaki sabit formülle hesaplanır. Kaynak doğrulaması kodun çalıştığını, adayın kodu yazdığını veya model yorumunun her durumda doğru olduğunu ispatlamaz.

## Kanıt Modeli

| Alan | Değerler | Anlamı |
|---|---|---|
| `evidence_status` | `observed`, `declared_only`, `not_found` | Gözlemlenen kanıt, yalnız beyan veya kanıt bulunamaması |
| `evidence_strength` | `weak`, `medium`, `strong` | Kanıtın destek gücü; kişinin beceri seviyesi değil |
| `evidence_type` | `project_description`, `readme`, `source_file`, `dependency_file`, `repository_language`, `user_claim` | Kanıtın kaynak türü |

LLM analizinde README/açıklama/beyan kanıtı `declared_only / weak` olarak sınırlandırılır. Dependency-only kanıt en fazla `medium`, repository dil bilgisi `weak` olur. Evidence kayıtları kaynak URL’si, varsa dosya yolu, alıntı, gerekçe ve sınırlamalar taşır.

**Evidence strength ≠ skill proficiency.** Contributor sahipliği doğrulanmaz.

## Eşleşme / Scoring

[Scorer](backend/app/services/matching/scorer.py), normalize edilmiş `skill_key` eşleşmesini ve yalnız `observed` kanıtları kullanır. Bir kriterin birden fazla kanıtı olması kapsamı artırmaz; evidence strength bir puan çarpanı değildir.

`requiredCoverage` ve `preferredCoverage`, ilgili grupta kanıtla karşılanan kriter sayısının toplam kriter sayısına oranıdır.

| Kriterler | Formül |
|---|---|
| Required ve preferred birlikte | `100 × (0.80 × requiredCoverage + 0.20 × preferredCoverage)` |
| Yalnız required | `100 × requiredCoverage` |
| Yalnız preferred | `100 × preferredCoverage` |
| Kriter yok | HTTP 422, `MATCHING_FAILED` |

Skor 0–100 aralığındadır; sürüm `evidence-coverage-v0.2` olarak saklanır. Örneğin iki required kriterden biri karşılanıp tek preferred kriter karşılanmıyorsa skor 40’tır.

**Skor, mevcut ihtiyaca karşı erişilebilir proje kanıtlarının uyumudur; işe alınma ihtimali veya genel yetenek skoru değildir.**

## Canlı AI Doğrulaması

Ekip tarafından çalıştırılan gerçek Gemini smoke testi başarılıdır (*live integration validated*). Doğrulanan demo ayarları:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
LLM_TIMEOUT_SECONDS=120
```

Project ve need structured output Pydantic doğrulamasından, proje kanıtları evidence grounding kontrolünden geçti.

| Örnek | Doğrulanan sonuç |
|---|---|
| Python proje kanıtı | `observed / repository_language / weak` |
| FastAPI proje kanıtı | `observed / source_file / strong` |
| İhtiyaç kriterleri | Python required, FastAPI required, Docker preferred |

Bu örnekte uydurma kriter görülmedi. Sonuç demo entegrasyonunu doğrular; production sertifikasyonu veya genel model kalite garantisi değildir. Demo için 120 saniyelik HTTP timeout kullanılır; retry toplam süreyi uzatabilir.

## Desteklenen Analiz Modları

| `LLM_PROVIDER` | Kullanım ve doğrulama |
|---|---|
| `rule_based` | Anahtarsız geliştirme/test; sınırlı kural tabanlı analiz |
| `gemini` | generateContent REST adaptörü; mock testler ve canlı demo doğrulandı |
| `openai` | Responses REST adaptörü; mock testler geçti, canlı OpenAI testi henüz yapılmadı |

Kod varsayılanı `rule_based`, `.env.example` demo seçimi `gemini`dir. Modeller environment üzerinden gelir; kodda sabitlenmez. Seçilen LLM için key/model eksikse `LLM_NOT_CONFIGURED` döner; sessiz fallback yoktur. Açık kriterlerle ihtiyaç oluşturmak LLM çağrısı gerektirmez.

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Backend | Python 3.12+, FastAPI, Uvicorn |
| Validation | Pydantic 2, pydantic-settings |
| ORM / migration | SQLAlchemy 2, Alembic |
| Veritabanı | PostgreSQL; varsayılan testlerde SQLite |
| HTTP / AI | httpx; Gemini ve OpenAI REST adaptörleri |
| Test | pytest, HTTP mock transport |
| Yerel veritabanı | Docker Compose, PostgreSQL 16 |

Sürümler [requirements.txt](backend/requirements.txt) içinde sabittir. `frontend/` yalnız plan/placeholder içerir; Next.js + TypeScript uygulaması henüz geliştirilmemiştir.

## API

| Method | Endpoint | Amaç |
|---|---|---|
| POST | `/candidates` | Aday oluştur |
| GET | `/candidates/{candidate_id}` | Adayı oku |
| POST | `/candidates/{candidate_id}/projects` | GitHub URL’siyle proje ekle |
| GET | `/projects/{project_id}` | Projeyi oku |
| POST | `/projects/{project_id}/analyze` | Snapshot ve kanıt analizi oluştur |
| GET | `/snapshots/{snapshot_id}` | Snapshot’ı oku |
| GET | `/evidence/{evidence_id}` | Kanıtı oku |
| GET | `/analysis-runs/{run_id}` | Analiz durumunu ve metadata’yı oku |
| POST | `/needs` | İhtiyaç ve kriterleri oluştur |
| GET | `/needs/{need_id}` | İhtiyacı oku |
| POST | `/matches` | Eşleşme hesapla ve kaydet |
| GET | `/matches/{match_id}` | Açıklanabilir sonucu oku |
| GET | `/health` | Uygulama ve DB bağlantısını kontrol et |

[Swagger](http://127.0.0.1:8000/docs) istek/yanıt örneklerini ve alanları gösterir; sözleşme `/openapi.json` üzerinden sunulur. Mevcut API oluşturma/okuma ve analiz işlemlerini kapsar; update/delete endpointleri yoktur.

Hatalar `error.code`, `message`, `retryable`, `details` alanlarıyla döner. LLM timeout, provider ve validation hataları sırasıyla `LLM_TIMEOUT`, `LLM_PROVIDER_ERROR`, `INVALID_MODEL_OUTPUT` olarak ayrılır.

## Hızlı Başlangıç

Python 3.12+, Git ve Docker Compose gerekir. Docker yerine erişilebilir bir yerel PostgreSQL de kullanılabilir.

```bash
git clone https://github.com/cgdsgcgll/devora-zeminai.git
cd devora-zeminai
python -m venv .venv
```

Platformunuza göre environment dosyasını kopyalayın ve sanal ortamı etkinleştirin:

| Windows PowerShell | Linux/macOS |
|---|---|
| `Copy-Item .env.example .env` | `cp .env.example .env` |
| `.\.venv\Scripts\Activate.ps1` | `source .venv/bin/activate` |

Repo kökündeki `.env` içinde Gemini anahtarınızı yerel olarak tanımlayın; anahtarı Git’e eklemeyin. Anahtarsız deneme için `LLM_PROVIDER=rule_based` seçin. Ardından ortak adımları çalıştırın:

```bash
python -m pip install -r backend/requirements.txt
docker compose up -d --wait
cd backend
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Swagger’ı açıp MVP akışını izleyin. Sunucuyu durdurduktan sonra aynı ortamda `python -m pytest -q` çalıştırabilirsiniz. Yerel PostgreSQL kullanıyorsanız Compose adımını atlayıp `DATABASE_URL` değerini kendi geliştirme veritabanınıza göre düzenleyin. Uygulama başlangıcı tablo oluşturmaz; migration adımı gereklidir.

### Environment ayarları

`.env` repo kökünden otomatik okunur; process environment değişkenleri önceliklidir. Aşağıdaki değerler [.env.example](.env.example) ile uyumludur.

| Değişken | Örnek / kullanım |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@localhost:5432/zeminai`; yalnız yerel Compose örneği |
| `GITHUB_TOKEN` | Boş; public repository erişimi için isteğe bağlı |
| `LLM_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | Boş; Gemini için yerel olarak doldurun |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| `LLM_API_KEY`, `LLM_MODEL` | Boş; OpenAI seçildiğinde doldurun |
| `LLM_TIMEOUT_SECONDS` | `120`; her HTTP denemesi için |
| `LLM_MAX_RETRIES` | `2`; geçici hatalarda en fazla iki ek deneme |
| `LLM_MAX_INPUT_BYTES` | `24000`; serialize edilmiş LLM kullanıcı bağlamı sınırı |
| `LLM_MAX_OUTPUT_TOKENS` | `4000` |

Gemini anahtarı [Google AI Studio](https://aistudio.google.com/apikey) üzerinden oluşturulabilir. Free Tier erişimi ve model limitleri hesap/projeye göre değişebilir; demo öncesi [resmi fiyatlandırma ve erişim bilgilerini](https://ai.google.dev/gemini-api/docs/pricing) kontrol edin.

## Testler ve Doğrulama

**131 tests passed.** Bu dokümantasyon incelemesinde SQLite suite’i yeniden çalıştırıldı. Aynı 131 test PostgreSQL 18.6 üzerinde önceki backend doğrulamasında da geçti.

Kapsam: matching sınır durumları, API oluşturma/okuma akışları, GitHub HTTP mock’ları, evidence semantiği, provider timeout/429/5xx hataları, Gemini istek sözleşmesi, structured output doğrulaması, metadata ve migration upgrade/downgrade ile eski kayıtların korunması. Testler gerçek API anahtarı veya internet gerektirmez. Mevcut Starlette/AnyIO deprecation uyarısı testleri başarısız kılmaz.

Etkin sanal ortamla `backend/` içinde:

```bash
python -m pytest -q
python -m compileall -q app tests migrations scripts
python -m pip check
python -m alembic check
```

`alembic check` migrate edilmiş, erişilebilir DB gerektirir. PostgreSQL suite’i için ayrı bir test DB’sini migrate edin; `DATABASE_URL` ve `TEST_DATABASE_URL` değişkenlerini bu DB’ye ayarlayıp pytest çalıştırın. Test fixture’ları dış transaction/savepoint kullanır; üretim DB’sini kullanmayın.

İsteğe bağlı canlı test: `python scripts/smoke_llm.py`. Seçilen provider’ın key/model ayarı yoksa `SKIPPED` döner; varsa iki gerçek API çağrısı yapar ve ücret doğurabilir. Docker Compose başlatma bu doğrulama ortamında çalıştırılmadı; DB kontrollerinde yerel PostgreSQL kullanıldı.

## Güvenlik ve Güvenilirlik İlkeleri

- Repository metni sistem talimatı değil, güvenilmeyen veri olarak gönderilir; dosyalardaki talimatları izlememesi modele açıkça söylenir. Bu, prompt injection’a karşı mutlak garanti değildir.
- Structured output strict Pydantic ile doğrulanır. Uydurulan path, gönderilmeyen alıntı ve kaynakta desteklenmeyen beceri reddedilir; kaynak URL’leri backend tarafından belirlenir.
- GitHub okuyucusu yalnız public repository kabul eder; en fazla 30 dosya, dosya başına 100 KB ve toplam 1 MB içerik alır. LLM bağlamında dosya alıntıları ayrıca sınırlandırılır; tüm repository’nin analiz edildiği iddia edilmez.
- GitHub dil metadatası güncel repository durumudur; dosyalar gibi commit anına sabitlenmez.
- `.env` ignore edilir; örnek key alanları boştur. Provider ham hata gövdeleri ve hassas header’lar API hata cevabına konmaz.
- Analiz hatalarında durum kaydedilir; alınmış snapshot korunur. DB bağlantı kesintisinde `running` kalan kayıtlar için otomatik toparlama henüz yoktur.

## Mevcut Durum

### Uygulananlar

- Aday, proje, ihtiyaç ve eşleşme oluşturma/okuma; Swagger sözleşmesi.
- Public GitHub snapshot, kaynaklı evidence, üç analiz modu ve kalıcı analiz kayıtları.
- Deterministik scoring, kriter/kanıt ilişkileri, PostgreSQL modeli ve Alembic migration’ları.

### Sonraki Adımlar

- Frontend MVP ve kullanıcı akışları.
- Authentication/authorization ve tenant izolasyonu.
- Background jobs, analiz yeniden başlatma ve sürekli profil güncellemeleri.
- Contributor attribution ve tam GitHub hesap aktarımı.
- Deployment, operasyon kontrolleri ve model kalite değerlendirmeleri.

## Proje Yapısı

```text
backend/
  app/api/                 Endpointler
  app/core/                Ayarlar, hata ve beceri normalizasyonu
  app/models/              SQLAlchemy modelleri
  app/schemas/             Pydantic sözleşmeleri
  app/services/            GitHub, analiz, LLM, matching ve workflow
  migrations/              Alembic migration’ları
  tests/                   Otomatik testler
  scripts/                 Canlı smoke testi
frontend/                  Plan/placeholder
docs/                      Vizyon ve geliştirme kayıtları
docker-compose.yml         Yerel PostgreSQL
.env.example               Secretsız demo ayarları
```

[Orijinal ürün vizyonu](docs/VISION.md) daha geniş hedefleri içerir; mevcut uygulama kapsamı bu README’de açıklanır.

## Ekip

- **Çağdaş** — AI, matching ve teknik koordinasyon.
- **Yiğit Alp Ünal** — Backend, veritabanı ve entegrasyon.
- **Azra Gülbahar** — Ürün, UX, veri ve kalite.
