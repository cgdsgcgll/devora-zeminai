# ZeminAI MVP güvenlik değerlendirmesi

Tarih: 1 Ekim 2026. Branch: `feat/profile-evidence-sources`. Sonuç: **SAFE_FOR_CONTROLLED_DEMO**.
Bu sonuç yalnız loopback arayüzlerine bağlı, güvenilir operatörün kullandığı, sentetik
aday/ihtiyaç verileri içeren yerel jüri demosu içindir. İnternete açık yayın onayı,
penetrasyon testi veya tüm açıkların bulunmuş olduğuna dair güvence değildir.

## Scope

Next.js arayüzü ve derlenmiş istemci çıktısı; API client, dış bağlantılar ve ID
depolaması; FastAPI endpointleri, Pydantic girdileri, SQLAlchemy sorguları, hata
cevapları ve CORS; GitHub snapshot okuyucusu; Gemini/OpenAI REST adaptörleri;
LLM bağlamı, çıktı doğrulama ve deterministik matching incelendi. Mevcut dosyalar
ve yereldeki tüm Git ref'lerinden erişilebilir blob geçmişi secret kalıplarıyla tarandı.
Dağıtılmış ortam, ağ altyapısı, GitHub tarafındaki erişilemeyen/silinmiş geçmiş,
hesap yetkileri ve provider veri saklama politikaları bu incelemenin dışında.

## Validated controls

- **Secrets:** `.env` tracked değil. `.env.*` dosyaları da ignore edilir; yalnız
  `.env.example` istisnadır. Örnek Gemini/OpenAI/GitHub anahtar alanları boş.
  Google/OpenAI/GitHub/AWS anahtar ve private-key kalıplarında bulgu yok.
  Geçmişteki credential içeren DB URL taramasında yerel örnekler dışında adres yok.
  Bu pattern taraması her tür secret'ı yakalayan bir DLP sistemi değildir.
- **Frontend sınırı:** tek `NEXT_PUBLIC_*` değişkeni `NEXT_PUBLIC_API_BASE_URL`.
  Production `.next/static` çıktısında taranan anahtar kalıpları veya backend
  secret değişken adları bulunmadı. Provider kodu frontend'e import edilmiyor.
  API client ham HTML/stack cevabını göstermez; backend envelope mesajı metin olarak render edilir.
- **XSS / navigation:** `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`
  veya ham Markdown renderer kullanılmıyor. Model/repository metni JSX text
  olarak gösteriliyor. GitHub kanıt linkleri HTTPS `github.com`, credentialsız ve
  standart portla sınırlandırılmış; `noopener noreferrer` mevcut. Dahili yollar
  sabit; kanıt linkleri fragment. Kullanıcı girdisini yönlendirme hedefi yapan
  uygulama kodu bulunmadı. Framework/proxy yönlendirmeleri ayrıca deployment incelemesi ister.
- **GitHub / SSRF:** HTTPS ve tam `github.com` authority, owner/repo biçimi,
  query/fragment/credential/port reddi. Fetch sabit `https://api.github.com`
  üzerinde yapılır; kullanıcı kontrollü download URL'leri izlenmez.
  Redirect takip edilmez. Localhost, private IP, metadata IP, IPv6 loopback,
  `file://`, encoded traversal ve 301/302/307/308 yönlendirmeleri test edildi.
  Private repo, token mevcut olsa da reddedilir; içerik çalıştırılmaz.
  DNS/TLS/proxy yapılandırmasına güven devam eder; production egress politikası ayrı bir katmandır.
- **Kaynak bütçeleri:** GitHub en fazla 30 dosya, dosya başına 100 KB,
  toplam 1 MB içerik; HTTP yanıtı en fazla 8 MB. LLM bağlamı ve output token
  bütçesi ayarlı, provider yanıtı 1 MB ile sınırlı, retry en fazla iki.
  Bunlar istek başına sınırlardır; kullanıcı kotası veya toplam deadline değildir.
- **Girdiler:** isim 1–200, proje/ihtiyaç açıklaması en fazla 20.000,
  rol 200, beklenen çıktı 2.000, GitHub URL 500 karakter, açık kriter sayısı 100.
  Boş/whitespace isimler reddedilir; Türkçe ve emoji korunur. Unicode görsel
  benzerlik/zero-width karakter normalizasyonu eklenmedi. Açık kriter `reason`
  alanının ayrı karakter sınırı yok; artık toplam istek bütçesine tabidir.
- **Yeni body sınırı:** ASGI middleware JSON parse edilmeden önce en fazla
  1.048.576 byte (1 MiB) kabul eder. Content-Length erken ret sağlar; ayrıca
  gerçek byte sayımı header olmayan/yanlış header'lı stream'i kapsar.
  Fazlası güvenli `413 / PAYLOAD_TOO_LARGE` envelope döndürür; izinli CORS
  header'ı korunur. Disconnect ve tam sınır test edildi. Bu buffering sınırı
  eşzamanlı istek ve slow-client DoS koruması değildir.
- **CORS:** varsayılan yalnız `http://localhost:3000` ve
  `http://127.0.0.1:3000`; GET/POST/PATCH/DELETE ve Content-Type. Credentials açılmıyor.
  Yeni startup doğrulaması wildcard, path ve credential içeren originleri reddeder.
  Açık bir HTTPS deployment origin'i hâlâ tanımlanabilir. CORS authentication değildir;
  curl ve diğer doğrudan istemcilerin API kullanımını engellemez.
- **SQL / hata:** ORM filtreleri bağlı parametrelerle çalışır; tek raw SQL
  sabit `SELECT 1` sağlık kontrolüdür. DB/beklenmeyen hata logları yalnız sınıf
  adını yazar; stack, girdi veya provider ham gövdesi API envelope'a taşınmaz.
  Validation cevabı `input` / exception context döndürmez. Secret yazan uygulama
  `console.log` / print çağrısı bulunmadı. Uvicorn erişim logları kayıt UUID'lerini içerir.
- **Storage:** localStorage yalnız candidate/project/need/match/run/evidence
  UUID'lerini saklar; açıklama, API key veya token saklamaz. UUID filtresi, en fazla
  100 evidence ID ve parse/storage hatası kontrolü mevcut. ID'ler yetkilendirme
  yerine geçmez ve kayıtlarla ilişkilendirilebilir. “Demoyu sıfırla” DB'yi silmez.
- **AI:** repository ve ihtiyaç bağlamı açıkça güvenilmeyen veri olarak ayrılır.
  Strict Pydantic, extra-field reddi, dosya/path eşleşmesi, gönderilen excerpt'te
  exact alıntı, beceri normalizasyonu ve semantik kanıt sınırları uygulanır.
  Source URL ve DB kimliklerini backend belirler. Model final score alanı üretmez;
  skor yalnız `observed` kanıtlarla deterministik hesaplanır. Provider anahtarları
  prompt'a eklenmez, sabit HTTPS endpointlerine header olarak gönderilir;
  redirect takip edilmez. Structured output tek başına injection koruması değildir.
- **Frontend headers:** production yanıtta `nosniff`,
  `strict-origin-when-cross-origin`, kamera/mikrofon/konum izinlerini kapatan
  Permissions-Policy ve `X-Frame-Options: DENY` HTTP üzerinden doğrulandı.
  CSP/nonce mimarisi ve HTTPS deployment bilinmediğinden CSP/HSTS eklenmedi.

## Findings

Severity, herkese açık deployment etkisini dikkate alır; yerel demo kapsamı ayrıca belirtilir.

| Severity | Finding | Status | Action |
|---|---|---|---|
| HIGH | Authentication ve kayıt sahipliği/tenant kontrolü yok; herkes kayıt oluşturabilir ve ID'sini bildiği kayıtları okuyabilir | Açık — production blocker | Kimlik doğrulama, sahiplik kontrolleri, izolasyon ve negatif yetki testleri |
| HIGH | Analiz/ihtiyaç çağrıları rate limit veya kotaya tabi değil; ücret, DB büyümesi ve worker tüketimi mümkün | Açık — production blocker | Gateway rate limit, kimliğe bağlı kota, concurrency ve maliyet bütçesi; in-memory limiter eklenmedi |
| HIGH | Önceki Starlette 0.46.2 advisory riski | **RESOLVED** — doğrulanan zincir FastAPI 0.142.2 / Starlette 1.7.0 | Temiz kurulum, 163 regresyon testi, aynı OpenAPI ve pip-audit doğrulandı; eski ortamlar yeniden kurulmalı/güncellenmeli |
| MEDIUM | JSON gövdesi parse öncesi sınırsızdı | Düzeltildi | 1 MiB toplam sınır; streamed/header bypass ve sınır testleri |
| MEDIUM | Prompt injection / yanıltıcı kaynak yorumuyla kanıt kalitesi etkilenebilir | Kısmen azaltılmış, devam eden risk | Mevcut grounding ve strict validation korunur; insan incelemesi ve adversarial kalite değerlendirmesi gerekir |
| MEDIUM | Deployment güven sınırları henüz tanımlı değil: TLS, Host/proxy güveni, erişim, retention/backup, secret yönetimi | Açık — production blocker | Yerel loopback demo; public ingress ve operasyon tasarımı ayrı yapılmalı |
| LOW | CORS ayarı wildcard veya origin olmayan değer kabul edebiliyordu | Düzeltildi | Startup explicit-origin validator ve test |
| LOW | Frontend kaynak linki standart dışı GitHub portunu kabul ediyordu | Düzeltildi | Port reddi ve saldırgan URL testleri |
| LOW | Frontend güvenlik response header'ları eksikti | Düzeltildi | Dört header; çalışan production sunucusunda kontrol |
| LOW | `.env.production` gibi bazı environment dosyaları ignore kapsamında değildi | Düzeltildi | `.env.*`, yalnız example istisnası; gerçek dosya sızıntısı tespit edilmedi |
| MEDIUM | Audit sırasında pytest 8.3.5 için Unix tmpdir advisory bulundu | **RESOLVED** | Yamalı pytest 9.0.3; tüm testler tekrar geçti |
| INFO | İlk turda eksik olan Python dependency taraması | Tamamlandı | İzole audit venv ile 32 paket, 0 bulgu, 0 atlanan paket |

## Dependency audit

1 Ekim 2026 dependency hardening turu:

| Paket | Önce | Doğrulanan yeni sürüm |
|---|---|---|
| FastAPI | 0.115.12 | **0.142.2** (güncel stabil PyPI sürümü) |
| Starlette (transitif) | 0.46.2 | **1.7.0** (resolver seçimi) |
| pytest (test aracı) | 8.3.5 | **9.0.3** (audit bulgusunun yamalı sürümü) |

`requirements.txt` içinde yalnız FastAPI ve pytest pinleri değişti. Starlette doğrudan
pinlenmedi. Python 3.12.14 üzerinde temiz venv ve pip `--dry-run --ignore-installed`
çözümlemesiyle uyumluluk kontrol edildi; Pydantic 2.11.4 ve diğer doğrudan pinler korundu.
FastAPI'nin [resmî tavsiyesi](https://fastapi.tiangolo.com/deployment/versions/#about-starlette)
Starlette sürümünü FastAPI'ye bırakmaktır. [Sürüm notları](https://fastapi.tiangolo.com/release-notes/#01330)
1.x desteğini 0.133.0'dan itibaren belirtir. Güncel metadata:
[FastAPI 0.142.2](https://pypi.org/project/fastapi/0.142.2/) ve
[Starlette 1.7.0](https://pypi.org/project/starlette/1.7.0/).

Giderilen Starlette duyuruları:

- **GHSA-82w8-qh3p-5jfq / CVE-2026-54283**: urlencoded form DoS;
  patched **>=1.3.1**, doğrulanan 1.7.0 bu eşiği karşılıyor.
  [Resmî advisory](https://github.com/Kludex/starlette/security/advisories/GHSA-82w8-qh3p-5jfq).
- Önceki rapordaki
  [Windows StaticFiles UNC/NTLM](https://github.com/Kludex/starlette/security/advisories/GHSA-wqp7-x3pw-xc5r),
  [FileResponse Range DoS](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8) ve
  [multipart parsing DoS](https://github.com/encode/starlette/security/advisories/GHSA-2c2j-9gv5-cj73)
  için de doğrulanan sürüm yamalı aralıktadır.
- İlk tam audit, pytest için aynı advisory'yi iki kayıt olarak raporladı:
  [GHSA-6w46-j5rx-g56g / CVE-2025-71176](https://github.com/advisories/GHSA-6w46-j5rx-g56g).
  Unix geçici klasör işlemleriyle ilgili bu MEDIUM risk için belirtilen patched
  9.0.3'e geçildi. Bu test aracı güncellemesi uygulama kodunu değiştirmedi.

Son kontroller:

- `npm audit` ve `npm audit --omit=dev`: **0 vulnerability**.
- İzole `work/audit-venv` içindeki pip-audit 2.10.1 ile
  `python -m pip_audit -r backend/requirements.txt`: **32 paket, 0 bulgu, 0 atlanan**.
  Araç global sisteme veya uygulama venv'ine kurulmadı; `--fix` kullanılmadı.
- `python -m pip check`: **No broken requirements found**.
- Python HTTPS istemcisi `files.pythonhosted.org` bağlantısında reset aldığı için
  resmî PyPI wheel'leri Node HTTPS istemcisiyle indirildi; her dosyanın SHA-256'sı
  PyPI metadata'sına karşı doğrulandı. Resolver ve temiz kurulum bu yerel havuzla
  `--no-index --find-links work/hardening-wheels` üzerinden yapıldı. TLS doğrulaması
  kapatılmadı. Audit resolver'ına da aynı havuz verildi; vulnerability sorguları
  PyPI üzerinden yapıldı. Geçici ortamlar/raporlar `work/` altında ignore edilir.

**Mevcut venv uyarısı:** FastAPI 0.142.2 metadata'sı `starlette>=0.46.0` ister.
Dolayısıyla yalnız FastAPI'yi yükseltmek, zaten kurulu eski Starlette'i koruyabilir.
Temiz venv tercih edin veya aşağıdaki komutu çalıştırıp sürümü doğrulayın:

```bash
python -m pip install --upgrade --upgrade-strategy eager -r backend/requirements.txt
python -c "import fastapi, starlette; from packaging.version import Version; print(fastapi.__version__, starlette.__version__); assert Version(starlette.__version__) >= Version('1.3.1')"
```

Bu sonuç test edilen resolution içindir; requirements tam bir transitive lock değildir.
Her deployment'ta sürüm/audit kontrolü tekrarlanmalı. Eski paylaşılan venv bu turda
üzerine yazılmadı; regresyonlar yeni `work/hardening-venv` ortamında çalıştırıldı.

## Production blockers

1. Authentication, authorization ve tenant/kayıt sahipliği kontrolü.
2. Kimlik bazlı kota, ingress rate limit/body/header/time limit, eşzamanlı analiz
   sınırı ve provider bütçe/uyarıları. Retry/HTTP timeout toplam işi sınırlamaz.
3. Dağıtımda doğrulanan dependency zincirinin kullanılması ve sürekli audit/regresyon kontrolleri. Bu turdaki Starlette bulgusu RESOLVED; eski venv ile yayın yapılmamalı.
4. TLS, açık Host/proxy/origin politikası, ağ erişimi, DB least-privilege hesapları,
   backup/retention, secrets yönetimi ve gözlemlenebilirlik. Örnek DB parolası yalnız local içindir.
5. Gerçek kullanıcı verisi kullanılacaksa veri silme/saklama ve üçüncü taraf LLM
   aktarım kararları. Public repository olması içeriğin kişisel veri veya secret
   içermediği anlamına gelmez; seçilen bağlam provider'a gönderilir.

## Deferred hardening

CSP nonce tasarımı, doğrulanmış HTTPS için HSTS, trusted-host/proxy yapılandırması,
egress kısıtları, idempotency/queue, analiz toplam deadline ve browser fetch iptali,
CI secret scanning ve dependency taraması, adversarial model değerlendirmeleri.
Bu turda ağır auth/queue veya sahte production limiter geliştirilmedi.

## Verification commands

Frontend (`frontend/`):

```bash
npm run lint
npm test
npm run build
npm audit --json
npm audit --omit=dev
npm run start -- --hostname 127.0.0.1
```

Lint/build başarılı; **7 frontend testi** geçti. Headers çalışan sunucudan okundu.
Production desktop 1440×1000 ve mobil 390×844 kontrol edildi; ayrıntılar
[frontend doğrulama kaydında](FRONTEND_VALIDATION.md).

Backend (`backend/`, mevcut sanal ortam Python'u):

```bash
python -m pytest -q -p no:cacheprovider --basetemp=../work/security-pytest
python -m compileall -q app tests migrations scripts
python -m pip check
python -m alembic check
```

**163 pytest testi** geçti (önceki 135 + 28 güvenlik regresyonu).
Yeni zincirde Starlette TestClient için httpx kullanımının deprecated olduğuna dair bir uyarı var; testler geçiyor. Runtime HTTP istemcisi veya test kodu bu turda değiştirilmedi. Compileall ve pip check geçti.
Alembic check, migrate edilmiş izole SQLite demo DB'sinde “No new upgrade operations
detected” döndü. Bu turda PostgreSQL suite ve canlı Gemini/OpenAI çağrısı tekrarlanmadı.

`git diff --check` başarılı. `git check-ignore` ile `.env`, `.env.production`,
frontend environment dosyaları ve ignored çalışma çıktıları kontrol edildi;
example dosyaları ignore edilmez. Secret taraması eşleşme değerlerini loglamaz.


## Dependency hardening regresyon kaydı

Yeni ortamda `python -m pytest -q -p no:cacheprovider
--basetemp=../work/hardening-final-pytest`: **163 passed**. Compileall, pip check
ve yeni migrate edilmiş izole SQLite DB üzerinde Alembic check başarılı.
Frontend lint, 7 test ve production build başarılı. Yeni FastAPI'nin ürettiği
OpenAPI JSON nesnesi `frontend/openapi.json` ile **birebir aynı**.
Uygulama/AI/matching/migration/frontend kodunda compatibility düzeltmesi gerekmedi.

Gerçek Uvicorn HTTP smoke, yeni venv + izole DB + `rule_based` ile
`127.0.0.1:8001` üzerinde yapıldı: health 200, candidate/project/need create 201;
Python/FastAPI/Docker kriterleri, izinli CORS, reddedilen origin ve 1 MiB üstü
istekte 413 standart envelope/CORS doğrulandı. Canlı Gemini çağrısı yapılmadı.
`git diff --check` başarılı. Authentication ve rate-limit HIGH bulguları **açık**.


## Profile evidence genişlemesi — güncel inceleme

Sonuç **SAFE_FOR_CONTROLLED_DEMO**; auth/authorization/IDOR ve rate-limit **HIGH / OPEN**, production blocker olmaya devam eder. Yeni PATCH/DELETE uçları da ownership kontrolü gerektirir. UUID erişim kontrolü değildir. Önceki Starlette HIGH advisory bulgusu RESOLVED kalır; bağımlılıklar düşürülmedi.

- Beş kategori CRUD: education, certification, hackathon, event, community. Mass assignment extra=forbid; kullanıcı verified, owner ID veya zaman damgası atayamaz. Category PATCH ile değişmez. Metadata alanları kategoriyle sınırlı; participation_type/result bounded enum.
- Profil URL'leri yalnız credentialsız HTTPS ve standart port; IP/local adlar ve unsafe schemes reddedilir. Backend bu bağlantıları fetch/crawl etmez. Bu yüzden link varlığı içerik doğrulaması değildir; linked olarak gösterilir. Tarayıcıda dış link açılması kullanıcının tercihidir; noopener/noreferrer uygulanır.
- JSX text rendering korunur. Gerçek ProfileCard bileşeni script/img-onerror metinleriyle render edilerek HTML kaçışı doğrulandı. SQL injection biçimli başlık veritabanında yalnız metin olarak saklandı; başka adayın kayıtları değişmedi. Bu test ownership güvenliği olduğu anlamına gelmez.
- Input uzunlukları ve tarih sırası kontrol edilir; mevcut 1 MiB body sınırı profil uçlarını da kapsar. Listeleme şu an sayfalama/tenant kotası içermez; kontrollü demo kapsamındadır.
- CORS varsayılan origin listesi aynı; CRUD için PATCH/DELETE eklendi. Browser QA'da 3001 portu ayrıca process environment üzerinden açıkça izinli hale getirildi. Wildcard ve credential izni yok.
- Eşleşme doğru evidence ailesini kullanır; unrelated kayıtlar teknik skoru değiştirmez. Kayıt sayısı, GPA, okul prestiji veya çıkarılmış soft skill puanlanmaz. Teknoloji topluluğu kriteri için explicit focus=technology gerekir; herhangi bir topluluk kaydı yeterli değildir.
- Profil eşleşmesi kayıtların immutable JSON kopyasını taşır. Düzenleme/silme geçmiş sonucu değiştirmez. Profil silme geçmiş kopyaları silmez: production öncesinde retention/erasure politikası gereklidir.
- LLM need çıktısı family/key kataloğu, sınırlı teknik sözlük, schema ve exact source excerpt ile kontrol edilir. Prompt injection tamamen çözülmüş sayılmaz; insan kriter incelemesi gerekir. LLM final skor üretmez. Project provider sözleşmesi değişmedi.
- DB preflight açık PostgreSQL config, bağlantı ve migration head doğrular. Varsayılan örnek credentials ile sessiz başarı veya SQLite fallback yok. Script hata çıktısı URL/hostname/password/trace içermez.
- Tracked/untracked uygulama dosyalarında anahtar/private-key pattern bulgusu yok; .env ve çalışma çıktıları ignored. Frontend yalnız public API base URL kullanır.

Son backend regresyonu: **204 test SQLite + 204 test temiz PostgreSQL**, compileall, pip check ve Alembic check başarılı. İzole PostgreSQL'de upgrade/check/downgrade/upgrade eski candidate/project/snapshot/skill evidence verilerini korudu. pip-audit: **32 dependency, 0 advisory**. Frontend: 11 test, lint ve production build başarılı; npm audit (tüm/dev hariç) 0 bulgu. Browser ve komut ayrıntıları [profil doğrulama kaydında](PROFILE_VALIDATION.md).

İlk canlı GitHub/PostgreSQL/rule_based smoke 27 evidence ve 80 skorla geçti. Sonraki browser analizinde anonim GitHub kotası 0 olduğu için kontrollü GITHUB_FETCH_FAILED alındı; application bug veya başarılı analiz olarak raporlanmadı. Gemini: **BLOCKED_BY_MISSING_KEY**; sahte canlı sonuç yok.
