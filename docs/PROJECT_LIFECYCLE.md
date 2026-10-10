# Proje ve profesyonel kaynak yaşam döngüsü — 8 Ekim 2026

## Proje CRUD

Aday kendi projelerini listeler, birden fazla proje oluşturur, ad/açıklamayı PATCH ile değiştirir ve DELETE ile arşivler.
UI açık silme onayı ister; liste yenilenir ve yeni proje formu mevcut proje varken de görünür.
Kaynak URL / repository kimliği metadata düzenlemesinde değiştirilemez; farklı kaynak için yeni proje oluşturulur.
GitHub teknik proje tablosu GitHub kaynağıyla sınırlıdır; GitHub dışı portföy mevcut ProfileEvidenceItem üzerinden eklenir.
Liste mevcut API sınırıyla en fazla 100 aktif proje gösterir; UI her proje için activity okur. Daha büyük listelerde batch activity/pagination gelecek iştir.

`DELETE /projects/{id}` fiziksel silme değildir: `archived_at` yazılır, canlı GitHubRepositoryLink iptal edilir.
Project, snapshot, AnalysisRun ve SkillEvidence satırları tutulur; MatchEvidence FK'leri, frozen Match/Evidence Trace ve Proof Request snapshot'ları korunur.
İlgisiz profil kayıtları silinmez. Arşivli proje yeniden analiz/link/aktif okuma için 404 döndürür; yeni load_material sorguları arşivli projeyi dışlar.
Aynı repository arşivleme sonrası yeni proje olarak tekrar import edilebilir. Restore/purge ve retention yönetimi bu fazda yoktur.
Migration: **a16_project_lifecycle**, parent **a15_github_verification**. a15 değiştirilmedi.
Yeni alanlar nullable; mevcut veriler korunur. Aktif candidate/repository import kimliği için partial unique index vardır.
Arşiv/import verisi varken downgrade preserve/export gerektirir.

## GitHub import ve analiz

Hesap OAuth + PKCE → ayrı App kurulumu → kurulum/repository sorgusu → kullanıcı seçimi → Project + ilişki kaydı → public kaynak analizi.
Import bir repository başına atomiktir; project/link aynı commit'te oluşur. Analiz bundan sonra bağımsız çalışır.
Import source/LLM analizini beklemez. `POST /github/import-batch` aynı kurulumdan en fazla 20 seçili immutable repository ID alır; tekrarlanan ID'leri teke indirir ve her öğe için imported/existing/failed sonucu döndürür. Bir öğe hatası diğer commit'leri geri almaz.
Idempotent tekrar import proje/ilişki çoğaltmaz ve bitmiş/başarısız analizi tekrar başlatmaz. Başarısız analiz yalnız o projenin `POST /projects/{id}/analysis-jobs` çağrısıyla yeniden denenir. Aktif iş varsa aynı iş döner; eski senkron `/analyze` uç noktası aktif iş varken 409 verir.

### Kalıcı analiz kuyruğu ve restart sınırları

**a17_analysis_jobs** migration'ı API başlamadan önce `python -m alembic upgrade head` ile uygulanmalıdır. a16 değiştirilmedi.
Project + GitHubRepositoryLink önce atomik commit edilir; analiz işi sonraki ayrı transaction'dır.
Activity API authoritative `analysis.state` döndürür: not_started → queued → analyzing → succeeded/failed.
FastAPI lifespan worker'ları DB'deki kuyruğu tüketir. Varsayılan süreç başına iki worker, üst sınır dört; claim atomiktir (PostgreSQL SKIP LOCKED + durum kontrolü).
Aktif proje başına unique iş index'i çift tıklamayı engeller. Kanıt, başarılı AnalysisRun ve işin succeeded durumu aynı transaction'da yazılır.
Kaynak/provider hatası failed + güvenli hata kodu olarak kaydedilir; hesap bağlantısı ve repository provenance iptal edilmez.

Queued işler restart sonrasında alınabilir. Devam ederken process kaybolan işler süre dolana kadar bekler, ardından worker veya activity okuması tarafından failed yapılır; maliyetli analiz otomatik tekrar edilmez.
Varsayılan queue ve execution deadline ayrı ayrı 600 saniyedir; env ile sınırlı aralıkta ayarlanır.
Deadline sonrası geç gelen sonuç fence kontrolünden geçemez ve yeni kanıt yazamaz. Bu sistem dağıtık task broker veya thread'i zorla sonlandırma mekanizması değildir: takılmış çağrının thread'i HTTP/provider timeout'una bağlıdır, fakat DB/UI durumu süre dolunca failed olur.
Worker kapalıysa işler timeout olur. Çoklu API process sayısı toplam provider concurrency'sini artırır; global spend/concurrency yönetimi ayrıca gerekir.
Arşivleme aktif işi failed yapar ve geç gelen sonucu reddeder. Eski senkron analizlerin kesilmiş running kayıtları da deadline ile toparlanır.

UI import tamamlanınca proje listesini yeniler; her proje bağımsız analiz durumunu gösterir.
Queued/analyzing sırasında Analyze kapalıdır; tamamlanmamış analiz 0/0/0 nihai kanıt sonucu gibi gösterilmez.
Tek polling döngüsü yalnız aktif işler varken çalışır; terminal durumda durur, başarılı kanıt sayıları yenilenir.
Sayfa yenileme kalıcı activity durumunu okur; proje silinmesi ve component değişimi eski yanıtların uygulanmasını engeller.
Üç ardışık ağ hatasında polling durur ve durumun okunamadığı açıkça gösterilir; manuel yenileme mümkündür. Ağ hatası sahte failed/succeeded durumuna çevrilmez.

Private repository için Metadata-only izinle içerik analizi **yoktur**. App izni genişletilmez, 409 ile kapalı başarısız olur.
Private bilgisi provider yanıtında yoksa da conservative private kabul edilir.
Repository adı, sahiplik veya README teknoloji beyanı beceri yaratmaz. Observed/declared_only ayrımı mevcut analyzer/grounding kurallarına aittir.
Living Profile yalnız son başarılı analizdeki aktif proje kanıtını okur; bireysel yazarlık veya proficiency sonucu çıkarmaz.

## LinkedIn / kullanıcı kontrollü profil metni

Yalnız HTTPS `linkedin.com/in/<slug>` veya `www.linkedin.com/in/<slug>` bağlantısı; credential, port değişimi, query, fragment, path traversal reddedilir.
Hiçbir URL için sunucu fetch/scraping yapılmaz. URL tek başına linked referanstır; istihdam veya beceri doğrulaması değildir.
PDF upload bu fazda yoktur. Kullanıcı kendi profil metnini yapıştırır; deterministik, bounded parser kullanılır (LLM çağrısı yok).
En fazla 20 kayıt ve 20.000 karakter. Boş satır kayıt ayırır.

Açık alan formatı:

```text
work | Tasarımcı | Örnek kurum | Stajyer | 2024-01-01 | 2024-06-01
Kullanıcının kendi açıklaması

certification | Sertifika adı | Belgeyi veren kurum
```

Türler: work, internship, project, education, certification, community, volunteering, event, hackathon.
Eksik alanlar boş kalır. Tarihler yalnız açık ISO tarihiyse alınır. Serbest metinde ilk satır başlık, metin açıklama olur; kurum/rol/tarih tahmin edilmez.
Work/internship/project mevcut portfolio ailesinde tutulur; ayrı LinkedIn kanıt tablosu yoktur.
`professional-preview` DB'ye kayıt yazmaz; yalnız kullanıcının seçtiği indeksler `professional-import` confirmed=true ile kaydedilir.
Sunucu onay sırasında aynı input'u tekrar parse eder; client'ın icat ettiği preview kayıtlarını kabul etmez.
Import sonrası kaynak metnin ayrı kopyası/draft'ı tutulmaz; onaylanan başlık, açıklama ve açık alanlar kayıt içeriğidir.
Provenance: source_type=linkedin_profile, import_method=url/pasted_text, imported_at, record_kind, source_url ve açık candidate-provided source_label.
Pasted text kayıtları URL olsa bile declared_only kalır; sonraki metadata düzenlemesi bunu linked'e yükseltmez.
Kaynak URL'si kişinin o LinkedIn hesabına sahip olduğunu doğrulamaz.

## Eşleşme sınırları

Scorer, ağırlıklar ve resolver değişmedi. technical_skill observed teknik kanıt ister; metindeki Python vb. adlar bunu karşılamaz.
project_experience mevcut observed source_file kuralını korur; bir iş unvanı veya portföy metni bunu karşılamaz.
Desteklenen certification/community vb. kriterler mevcut deterministic profil kurallarına göre karşılanabilir; verification_status açık gösterilir.
Yeni work/internship eşleşme ailesi, prestij/sosyal/ağ/soft-skill bonusu yoktur.

## Önceki a16 doğrulaması

- Yeni backend targeted: 23 passed, 0 failed (SQLite).
- GitHub + yeni targeted: 101 passed, 0 failed (PostgreSQL18.6).
- Full backend SQLite: 459 passed, 0 failed.
- Full backend PostgreSQL18.6: 459 passed, 0 failed.
- a15→a16 gerçek PostgreSQL upgrade/check ve legacy veri koruması geçti; caller schema değiştirilmedi.
- Her backend suite'te bir mevcut Starlette TestClient/httpx deprecation uyarısı.

Browser QA için ayrı synthetic backend hazırlandı. Mevcut kullanıcı dev sunucusu değiştirilmedi. Ayrı frontend sunucusu başlatma otomatik onay politikası tarafından reddedildi; bu nedenle gerçek browser CRUD/import/390px/TR-EN QA tamamlanmadı.
Component interaction testleri tarayıcı görsel QA yerine geçmez. Gerçek OAuth/App kurulumu smoke ve 390px görsel/klavye incelemesi merge öncesi manuel yapılmalıdır.


Son frontend doğrulaması: **68 passed, 0 failed**. `npm run lint` ve `ZEMINAI_ENV=production` ile ayrı HTTPS example.test frontend/backend origin'leri kullanılarak optimized `npm run build` geçti (bu bir canlı deployment testi değildir).
`compileall`, `pip check`, yeniden üretim sonrası OpenAPI/types drift ve `git diff --check` geçti.
Version control kapsamındaki dosyalarda private-key/GitHub-token/provider-key pattern taraması bulgu vermedi; `.env`, venv ve `work/` tracked değil. Commit/push yapılmadı.


## 8 Ekim 2026 — Non-blocking import / analiz kuyruğu doğrulaması

- SQLite targeted (GitHub account/invariants, project lifecycle, professional import, analysis jobs): **109 passed, 0 failed** (14.11s).
- Gerçek PostgreSQL18.6 targeted: **109 passed, 0 failed** (26.25s).
- Gerçek PostgreSQL18.6 full backend: **467 passed, 0 failed** (71.15s).
- Her backend koşusunda bir mevcut Starlette TestClient/httpx deprecation uyarısı.
- İzole şemalar head a17'ye migrate edilerek Alembic schema check geçti. Caller zeminai_test şeması değiştirilmedi; eski a14 şemasındaki tanılama, yeni test şemalarının sonucu değildir.
- Frontend: **74 passed, 0 failed**; lint ve explicit production example.test origin'leriyle optimized build geçti.
- Compileall, pip check, yeniden üretim sonrası OpenAPI/types drift (NONE) ve git diff --check geçti.
- Yeni regresyonlar: üç ayrı import; A/C başarı, B provider failure; provenance koruması; yalnız B retry; immutable ID idempotency; aktif iş tekrarının engellenmesi; deadline/late-result fence; arşivleme; bağımsız DB bağlantılarıyla eşzamanlı tek claim; request dışında gerçek worker tüketimi.
- Frontend regresyonları: tek aksiyonda üç checkbox; üç projenin anında görünmesi; aktif Analyze kapalı; bağımsız failed/succeeded durumları; yalnız başarısız proje retry; terminal polling stop, page-refresh resume, stale-response cleanup, silinen proje ve üç ağ hatasında açık durum belirsizliği.
- Kullanıcının önceki canlı tek-import ölçümü **71,103.68 ms** idi. Yeni üç-import regresyonunda **35.20 ms** ölçüldü; bu SQLite + mocked GitHub ölçümüdür, canlı performans iddiası değildir. Import içinde source/LLM workflow çağrılmadığı ayrıca assert edilir.
- Son canlı incelemede 127.0.0.1:8000 eski OpenAPI'yi sunuyordu (analysis-jobs endpoint'i yok); Codex tarayıcısı /giris ekranındaydı. Kullanıcının üç gerçek repository'siyle final QA henüz tamamlanmadı. Yerel gerçek backend'e a17 migration + restart ve tarayıcıda aday girişi gerekir.
- Final QA hedefleri: yigitalpunal/complex-number-oop-t1, point3d-operations-oop-t2, cuboid-geometry-oop-t3. Gerçek OAuth/provider başarısı veya gerçek provider failure senaryosu bu otomatik testlerin sonucu gibi raporlanmaz.
- Commit/push yapılmadı.

### Bu düzeltme turunda değişen dosyalar

Önceden mevcut uncommitted GitHub/proje yaşam döngüsü çalışması korundu. Bu turun dosyaları:

- .env.example
- README.md
- backend/app/api/github_account.py
- backend/app/api/routes.py
- backend/app/core/config.py
- backend/app/main.py
- backend/app/models/domain.py
- backend/app/schemas/github_account.py
- backend/app/services/analysis_jobs.py
- backend/app/services/workflows.py
- backend/migrations/versions/a17_analysis_jobs.py
- backend/tests/conftest.py
- backend/tests/test_analysis_jobs.py
- backend/tests/test_project_lifecycle.py
- frontend/openapi.json
- frontend/src/lib/api/schema.d.ts
- frontend/src/lib/api/client.ts
- frontend/src/lib/api/github.ts
- frontend/src/lib/project-polling.ts
- frontend/src/components/github-connection.tsx
- frontend/src/components/project-workspace.tsx
- frontend/src/i18n/tr.ts
- frontend/src/i18n/en.ts
- frontend/tests/github.test.ts
- frontend/tests/project-lifecycle.test.ts
- frontend/tests/project-polling.test.ts
- docs/GITHUB_ACCOUNT_VERIFICATION.md
- docs/PROJECT_LIFECYCLE.md

## Provider failure diagnostics and bounded capacity (8 October 2026)

Analysis jobs persist a safe error code, `retryable`, and allowlisted stage/HTTP
status metadata (`a18_analysis_diagnostics`). Structured `zeminai.analysis` logs
include job/project identifiers, provider/model, attempt, duration and stage;
source bodies, prompts, response bodies, headers and secrets are excluded.
Old failures retain their original code; their historical HTTP status cannot be
recovered from the old job record.

`LLM_RATE_LIMITED` (429), `LLM_TIMEOUT` (408/transport timeout),
`LLM_UNAVAILABLE` (5xx/network), `LLM_CONFIGURATION_ERROR` (401/403), and
`LLM_REQUEST_REJECTED` (other nonretryable HTTP/refusal) distinguish transport
conditions. `INVALID_MODEL_OUTPUT` remains the schema/envelope error;
`GROUNDING_REJECTED` identifies an exhausted semantic repair in job state.
Existing source-specific errors, including `INSUFFICIENT_PROJECT_DATA`, remain
separate. Unexpected workflow errors use `ANALYSIS_INTERNAL_ERROR`.

Transport requests retain `LLM_MAX_RETRIES` (0–2, default 2): at most three HTTP
attempts per generation. Backoff is 1/2 seconds plus 0–0.5 seconds jitter.
Retry-After seconds or HTTP dates are honored, with a 30-second wait bound: if
the provider asks for longer, the operation fails retryably instead of retrying
early. No new attempt/wait starts after the job deadline. Request timeouts are
clamped to remaining time; the existing database deadline fence still prevents
late evidence writes. Retry exhaustion persists a terminal failed job.
Authentication/configuration, deterministic validation and nonretryable 4xx
errors are not automatically retried. The existing single semantic repair is
unchanged: at most two generations, each with the same bounded transport budget
(at most six HTTP attempts total). Operation budgets are still consumed at job
admission; this is not a token/spend cap.

`ANALYSIS_PROVIDER_MAX_CONCURRENCY=1` (range 1–4; restart to change) bounds the
local process. Workers acquire the shared slot *before* claiming a job, leaving
excess work queued without spinning or creating analysis runs. The conservative
slot covers source loading through completion and internal retries; direct
Gemini/OpenAI calls share it. `ANALYSIS_WORKER_THREADS` remains independent.
Multiple backend processes each have their own limit; use a distributed limiter
or provider-level quota management before claiming a global guarantee. Queue
expiry and interrupted-worker deadline reconciliation remain in force.

Live diagnostic replay of the saved point3d material on `gemini-3.8-flash`
observed HTTP 503 and then 429 during the allowed semantic repair. This does
not prove the exact HTTP status of previous opaque `LLM_PROVIDER_ERROR` jobs,
nor guarantee that local serialization resolves provider/account quotas.
The three saved inputs at that diagnostic stage contained README and C++ language
metadata; the reader then omitted `.cpp`. The subsequent source-reader fix adds
`.c`, `.cc`, `.cpp`, `.cxx`, `.h`, `.hh`, `.hpp`, `.hxx` with the existing 30-file,
100,000-byte per-file and 1,000,000-byte total bounds. `generated` and `CMakeFiles`
join the excluded directories. UTF-8/NUL checks, regular-file filtering and
commit-pinned GitHub blob reads remain unchanged; no archives are extracted.
The three live repositories now supply nonempty `.cpp` implementation excerpts
to the analyzer context. This does not guarantee model/grounding success:
lexical grounding, bounded excerpts and existing evidence/scoring rules remain
unchanged. File extensions do not confer observed evidence; README claims retain
declared-only semantics. This source-material check makes no new analysis-success claim.
