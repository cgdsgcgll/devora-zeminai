# GitHub hesap ve repository erişim doğrulaması — Faz 1

Bu özellik yalnız adayın bir GitHub hesabını kontrol ettiğini ve seçili repository'ye
bu hesap ile yetkilendirilmiş GitHub App kurulumunun kesişiminde erişilebildiğini doğrular.
Hesapsız adayın yeteneksiz olduğu sonucuna varılmaz; GitHub yalnız bir kanıt sağlayıcısıdır.

- `personal_owner`: GitHub repository owner tipi `User` ve immutable owner ID, bağlı GitHub user ID ile aynı.
- `account_access`: organizasyon veya başka kullanıcı repository'sine doğrulanmış kurulum erişimi.
- Hiçbiri yazarlık, katkı yüzdesi, tüm kodun sahipliği veya yetkinlik iddiası değildir.
- Skor, declared-only teknik kanıt, evidence strength, Proof Request ve frozen Match/Evidence Trace değişmez.
- İlişki kaydı son doğrulamanın metadata'sıdır. Kullanıcının seçtiği public repository içe aktarılınca normal kaynak analizi çalışır; private içerik indirme ve arka plan senkronizasyonu yoktur.
- Manuel/public URL akışı korunur; eski projeler kendiliğinden sahiplenilmez.

## GitHub App kurulumu

GitHub App oluşturun; OAuth App kullanmayın. Minimum repository izni yalnız **Metadata: read-only**.
Contents, commit, organization Members veya yazma izni istenmez. Kullanıcı/kurulum API'leri
App ve kullanıcının ortak erişimini döndürür. Kurulumu gerekli repository'lerle sınırlandırın.
Expiring user access tokens seçeneği desteklenir. Webhook işleme bu fazda uygulanmadı;
webhook teslimini etkinleştirmeyin ve anlık revocation senkronizasyonu beklemeyin.

Sunucu config alanları:

| Değişken | Kullanım |
|---|---|
| `GITHUB_APP_SLUG` | App sayfasındaki public slug; 1–100 küçük ASCII harf/rakam, tek tirelerle ayrılabilir; URL, boşluk, büyük harf ve path/query kabul edilmez |
| `GITHUB_APP_CLIENT_ID` | GitHub App client ID |
| `GITHUB_APP_CLIENT_SECRET` | Secret manager üzerinden client secret |
| `GITHUB_APP_CALLBACK_URL` | Kayıtlı sabit callback; ör. local `http://127.0.0.1:8000/github/callback` |
| `GITHUB_APP_ENCRYPTION_KEY` | Ayrı, Fernet uyumlu 32-byte URL-safe base64 anahtar; secret manager üzerinden |

Bu çalışma gerçek anahtar/token oluşturmaz veya örnek dosyaya koymaz. Eksik/bozuk config
`GITHUB_APP_NOT_CONFIGURED` döndürür; public GitHub okuma bundan bağımsızdır.
Production callback HTTPS olmalı, host `TRUSTED_HOSTS` içinde bulunmalı.
İzinli callback path'leri `/github/callback` ve reverse proxy için `/api/github/callback`.
Başarılı callback yalnız `CORS_ORIGINS[0] + /aday` adresine yönlenir; kullanıcı redirect parametresi yoktur.
Callback ve frontend aynı cookie host'unu kullanmalı; localhost ve 127.0.0.1 karıştırılmamalı.
Yerel HTTP yalnız mevcut development cookie ayarıyla çalışır; production Secure cookie korunur.
Proxy dış callback'i API'ye yönlendirmeli; **proxy/ingress/CDN erişim loglarında callback query string'i
ve request body/header credential'larını kaydetmeyin**. Backend middleware callback query'sini sunucu
access log'undan önce ayırır; callback yanıtı no-store/no-referrer döner. APM body/query yakalamayı da kapatın.

## Ayrı hesap bağlantısı ve kurulum adımı

1. Aday önce ZeminAI üzerinden GitHub hesabını mevcut state/session-bound OAuth + PKCE S256 akışıyla bağlar.
2. Bağlı aday **GitHub App’i kur / repository erişimi ver** aksiyonunu kullanır. Backend `GET /github/installation-url` ile yalnız `https://github.com/apps/{validated_slug}/installations/new` üretir. Frontend adres oluşturmaz; client slug, URL veya redirect parametresi adresi değiştiremez. Eksik/bozuk slug 503 `GITHUB_APP_NOT_CONFIGURED` üretir; mevcut hesap bağlantısını iptal etmez.
3. GitHub’da gerekli repository’ler seçilir. Aday ZeminAI’ye dönüp **Kurulumları yenile** ile aynı bağlantının user token’ı üzerinden listeyi yeniden sorgular. Yeniden OAuth bağlantısı gerekmez; boş listede de kurulum aksiyonu gösterilir. Kurum hesapları bu özel kontrollere erişemez.

GitHub App ayarlarında **Request user authorization (OAuth) during installation seçeneğini ETKİNLEŞTİRMEYİN**.
ZeminAI bağımsız OAuth/PKCE akışını zaten yürütür; kurulum ikinci bir OAuth başlangıcı değildir.
[GitHub’ın resmi App kayıt rehberi](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) bu seçeneği ve ayrı Setup URL alanını açıklar.

- **Local:** development App slug/client ID/client secret/encryption key backend config’inde olmalı. User authorization callback `http://127.0.0.1:8000/github/callback`; frontend `CORS_ORIGINS[0]=http://localhost:3000`. İsteğe bağlı Setup URL `http://localhost:3000/aday`. Cookie host’larını karıştırmayın; development HTTP cookie ayarı kullanılır. Setup URL yoksa aday manuel olarak `/aday` sayfasına döner.
- **Production:** deployment’a ait App/config kullanın; callback `https://<uygulama-host>/api/github/callback` (proxy yönlendirmesiyle) veya izinli `/github/callback` olmalı. `TRUSTED_HOSTS` host’u içermeli; `CORS_ORIGINS[0]` gerçek HTTPS frontend origin’i olmalı. İsteğe bağlı Setup URL `https://<frontend-host>/aday`; production Secure cookie korunur. Secret’lar secret manager’dan gelir; slug public metadata’dır. Gerçek HTTPS/proxy/cookie smoke deployment sırasında ayrıca gerekir.
- Setup URL, OAuth callback değildir. Redirect’teki `installation_id`, `setup_action` veya başka parametreler erişim kanıtı olarak **asla kullanılmaz**. Seçilen installation ID tarayıcıdan gelse bile backend bağlı user token’ıyla `/user/installations` kesişimini ve repository listesini GitHub API üzerinden yeniden doğrular. Spoof edilmiş ID ilişki oluşturamaz.
- Kurulum veya liste yenileme skor/evidence üretmez. Matching, evidence strength, Proof Request ve frozen snapshot semantiği değişmez.

## Güvenlik ve saklama

OAuth state 256-bit rastgele, DB'de SHA-256 hash; PKCE S256 verifier şifreli saklanır.
State aday ve mevcut session ID ile bağlı, beş dakika geçerli, atomik UPDATE ile tek kullanımlıktır.
Provider hatası state'i yeniden kullanılabilir yapmaz. Callback sonunda session ve iptal kontrolü tekrar yapılır.
Başka hesap/session, eksik, bilinmeyen, süresi dolmuş veya kullanılan state reddedilir.

Sonradan repository listelemek için access/refresh tokenları **cryptography Fernet authenticated encryption**
ile at-rest şifreli saklanır. API modellerinde ciphertext veya token alanı yoktur.
Token expiry ayrı tutulur; refresh PostgreSQL row lock altında yapılır.
Rotasyon sonucunun provider metadata hatasında kaybolmaması için yenilenen tokenlar önce kalıcılaştırılır.
Bozuk ciphertext, başarısız/kimlik değiştiren refresh, expired refresh veya reddedilen erişim kapalı başarısız olur.
Uygulama anahtarı DB ile birlikte saklanmamalıdır; otomatik key rotation uygulanmadı.
Anahtar kaybında yeniden bağlantı gerekir; sessiz plaintext fallback yoktur.

DB revision: `a15_github_verification`, önceki `a14_proof_requests`.
`github_connections`: aktif candidate ve aktif immutable GitHub user ID için ayrı partial unique index.
`github_oauth_states`: unique state hash, candidate/session FK, expiry ve consumption.
`github_repository_links`: project başına tek ilişki; project/candidate ve connection/candidate composite FK,
relationship/owner type check constraint. Kimlikler JSON'da precision kaybı olmaması için decimal string'dir.
Data bulunan provenance tablolarının downgrade'i bilinçli olarak engellenir; export/preserve gerekir.
Kurulumlar ayrıca DB'de cache'lenmez; seçilen installation ID ilişki snapshot'ında tutulur.

## API

Tümü authenticated candidate içindir; project işlemleri ayrıca ownership denetler.
Mutating işlemler mevcut exact-origin CSRF kontrolünü kullanır; OAuth GET callback state/session ile korunur.
Connect/listeleme/link, mevcut DB-backed compute attempt bütçesini kullanır.

| Method | Path |
|---|---|
| POST | `/github/connect` |
| GET | `/github/callback` |
| GET / DELETE | `/github/connection` |
| GET | `/github/installation-url` |
| GET | `/github/installations` |
| GET | `/github/installations/{installation_id}/repositories` |
| GET / POST / DELETE | `/projects/{project_id}/github-relationship` |

GitHub metadata çağrıları sabit github.com/api.github.com hedeflerine gider; redirect izlenmez.
Her çağrı 10 saniye timeout ve 2 MB yanıt sınırına sahiptir. En fazla 100 kurulum ve kurulum başına
500 repository, sayfa başına 100 kayıt desteklenir. Eksik/değişen/tekrarlı veya sınırı aşan liste
kısmi doğrulama üretmez; fail closed olur. Repo seçimi kurulum kesişimini tekrar sorgular.
İlk ilişki projenin normalize URL'siyle eşleşmelidir; daha önce bağlı numeric repository ID
aynı kaldığında rename desteklenir. Arbitrary client URL'si üzerinden HTTP yapılmaz.
Project ilişki okuması sabit sayıda DB sorgusudur; proje listelerine N+1 metadata zenginleştirmesi eklenmez.

## Disconnect ve sınırlar

Yerel disconnect token materyalini temizler, aktif ilişki kayıtlarını iptal eder ve pending OAuth flow'larını siler.
Projeler, analiz/kanıt geçmişi, eski Match/Trace ve Proof Request'ler korunur.
GitHub tarafındaki authorization'ı uzaktan kaldırmaz; kullanıcı bunu GitHub Settings üzerinden ayrıca yapabilir.
Webhook yoktur: GitHub tarafındaki revoke/permission değişikliği bir sonraki erişim denemesinde fark edilir.
401, geçersiz şifreli kimlik bilgisi veya başarısız token yenileme bağlantıyı kullanılamaz işaretler. Kurulum/repository keşfi ve link doğrulamasındaki 403/404 yalnız ilgili işlemi reddeder; hesabı veya mevcut ilişki kayıtlarını iptal etmez. /user hataları repository erişim hatası olarak etiketlenmez. Rate-limit (429 veya rate-limit header içeren 403), timeout ve 5xx provider hatasıdır; bağlantı korunur ve doğrulama başarısı üretilmez.
GET ilişki kaydı anlık GitHub revalidation yapmaz; kullanıcı yeni link doğrulaması başlatabilir.

Çok worker'lı deployment için PostgreSQL gerekir; SQLite demo/test desteği vardır,
PostgreSQL row lock concurrency garantileri SQLite için iddia edilmez.
Gerçek App kurulumu ve HTTPS/cookie callback smoke deployment incelemesinde ayrıca doğrulanmalıdır.
Yerel PostgreSQL18 test sonucu aşağıdadır; deployment veritabanının migration/izinleri ayrıca kontrol edilmelidir.

## 7 Ekim 2026 — İlk yerel doğrulama (tarihsel kayıt)

- Backend SQLite full suite: **398 passed**, 1 Starlette TestClient/httpx deprecation warning (failure değil).
- Yeni GitHub güvenlik/invariant testleri: **40 passed**. Aynı ilişki okuması 1 ve 12 projede sabit, en fazla 6 SELECT.
- Migration fresh/önceki head upgrade, mevcut veri koruması, guarded downgrade ve concurrent duplicate identity constraint: SQLite PASS.
- compileall, pip check, Alembic check ve OpenAPI drift: PASS.
- Frontend: **61 passed**; lint ve production build (development demo config) PASS.
- Yerel mock browser QA: disconnected/config error, connected, kurulum/repository seçimi,
  kişisel/organizasyon etiketi, disconnect, TR/EN, legacy URL korunması, institution kontrol ayrımı ve 390px taşma kontrolü PASS.
- Gerçek PostgreSQL denemesi **OperationalError** verdi; bu turda PostgreSQL test sayısı **0**, PASS iddiası yok.
  Ayrı PostgreSQL testleri için boş izole şemalarla `TEST_DATABASE_URL`,
  `TEST_GITHUB_MIGRATION_URL` ve `TEST_GITHUB_CONCURRENCY_URL` desteklenir.
- Gerçek GitHub App OAuth/HTTPS callback testi yapılmadı; yukarıdaki manuel App/secret manager kurulumu gerekir.
- Gerçek key/token oluşturulmadı. Testler yalnız sentetik fixture değerleri kullanır.

## 7 Ekim 2026 — PostgreSQL audit düzeltmesi ve doğrulama

Manuel PostgreSQL targeted turu **28 failed, 12 passed** olarak bildirildi.
Bu başarısız tur sonrasında test izolasyonu ve tarih dönüşümü düzeltildi.
Gerçek PostgreSQL **18.6** üzerinde güncel sonuç: **targeted 45 passed, 0 failed** (9.20s),
**full backend 403 passed, 0 failed** (61.32s). İki çalıştırmada da birer
Starlette TestClient/httpx deprecation warning var; test failure yok.

- GitHub fixture'ı artık App alanları ve sentetik Fernet materyali yanında environment,
  trusted hosts ve CORS origin ayarlarını da aynı süreçte izole eder. Gerçek GitHub credential gerekmez.
  Eski fixture + yalnız testserver trusted host ile aynı 503 yeniden üretildi.
- TEST_DATABASE_URL seçildiğinde suite kendi ürettiği izole PostgreSQL şemasını açar,
  Alembic head'e yükseltir; GitHub tablolarını, active unique index'leri ve ownership FK'larını kontrol eder.
  Çağıranın mevcut şeması değiştirilmez. Test şeması sonunda temizlenir.
- GitHub migration/concurrency testleri TEST_DATABASE_URL varken SQLite'a sessizce dönmez.
  Gerçek commit kullanan auth testleri ayrı izole şema kullanır; eski sabit a14 beklentisi kaldırıldı.
- Doğrudan incelenen eski şema a14 seviyesindeydi; üç GitHub tablosu eksikti.
  Gerçek exception **UndefinedTable / SQLSTATE 42P01**; github_repository_links dahil tablolar bulunamadı.
  Mevcut şema değiştirilmedi; testler kendi izole şemalarında a15 head'e yükseltildi.
- İlk yeniden çalıştırma **41 passed, 1 failed** verdi. PostgreSQL timezone-aware tarihinin
  replace(tzinfo=UTC) ile yeniden etiketlenmesi yanlış süre hesaplıyordu.
  Artık aware tarihler astimezone(UTC) ile dönüştürülür; yalnız SQLite naive tarihler UTC kabul edilir.
  State expiry, access/refresh expiry ve timezone regresyonları doğrulandı.
- Son SQLite GitHub targeted kontrolü de **45 passed, 0 failed**; auth fixture kontrolü **36 passed**.
- Migration/constraint ve concurrent identity testleri gerçek PostgreSQL üzerinde geçti.
  Full suite TEST_DATABASE_URL ile çalıştı; açıkça SQLite'a özgü testler kendi SQLite fixture'larını korur.
- compileall, pip check ve git diff --check PASS. Test bağlantısı ignored env dosyasından okundu;
  parola veya bağlantı dizesi raporlanmadı.
- Production GitHub config/fail-closed davranışı değiştirilmedi. Production HTTP callback reddi regresyonla korunur.

## Resmî sözleşmeler

- [GitHub App user token, PKCE ve erişim kesişimi](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [Kullanıcı installation/repository API'leri](https://docs.github.com/en/rest/apps/installations)


## 7 Ekim 2026 — Erişim hatası ve bağlantı iptali ayrımı

- Repository/installation 403/404 ve eksik erişim yalnız işlemi reddeder; bağlantı korunur ve erişilemeyen repository linklenemez.
- /user 403/404, provider ve rate-limit hataları hesap iptali veya repository erişim hatası olarak yorumlanmaz. Başarısız token yenileme, geçersiz ciphertext ve 401 için fail-closed davranışı korunur.
- 16 yeni regresyon; erişim hatasından sonra aynı bağlantıyla başka kurulum/repository sorgusu ve geçerli link işlemi doğrulandı.
- SQLite GitHub targeted: **61 passed, 0 failed** (6.28s).
- Gerçek PostgreSQL 18.6, a15 uygulanmış izole test şemaları: GitHub targeted **61 passed, 0 failed** (11.35s); full backend **419 passed, 0 failed** (57.82s).
- Her suite'te bir Starlette TestClient/httpx deprecation uyarısı; test failure yok. compileall, pip check ve git diff --check geçti.


## 7 Ekim 2026 — Ayrı App kurulum yaşam döngüsü doğrulaması

- SQLite GitHub targeted: **78 passed, 0 failed** (7.51s).
- Gerçek PostgreSQL 18.6, a15 uygulanmış izole test şemaları: GitHub targeted **78 passed, 0 failed** (14.98s); full backend **436 passed, 0 failed** (63.62s).
- Backend çalıştırmalarında yalnız birer Starlette TestClient/httpx deprecation uyarısı.
- Frontend: **63 passed, 0 failed**; lint ve `ZEMINAI_ENV=development npm run build` geçti. İlk env belirtilmeyen build mevcut fail-closed deployment kontrolünde reddedildi; config güvenliği değiştirilmedi.
- OpenAPI ve generated types yeniden üretildiğinde drift yok; `git diff --check` geçti.
- Slug/config reddi, sabit kurulum origin/path, aday/kurum yetkisi, URL injection, spoof edilmiş installation ID, boş liste aksiyonu ve OAuth tekrarına gerek duymadan liste yenileme doğrulandı. Mevcut matching invariants testleri geçti.
- Gerçek GitHub App kurulum smoke yapılmadı; testler synthetic provider yanıtları kullanır. Gerçek deployment config ve HTTPS/proxy/cookie smoke ayrıca doğrulanmalıdır.


## 8 Ekim 2026 — Proje yaşam döngüsü ve seçili repository import

`POST /github/import` yalnız installation/repository kimliklerini alır; user-token kesişimini tekrar doğrular.
Aynı adayın aktif projesine bağlı immutable repository ID yeniden import edilmez (idempotent cevap).
Aday satır kilidi ve aktif import kimliği unique index'i eşzamanlı importları sınırlar.
Public repository normal bounded fetch + analyzer akışına girer; başarısızlık ilişkiyi iptal etmez, proje kartında yeniden denenebilir.
Private veya private bilgisi eksik repository metadata-only kalır; source analysis 409 `PRIVATE_ANALYSIS_UNSUPPORTED` döndürür.
İzinler genişletilmedi. `POST /github/import-batch` en fazla 20 seçimi tek aksiyonda alır, her repository için bağımsız commit ve imported/existing/failed sonucu döndürür. Kaynak/LLM analizi import yanıtını bekletmez; a17 kalıcı kuyruğunda proje başına yürür. Başarısız analiz diğer seçimleri durdurmaz. Tekrar import proje/ilişki çoğaltmaz; retry yalnız ilgili analiz işini başlatır.

Proje silme artık arşivlemedir; a16 migration ve veri/kanıt sınırları için [Proje yaşam döngüsü](PROJECT_LIFECYCLE.md).
OAuth/PKCE, bağımsız App kurulum adımı, 401 iptali ve 403/404 erişim hatasında hesabı koruma kuralları değişmedi.

## Fresh-shell local configuration (Windows / macOS)

Copy the root `.env.example` to root `.env` once; keep the real values only there
(or in the production secret manager). The existing Settings loader resolves this
file relative to the repository, independent of the working directory, as UTF-8
(with optional Windows BOM). Process environment variables override the file;
remove stale shell overrides before debugging a new shell. The frontend uses its
separate ignored `frontend/.env.local`; never copy backend secrets there.

Persist `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
`GITHUB_APP_CALLBACK_URL`, `GITHUB_APP_ENCRYPTION_KEY`, and `GITHUB_APP_SLUG`.
**Reuse the existing encryption key** for existing encrypted connections. Closing a
terminal must not cause key regeneration. A different key cannot decrypt existing
tokens; do not test random keys against a connected account. No startup script
creates, rotates or prints any key. Back up secrets securely, separately from Git.

Local origins: frontend `http://127.0.0.1:3000`, API `http://127.0.0.1:8000`,
callback `http://127.0.0.1:8000/github/callback`; `SESSION_COOKIE_SECURE=false`
is for local HTTP only. Keep production Secure cookies, HTTPS and explicit origins.
After changing backend code/config, restart the API and its embedded analysis workers.
Missing App configuration remains fail-closed (`GITHUB_APP_NOT_CONFIGURED`);
public repository reading and rule-based analysis do not require the App.

Installation remains separate from OAuth/PKCE. Do not enable OAuth authorization
during installation. An optional Setup URL can return to `/aday`; its
`installation_id` is never trusted. Returning to the page refreshes access; advanced
manual refresh remains available. API repository-access validation is still required.
