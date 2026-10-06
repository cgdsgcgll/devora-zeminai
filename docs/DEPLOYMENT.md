# Deployment rehberi

Bu rehber uygulanan sınırları açıklar; production güvenliği sertifikası değildir.
Doğrulama sonucu ve kalan engeller: [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Architecture ve cookie topology

Tarayıcı → HTTPS frontend (Next.js) → aynı-origin `/api` rewrite → HTTPS backend
(FastAPI) → PostgreSQL. Backend gerektiğinde GitHub ve seçilen LLM sağlayıcısına
çıkar. Önerilen model **same-origin API proxy**: tarayıcı backend domainine doğrudan
istek atmaz. Session cookie host-only, HttpOnly, SameSite=Lax, production Secure'dür.
Ayrı hosted domainlere doğrudan fetch bu cookie modelinin desteklenen kurulumu değildir;
çözüm olarak SameSite=None veya wildcard CORS kullanmayın.

Backend'i yalnız güvenilen proxy/ingress üzerinden erişilebilir yapın. TLS sertifikası,
DNS ve reverse proxy operatörün sorumluluğudur. Next rewrite backend Host'u kullanır;
TRUSTED_HOSTS bu adresi ve gerekiyorsa özel health probe hostunu açıkça içermelidir.
Origin/Referer frontend originini korumalıdır. Proxy Cookie/Set-Cookie ve Retry-After,
X-Request-ID header'larını korumalı; API cevaplarını cache etmemelidir.

## Required env

Backend server-side secret store/env (frontend'e kopyalamayın):

- `ENVIRONMENT=production`
- `DATABASE_URL`: erişilebilir `postgresql+psycopg` URL; demo credential reddedilir.
  Özel karakterli parola URL-encode edilmeli, güvenilir DB TLS/CA ayarı eklenmelidir.
- `SESSION_COOKIE_SECURE=true`; `SESSION_COOKIE_NAME=zeminai_session`, TTL varsayılan 604800.
- `CORS_ORIGINS`: JSON liste, örneğin `["https://app.example.com"]`. Exact scheme/host/port.
- `TRUSTED_HOSTS`: portsuz açık JSON host listesi, örneğin `["api.example.com"]`.
- `RATE_LIMIT_KEY`: secret manager ile üretilen ayrı, rastgele en az 32 karakter;
  tüm worker/instance'larda aynı ve kalıcı olmalı. Rotation aktif bütçeleri sıfırlar;
  deploy başına değiştirmeyin. Loglamayın veya Git'e eklemeyin.
- `LLM_PROVIDER`: bilinçli `rule_based`, `gemini` veya `openai` seçimi.
  Live sağlayıcı seçildiğinde ilgili key ve model zorunlu.
- Gemini: `GEMINI_API_KEY` secret; canlı demo doğrulaması `GEMINI_MODEL=gemini-3.1-flash-lite`,
  `LLM_TIMEOUT_SECONDS=120`. OpenAI: `LLM_API_KEY`, `LLM_MODEL`. İsteğe bağlı `GITHUB_TOKEN` secret.
- `API_DOCS_ENABLED`: varsayılan production'da false; açmak bilinçli operatör kararıdır.

Frontend **server-side build ve start** ortamı:

- `ZEMINAI_ENV=production`
- `API_BACKEND_URL=https://api.example.com`
- `FRONTEND_ORIGIN=https://app.example.com`

Rewrite ve headers build çıktısına girer; hedef değişince yeniden build gerekir.
`NEXT_PUBLIC_API_BASE_URL` kullanılmaz ve reddedilir. Frontend'e secret verilmez;
şüpheli NEXT_PUBLIC secret değişken adları da reddedilir. Bu kontrol genel secret
scanner yerine geçmez. Local HTTP geliştirme: backend ENVIRONMENT=development,
SESSION_COOKIE_SECURE=false; frontend ZEMINAI_ENV=development ve loopback backend.
Local demo build için de ZEMINAI_ENV açıkça development seçilmelidir.

## Release, migration ve preflight

Güvenilir bağımlılık kaynakları, güncel pip ve `npm ci` kullanın. Production env'i
secret store'dan enjekte ettikten sonra backend klasöründe:

```sh
python -m pip install -r requirements.txt
python -m alembic upgrade head
python scripts/production_preflight.py
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log --no-proxy-headers
```

Migration release aşamasında tek kez, yedek alınarak yürütülür. Uygulama startup'ı
migration çalıştırmaz. Preflight salt okunur: config, DB erişimi ve Alembic head;
provider çağırmaz, secret yazdırmaz. Başarılı çıktı PRODUCTION_PREFLIGHT_OK; hata
çıkış kodu 1. Release yetkisini uygulama DB hesabından ayrı tutmak tercih edilir.

Frontend klasöründe yukarıdaki production build env'i ile:

```sh
npm ci
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

Bu portları doğrudan internete açmayın; HTTPS ingress arkasında kullanın.
`--no-proxy-headers` ile IP bütçesi proxy peer'ini görür; aynı proxy arkasındaki
kullanıcılar IP bütçesini paylaşır. Gerçek IP gerekiyorsa ingress istemcinin forwarded
header'larını silip güvenilir değerleri yeniden üretmeli; ASGI proxy güveni yalnız
bilinen proxy IP'lerine daraltılmalıdır. `forwarded-allow-ips=*` kullanmayın.
Uygulama X-Forwarded-For'u kendisi okumaz. Bu topolojiyi deployment smoke ile doğrulayın.

## Rate budgets ve privacy

Kalıcı `rate_buckets`, atomik upsert ve aynı DB'yi kullanan worker'lar.
İki bağımsız policy, her birinde IP **ve** kullanıcı bütçesi:

| Policy | İşlemler | Varsayılan user / IP | Pencere |
| --- | --- | --- | --- |
| ai | project analyze, kriterleri metinden çıkarılan need create | 10 / 60 | 3600 saniye |
| compute | discovery, team coverage, match, açık kriterli need create | 60 / 180 | 60 saniye |

`AI_*` ve `COMPUTE_*` WINDOW_SECONDS, USER_ATTEMPTS, IP_ATTEMPTS ile değişir.
Yetki/ownership kontrolü bütçeden önce yapılır. Başarısız provider çağrıları da
bütçe tüketir; başarılı yanıt sayacı değildir. IP reddi yeni user satırı açmaz.
Sayaç limit+1'de doyar. 429 standart envelope ve pencere sonuna kadar saniye cinsinden
Retry-After döndürür. DB sayaç hatası fail-closed 503; pahalı workflow başlatılmaz.
Bunlar sabit pencere limitleridir: pencere sınırında burst mümkündür; in-flight
concurrency limiti veya toplam fatura tavanı değildir. Provider hesabında harcama
tavanı, ingress connection limitleri ve global kapasite planı ayrıca gerekir.

IP/user ham değerleri yerine gizli anahtarla HMAC hash saklanır. Satırlar iki pencere
sonunda expire olur; sonraki sınırlı işlemde indexed DELETE ile temizlenir. Trafik
yoksa süresi dolmuş satırlar kalır; retention gereği zamanlanmış DELETE işletilebilir.
Benzersiz aktif kullanıcı/IP hacmiyle storage büyür; evrensel satır tavanı değildir.
Mevcut auth throttle ayrı kalır. Session retention/cleanup ayrıca operasyonel iştir.

## Database ve external providers

Pool pre-ping; worker başına DB_POOL_SIZE=5, DB_MAX_OVERFLOW=2,
DB_POOL_TIMEOUT=5, DB_CONNECT_TIMEOUT=5 saniye, DB_STATEMENT_TIMEOUT_MS=30000.
Toplam bağlantı kapasitesi instance × worker × (pool+overflow) olarak planlanmalı.

Provider timeout ve bounded transport/semantic retry, structured validation,
grounding ve başarısız analizde partial evidence yazmama korunur. Timeout her I/O
çağrısına aittir; bütün workflow için tek deadline değildir. GitHub yalnız allowlisted
HTTPS API üzerinden bounded içerik okur, redirect izlemez. Profile linkleri fetch edilmez.

## Health, logging ve monitoring

- `/health`: mevcut backward-compatible cevap.
- `/health/live`: DB/LLM/GitHub çağırmadan process kontrolü.
- `/health/ready`: DB select + Alembic head; erişilemez veya eksik migration'da 503.
- Production API docs varsayılan kapalı; health endpointler config/secret göstermez.

Server-generated X-Request-ID; JSON request route-template, method, status, duration.
Hatalar code veya exception sınıfı + dosya adı/line/function ile kaydedilir; raw exception,
SQL, local değişken, body, URL query, cookie, auth header ve PII loglanmaz.
Uvicorn access logunu kapatan start komutunu koruyun; proxy/DB/provider loglarını da
ayrı redaction ve retention politikasına alın. 5xx/429, auth/provider hata code'ları,
readiness düşüşü ve latency için alarm eşikleri belirleyin. Vendor entegrasyonu yapılmadı.

CORS exact origins/credentials, mevcut exact CSRF korunur. Host validation, no-store,
nosniff, frame DENY, Referrer/Permissions Policy; HSTS yalnız production'da.
Backend özel HTTP hop'u varsa public ingress mutlaka HTTPS zorlamalıdır.

## Rollback ve post-deploy smoke

Önce trafik durdurma/önceki uyumlu uygulama sürümüne dönme ve DB backup/restore planını
hazırlayın. a13 downgrade aktif rate bütçeleri varken reddedilir; bütçe sıfırlamak için
satır silmeyin. Expiry sonrası tablo kaldırma auth/profile verisini değiştirmez.
Migration downgrade yerine yeni şemayla uyumlu önceki sürüm tercih edilir.

Deploy'da gerçek PostgreSQL18 ile fresh/upgrade/legacy/downgrade, eşzamanlı rate tests
ve bağımsız bağlantı persistence doğrulaması **zorunlu**. Bu çalışma ortamında engelli.
Sonrasında HTTPS browser smoke: candidate login→project→analyze→profile;
institution login→need→discovery→match; küçük test bütçesinde 429, loading sonlanması,
session korunması; sonra normal bütçeye dönüş. Wrong role/IDOR/CSRF/host reddi,
ready 503/live 200, cookie Secure/HttpOnly/Lax, proxy header ve cache davranışı kontrol edilmeli.
