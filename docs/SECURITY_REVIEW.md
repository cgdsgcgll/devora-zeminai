# ZeminAI MVP güvenlik değerlendirmesi

Tarih: 1 Ekim 2026. Branch: `feat/frontend-mvp`. Sonuç: **SAFE_FOR_CONTROLLED_DEMO**.
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
  olarak gösteriliyor. Dış kaynak linkleri HTTPS `github.com`, credentialsız ve
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
  `http://127.0.0.1:3000`; GET/POST ve Content-Type. Credentials açılmıyor.
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
| HIGH | Kurulu Starlette 0.46.2, aşağıdaki HIGH duyurularının sürüm aralığında | Ertelendi — mevcut kod ilgili form/dosya servislerini kullanmıyor | Public deployment öncesi uyumlu FastAPI/Starlette yükseltmesi ve tam dependency taraması; sürüm zorlaması yapılmadı |
| MEDIUM | JSON gövdesi parse öncesi sınırsızdı | Düzeltildi | 1 MiB toplam sınır; streamed/header bypass ve sınır testleri |
| MEDIUM | Prompt injection / yanıltıcı kaynak yorumuyla kanıt kalitesi etkilenebilir | Kısmen azaltılmış, devam eden risk | Mevcut grounding ve strict validation korunur; insan incelemesi ve adversarial kalite değerlendirmesi gerekir |
| MEDIUM | Deployment güven sınırları henüz tanımlı değil: TLS, Host/proxy güveni, erişim, retention/backup, secret yönetimi | Açık — production blocker | Yerel loopback demo; public ingress ve operasyon tasarımı ayrı yapılmalı |
| LOW | CORS ayarı wildcard veya origin olmayan değer kabul edebiliyordu | Düzeltildi | Startup explicit-origin validator ve test |
| LOW | Frontend kaynak linki standart dışı GitHub portunu kabul ediyordu | Düzeltildi | Port reddi ve saldırgan URL testleri |
| LOW | Frontend güvenlik response header'ları eksikti | Düzeltildi | Dört header; çalışan production sunucusunda kontrol |
| LOW | `.env.production` gibi bazı environment dosyaları ignore kapsamında değildi | Düzeltildi | `.env.*`, yalnız example istisnası; gerçek dosya sızıntısı tespit edilmedi |
| INFO | `pip-audit` mevcut değil; Python dependency vulnerability taraması tamamlanmadı | Doğrulama sınırı | Ayrı ortam/CI'da çalıştır; pip check sadece bağımlılık uyumluluğunu denetler |

## Dependency audit

- `npm audit --json` ve `npm audit --omit=dev`: **0 vulnerability**.
  Lockfile değiştirilmedi; bu sonuç gelecekteki duyuruları veya tüm saldırı sınıflarını kapsamaz.
- `pip-audit` Python modülü kurulu değil; `pip-audit -r requirements.txt` çalıştırılamadı.
  `python -m pip check`: **No broken requirements found**.
- Resmî Starlette duyuruları ayrıca incelendi. Kurulu sürüm **0.46.2**:
  - [GHSA-82w8-qh3p-5jfq](https://github.com/Kludex/starlette/security/advisories/GHSA-82w8-qh3p-5jfq): HIGH, urlencoded form parsing DoS; düzeltilmiş sürüm 1.3.1.
  - [GHSA-wqp7-x3pw-xc5r](https://github.com/Kludex/starlette/security/advisories/GHSA-wqp7-x3pw-xc5r): HIGH, Windows StaticFiles UNC/NTLM riski; düzeltilmiş sürüm 1.1.0.
  - [GHSA-7f5h-v6xp-fcq8](https://github.com/Kludex/starlette/security/advisories/GHSA-7f5h-v6xp-fcq8): HIGH, FileResponse Range DoS; düzeltilmiş sürüm 0.49.1.
  - [GHSA-2c2j-9gv5-cj73](https://github.com/encode/starlette/security/advisories/GHSA-2c2j-9gv5-cj73): MEDIUM, multipart büyük dosya parsing DoS; duyuruda patched sürüm 0.47.2.
  Backend route'larında `request.form`, `Form`, `UploadFile`, `StaticFiles` veya
  `FileResponse` yok; UI dosyalarını Next.js sunuyor. Dolayısıyla bu duyuruların
  exploit önkoşullarının mevcut endpointlerde sağlanmadığı kod incelemesinden
  çıkarılmıştır; paketlerin yamalı olduğu iddia edilmez. FastAPI 0.115.12'nin
  Starlette sürüm kısıtı nedeniyle transitif paketi tek başına zorla yükseltmek
  uygun değildir. Bu liste tam Python dependency audit yerine geçmez.

## Production blockers

1. Authentication, authorization ve tenant/kayıt sahipliği kontrolü.
2. Kimlik bazlı kota, ingress rate limit/body/header/time limit, eşzamanlı analiz
   sınırı ve provider bütçe/uyarıları. Retry/HTTP timeout toplam işi sınırlamaz.
3. Python bağımlılıklarının tam taraması, uyumlu güvenlik güncellemeleri ve regresyon testleri.
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
Bir mevcut Starlette/AnyIO deprecation uyarısı var. Compileall ve pip check geçti.
Alembic check, migrate edilmiş izole SQLite demo DB'sinde “No new upgrade operations
detected” döndü. Bu turda PostgreSQL suite ve canlı Gemini/OpenAI çağrısı tekrarlanmadı.

`git diff --check` başarılı. `git check-ignore` ile `.env`, `.env.production`,
frontend environment dosyaları ve ignored çalışma çıktıları kontrol edildi;
example dosyaları ignore edilmez. Secret taraması eşleşme değerlerini loglamaz.
