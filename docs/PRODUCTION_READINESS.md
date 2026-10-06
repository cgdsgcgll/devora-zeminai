# Production hardening doğrulaması — 6 Ekim 2026

Branch: `feat/production-hardening`, başlangıç `e9fb6ed`.
Sonuç: **READY_FOR_DEPLOYMENT_REVIEW**.

## Uygulanan ve yerelde doğrulanan

- Mevcut Argon2id, hash session, HttpOnly, roller, ownership/IDOR, exact CSRF ve auth throttle korundu.
- AI + compute user/IP fixed-window DB bütçeleri, atomik upsert, restart persistence,
  fail-closed DB hatası, indexed expiry cleanup, 429 + Retry-After.
- Development/test/production; production fail-fast, conservative pool/timeout,
  migration a13 ve salt-okunur preflight; health/live + DB/schema health/ready.
- Metadata-only request logları, server-generated request ID, safe exceptions,
  explicit trusted hosts, security headers; production docs varsayılan kapalı.
- Same-origin cookie proxy; frontend production build config ve anlaşılır 429.
- Provider/GitHub retry, timeout, grounding, no fake fallback ve evidence/matching
  davranışı değiştirilmedi. Network öncesi AnalysisRun/snapshot commit sınırları
  ve expire_on_commit=False korunur; ağ boyunca gereksiz transaction eklenmedi.

## Test kaydı

- Backend SQLite full: **327 passed** (1 Starlette TestClient httpx deprecation uyarısı). PostgreSQL test sonucu olarak sunulmaz.
- Gerçek PostgreSQL18 full backend suite (manuel doğrulama): **327/327 PASS**;
  `327 passed, 2 warnings, 31.54s`. Uyarılar test failure değildir; ayrıntılar aşağıdadır.
- Frontend: **42 passed**; npm run lint ve production HTTPS config ile npm run build geçti.
  Yeni server config için eksik TypeScript declaration build sırasında bulunup düzeltildi.
- compileall, pip check, SQLite fresh upgrade head ve alembic check geçti.
  a12→a13 upgrade legacy User/Candidate ownership'u koruyor; aktif bütçe downgrade'i
  reddediyor; expiry sonrası downgrade/upgrade roundtrip testi geçti.
- Public/private route envanteri, IDOR/role/CSRF/session regresyonları full suite içinde.
- Gerçek browser: loopback frontend3103/backend8103, ayrı SQLite, rule_based,
  AI_USER_ATTEMPTS=1 yalnız QA process env'inde. Candidate registration/login,
  gerçek psf/requests GitHub fetch/analysis (4 evidence), profile; institution
  registration/login, need, anonymous/normal discovery ve match başarılı.
  Project ve need ikinci analizlerinde 429 mesajı, loading bitmesi, button yeniden
  etkinliği ve session korunması doğrulandı. Logout/login sonrası kayıtlar korundu.
  Live Gemini veya production HTTPS/proxy/PG doğrulaması değildir. Test override'ları
  .env'e yazılmadı; QA sunucuları kapatıldı; düşük limit kalıcı ayarları değiştirmedi.

## Dependency audit

- npm audit: **5 HIGH** dev dependency kaydı, braces kaynaklı
  GHSA-vfj7-8cjw-p6xm; audit fixAvailable=false. Breaking/force upgrade yapılmadı.
- npm audit --omit=dev: **0**.
- İzole venv pip-audit: yalnız **pip 25.0.1 / 12 advisory kaydı**; uygulama paketlerinde
  bulgu yok. Audit ayrı venv'de çalıştı, global paket kurulmadı. pip26.2 güvenli
  araç güncellemesi denendi; files.pythonhosted.org bağlantısı resetlendi, kurulmadı.
  Deployment build araçlarını patched sürüme yükseltmek açık iş; ortam sıfır bulgulu değildir.
- Secret taraması: 166 current/tracked+new dosya, 352 geçmiş blob, 20 bundle dosyası;
  pattern bulgusu yok. Current DB credential taramasında yalnız local/synthetic test
  örnekleri; .env untracked ve ignored, .env.example key alanları boş. Genel sızıntı garantisi değildir.

## PostgreSQL18 doğrulaması

Manuel olarak gerçek PostgreSQL18 üzerinde tamamlanan doğrulamalar:

- Bağlantı başarılı: `SELECT 1 → 1`.
- İzole schema: `zeminai_test`.
- `a13_operation_budgets` migration başarıyla head'e ulaştı.
- Full backend suite: **327/327 PASS** — `327 passed, 2 warnings, 31.54s`.
- Uyarılar: Starlette TestClient/httpx deprecation ve Windows pytest cache
  permission. Bunlar test failure değildir.
- Production rate limiter testi:
  `tests/test_production.py::test_concurrent_budget_across_connections_and_restart`
  → **1 passed**. Ayrı DB connection/restart ve concurrent budget bypass
  senaryosu gerçek PostgreSQL18 üzerinde doğrulandı.
- Testlerden sonra çalışma ağacı temizdi.

Önceki denemede environment bağlantı/bind kısıtı vardı; daha sonra gerçek
PostgreSQL18 üzerinde yukarıdaki doğrulamalar tamamlandı. Bu kısıt güncel blocker değildir.

OpenAPI/types mevcut generator ile yenilendi; tekrar export aynı hash verdi.
Preflight development config için CONFIG_INVALID ve çıkış 1 ile güvenli reddetti.
Production preflight başarı sonucu bu manuel test kaydında ayrıca bildirilmedi;
deployment ortamında release adımı olarak çalıştırılmalıdır. git diff --check geçti.

## Kalan gerçek production işleri

- Gerçek HTTPS ingress/proxy/cookie smoke.
- Secret manager, DB TLS/backups/restore tatbikatı, ingress bağlantı/harcama tavanları.
- Fixed-window limitler in-flight concurrency veya global provider bütçesi değildir;
  deployment kapasitesi, maliyet alarmı ve provider hesap tavanı ayrıca gerekli.
- Email verification/password recovery (gerçek sağlayıcı), session/device lifecycle
  ve expired-session retention cleanup.
- Monitoring alarm teslimatı, log retention/PII erişimi, operasyonel incident/rollback planı.
- Dev braces ve build pip advisory'leri; bağımsız güvenlik incelemesi.

Bu kayıt production-secure veya tüm açıkların kapatıldığı iddiası içermez.

## Implementation commit

`90c0a00` — feat: production güvenlik sınırları ve kalıcı işlem bütçeleri ekle.
Push yapılmadı.
