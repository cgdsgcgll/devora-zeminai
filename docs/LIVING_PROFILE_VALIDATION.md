# Yaşayan profil doğrulama kaydı — 2026-10-01

Taban: `feat/profile-evidence-sources` / `a968a62`. `git status`, branch/log ve `git fetch origin` sonrası temiz tabandan `feat/living-talent-profile` oluşturuldu. Main'e geçilmedi, reset/rebase/revert veya push yapılmadı.

## Backend

Python 3.12, mevcut izole `work/hardening-venv`. Backend dizininde gerçekten çalıştırılan kontroller:

```text
python -m pytest -q -p no:cacheprovider --basetemp=../work/living-sqlite
python -m pytest -q -p no:cacheprovider --basetemp=../work/living-pg-final
python -m compileall -q app tests migrations scripts
python -m pip check
python -m alembic upgrade head
python -m alembic check
```

SQLite **220 passed**; temiz PostgreSQL regression DB **220 passed**. Önceki 204 test korunur. Son küçük API import/açıklama düzenlemesinden sonra 15 yeni read-model testi tekrar geçti. Starlette TestClient/httpx deprecation uyarısı 1 adet, mevcut ve non-fatal. pip check temiz; compileall başarılı; PostgreSQL Alembic check “No new upgrade operations detected”.

PostgreSQL regression koşusunda `TEST_DATABASE_URL` ayrı regression DB'sine; `TEST_MIGRATION_DATABASE_URL` ve `TEST_PORTFOLIO_MIGRATION_URL` ayrı, başlangıçta boş test DB'lerine ayarlandı. Migration upgrade/check/downgrade/upgrade eski candidate/project/snapshot/evidence ve profil satırlarını birebir korudu. Yeni portfolio kaydı varken downgrade kontrollü reddedildi ve kayıtlar korundu. Dolu demo DB yalnız upgrade edildi.

Kapsam: gerçek kayıtlardan kronoloji, date_basis/filtre, son başarılı run'ın tek sayılması, factual counts, declared/linked/observed ayrımı, aynı skor formülü, ilgisiz kayıtların bonus üretmemesi, kimlik metinlerinin anonim yanıtta olmaması, team union/destekleyen kaynak/eksik kriter, 2–4 farklı aday sınırı, bilinmeyen aday/extra alan reddi, unsafe portfolio URL ve metadata, eski GitHub/history regresyonları. Query-count testi 1 ve 12 aday/24 projede sabit 8 SELECT doğrular; PostgreSQL test transaction SAVEPOINT'leri SELECT sayısına dahil edilmez.

İlk PostgreSQL denemesinde reflected CHECK koşulunun `IN` yerine PostgreSQL'in eşdeğer `ANY` gösterimini kullanması görüldü ve migration düzeltildi. İlk query-count denemesinde fixture SAVEPOINT sorgusu sayılmıştı; test yalnız SELECT sayacak şekilde düzeltildi. Bunlar nihai başarılı koşuldan önce giderildi.

## Frontend ve audit

```text
npm run lint
npm test
npm run build
npm audit
npm audit --omit=dev
```

Lint ve TypeScript/production build başarılı; **13 test geçti**. Yeni read-model istemci sözleşmesi anonymous default, team payload, gap/living response validation ve provenance ayrımını test eder. Önceki gerçek ProfileCard render/XSS ve API CRUD testleri korunur. OpenAPI JSON ve TypeScript tipleri backend'den yeniden üretildi.

İki npm audit de **0 vulnerability**. Mevcut izole `work/audit-venv` içinde `pip-audit -r backend/requirements.txt`: **32 dependency, 0 advisory**; global paket kurulmadı, bağımlılıklar değiştirilmedi. Kaynak dosyaları ve 17 browser JS bundle'ında bariz secret pattern taraması 0 bulgu. Example API key/token alanları boş; `.env`, frontend env ve `work/` ignored; bunlar tracked değil. `git diff --check` geçti.

## Gerçek HTTP ve browser E2E

Uvicorn `127.0.0.1:8000`, Next production `127.0.0.1:3001`, gerçek izole PostgreSQL `55443`; rule_based provider. Backend CORS'a bu demo origin'i process environment üzerinden açıkça verildi. Gerçek HTTP: health/living-profile 200; izinli origin header doğru; yabancı origin preflight 400; 1 MiB üstü team payload 413.

1440×1000 desktop ve 390×844 mobile in-app Browser'da kontrol edildi:

1. UI'da `Deniz Yaşayan Profil` adayı, GitHub bağlantılı `Yaşayan Profil Demo` projesi oluşturuldu. Yeni proje analiz edilmedi; analiz varmış gibi gösterilmedi.
2. 2025-01-15 eğitim, 2025-08-01 topluluk organizatörlüğü ve 2025-09-01 ürün demosu portföyü gerçek API/DB üzerinden kaydedildi. Portföy `linked`, kaynaksız deneyimler `declared_only` kaldı.
3. Timeline doğru tarih sırasını ve ayrı eklenme-tarihi etiketini gösterdi. Son 6 ay filtresi eski deneyimleri gizleyip yeni proje kaydını gösterdi. Map/pasaport/özet bölümleri açıldı.
4. İhtiyaç: Python ve FastAPI required, topluluk deneyimi ve Docker preferred. İlk denenmiş “teknoloji topluluğu deneyimi” ifadesi mevcut sınırlı rule sözlüğünde tanınmadı; kriter üretilmediği görüldü. Mevcut analyzer değiştirilmedi; açık desteklenen “topluluk deneyimi” ifadesiyle devam edildi.
5. Discovery kanıt odaklı modda isimler yerine `Aday #…`, kaynak aileleri ve criterion coverage gösterdi; isimli moda geçiş gerçek aday isimlerini ve profil/match aksiyonlarını açtı. Mod değişince önceki takım seçimi temizlendi.
6. Önceden canlı GitHub'dan alınmış 27 evidence içeren `PostgreSQL readiness smoke` adayı kullanıldı: son başarılı run'da **21 observed evidence**. Keşif/kalıcı eşleşme skoru 80; required %100, preferred %0.
7. Bu aday + yeni topluluk kaydı olan Deniz elle seçildi: takım **3/4 kriter**, required %100, preferred %50. Teknik dayanak ilk adaydan, topluluk beyanı ikinci adaydan geldi. Docker için kanıt üretilmedi.
8. Kalıcı eşleşmenin Kanıt Boşlukları bölümünde Docker ve topluluk için “kanıt bulunamadı” ve koşullu kayıt ekleme önerileri gösterildi. Gerçek kaynak dosya/bağımlılık/dil kayıtları açıldı.
9. Mobil profil/pasaport, keşif kaynak ayrıntıları, takım seçimi ve gap görünümü kontrol edildi. `innerWidth=390`, belge `scrollWidth=375`; yatay taşma yok. Masaüstü harita ve takım da görsel olarak incelendi.
10. Tarih filtresinde Tab ile “Son 12 ay” odağına geçildi, Enter ile etkinleştirildi; fetch sonrasında odak aynı düğmede ve aria-pressed=true kaldı. Native button/details/checkbox ve mevcut focus-visible/reduced-motion CSS korunur. OS reduced-motion emülasyonu çalıştırılmadı; kaynak kuralı incelendi.

Yerel ignored ekran görüntüleri: `work/living-gap-mobile.png`, `work/living-passport-mobile.png`, `work/living-team-mobile.png`. Bunlar repository'ye eklenmedi.

## Dış servis sınırları

GitHub `/rate_limit` bir kez kontrol edildi: HTTP 200, core **60/60** kullanılabilir. Yeni repo/contribution fetch yapılmadı; kullanıcının izin verdiği mevcut gerçek DB snapshot'ları kullanıldı. Keşif/takım/timeline hiçbir dış çağrı yapmaz.

Gemini **BLOCKED_BY_MISSING_KEY**. Canlı başarı iddiası yok; deterministik özellikler Gemini'ye bağlı değil.

Sonuç: **READY_FOR_REVIEW**, güvenlik durumu **SAFE_FOR_CONTROLLED_DEMO**. Auth/authorization/IDOR ve rate limiting **HIGH / OPEN production blockers** olarak kalır.

## Merge öncesi discovery sıralama düzeltmesi

Önceki sürüm SQL offset/limit ile sayfayı seçiyor, sonra yalnız o sayfayı skorlayıp sıralıyordu. Önceki page-local raporu doğruydu, ancak ilk sayfa ihtiyacın en yüksek Kanıt Uyumu sonuçlarını garanti etmiyordu. A/B/C eklenme sırası ve 0/80/100 skorlarıyla limit=2 regresyonu eski kodda başarısız oldu: C ikinci sayfada kalıyordu.

Düzeltme: tam havuz önce skorlanır; score DESC, required coverage DESC, preferred coverage DESC, candidate UUID ASC sırası kurulur; offset/limit en son uygulanır. Normal ve anonymous mod sırası aynıdır. Tam havuz maksimum 100; 101. aday tespit edilirse hiçbir kısmi sıralama döndürülmez (422 DISCOVERY_POOL_LIMIT_EXCEEDED, details.max_candidates=100). Mevcut 5000 material satırı sınırı korunur. Sayfalar arası veri değişikliği sonucu sıranın değişebileceği API açıklamasında belirtilir.

Yeni regresyonlar: global ilk/ikinci/boş sayfa ve has_more; eşit skorda required coverage önceliği ve eşit coverage'da UUID tie-break; iki modun aynı sıra üretmesi; 100 aday kabul/101 aday kontrollü ret; 1 ve 12 adaylık tam havuzda soğuk ORM oturumuyla sabit 8 SELECT. N+1 veya AI çağrısı eklenmedi. Production için sürümlü match projection ve snapshot/cursor stratejisi LIVING_PROFILE.md'de ayrıldı.

Bu düzeltmenin backend kalite kapısı: tam SQLite suite **225 passed**; PostgreSQL'de `tests/test_living.py` **20 passed**. Compileall, pip check ve gerçek PostgreSQL üzerinde Alembic check başarılı. Önceki 220 PostgreSQL tam suite sonucu önceki fazın kaydıdır; bu düzeltmede tam PostgreSQL suite tekrar çalıştırılmadı.

Frontend kalite kapısı: `npm run lint`, `npm test` (**13 passed**) ve `npm run build` başarılı. İlk lint CLI denemeleri çıktı üretmeden bekledi; aynı yapılandırmalı programatik ESLint temizdi. Standart `npm run lint`, yalnız o süreçte `NODE_DISABLE_COMPILE_CACHE=1` ile tekrar çalıştırılıp exit 0 verdi; proje lint kuralları veya bağımlılıkları değiştirilmedi. `git diff --check` başarılı. Yeni feature, migration veya frontend davranış değişikliği yok; mevcut commitler korundu, push yapılmadı.

## Beyan / gözlemlenen kullanım açıklığı — 2026-10-01

Kullanıcının bildirdiği başarılı canlı Gemini senaryosunda OSPF ve Cisco Packet Tracer README kayıtları `declared_only / weak`, teknik kriterler ise sırasıyla required ve preferred idi. Teknik kriterlerin yalnız observed kanıtla karşılanması nedeniyle 0/100 doğruydu. Bu görevde canlı API çağrısı tekrarlanmadı.

Arayüz başlığı artık “Beceri sinyalleri ve kanıtlar”. Durumlar “Yalnızca beyan”, “Gözlemlenen kullanım”, “Kaynak bağlantısı mevcut” ve “Doğrulanmış” olarak ayrılır. Teknik beyan kartlarında skor dışı olma açıklaması tooltip dışında görünür. Profil beyanları için bu teknik dışlama genellenmez: ilgili hackathon kriterini profil kaydı karşılayabilir.

Yeni hesaplanan eşleşmelerde aynı canonical skill için yalnız beyan varsa “İlgili beyan bulundu ancak eşleşme için yeterli teknik kullanım kanıtı bulunamadı” açıklaması gösterilir. Hiç ilgili kayıt yoksa mevcut no-evidence açıklaması korunur. Kanıt boşlukları aynı açıklamayı kullanır. Skor, coverage, evidence IDs ve eşleşme koşulları değişmedi. Eski kaydedilmiş eşleşmeler yeniden yazılmaz; yeni açıklama için eşleşme yenilenmelidir.

Modelin İngilizce reason metnini çevirmek yerine evidence status ve criterion priority alanlarından Türkçe sunum şablonları üretilir. Kaynak alıntısı olduğu gibi gösterilir, kayıtlı model metni değiştirilmez. Yeni LLM çağrısı eklenmedi.

### Çok kaynaklı senaryo

Canlı gözleme dayanan, regresyon testiyle doğrulanan genişletilmiş senaryo:

| Kaynak / kriter | Durum | Sonuç |
| --- | --- | --- |
| README OSPF / OSPF required | declared_only | Karşılanmaz |
| README Cisco Packet Tracer / Packet Tracer preferred | declared_only | Karşılanmaz |
| Profil hackathon kaydı / Hackathon preferred | İlgili profil deneyimi | Karşılanır |

Required kapsamı 0/1, preferred kapsamı 1/2: `100 × (0.80 × 0 + 0.20 × 0.5) = 10`. Hackathon kaydı yoksa skor 0'dır. README mention, observed evidence değildir; farklı kanıt aileleri birbirinin yerine geçmez. Eklenen teknik beyanlar skoru artırmaz.

### Kalite kapısı

- Backend: **249 passed**; yeni dört regresyon beyan/no-evidence ayrımı, observed önceliği, alakasız beyan ve çok kaynaklı 80/20 sonucunu kapsar.
- PostgreSQL: `test_evidence_presentation.py`, `test_profile_matching.py`, `test_living.py`: **36 passed**.
- Compileall, pip check, PostgreSQL alembic check: başarılı. Mevcut TestClient/httpx deprecation uyarısı sürüyor.
- Frontend lint, **16 test**, production build: başarılı. Gerçek kart render testi İngilizce reason yerine Türkçe açıklamayı, görünür skor dışlama metnini ve özgün kaynak alıntısının korunmasını doğrular.
- `npm audit`: **0 vulnerabilities**.
- `git diff --check`: başarılı.

Auth ve rate-limit production blocker durumları değişmedi. Push yapılmadı.
