# ZeminAI

**Doğrulanabilir Yetenek ve Akıllı Eşleşme Platformu**

[MIT License](LICENSE) · [Hızlı başlangıç](#hızlı-başlangıç) · [Demo akışı](#güncel-ürün-akışı) · [Mimari ve tercihler](#mimari) · [Testler](#testler-ve-doğrulama) · [Bilinen sınırlar](#bilinen-sınırlar) · [Katkı](CONTRIBUTING.md)

ZeminAI, adayın proje ve deneyim kayıtlarını belirli bir kurum ihtiyacının kriterleriyle ilişkilendirir. **Adaya genel bir yetenek puanı vermez; hangi kriter için hangi kanıtın mevcut olduğunu, hangilerinin yalnız beyan olduğunu ve hangi boşlukların kaldığını gösterir.** “Kanıt Uyumu”, bu ihtiyaca özgü kriter kapsamıdır.

GitHub, kanıt sağlayıcılarından yalnızca biridir. Eğitim, sertifika, hackathon, etkinlik, topluluk ve portföy kayıtları da yaşayan profilde yer alır. Kurumlar eşleşmenin dayanağını inceleyebilir, adayları keşfedebilir, elle seçtikleri takımın kapsamını ve kalan boşlukları kapatan adayları görebilir. Eksik kanıt için Kanıt İsteği açılabilir; bu süreç otomatik doğrulama yapmaz.

**30 saniyede:** Dağınık CV/proje beyanlarını incelemek zordur. ZeminAI, kaynaklı kanıtları kurumun açık kriterleriyle eşleştirip dayanağını gösterir. **AI**, proje içeriğini ve ihtiyaç metnini yapılandırır; **skoru deterministik kurallar hesaplar**. Next.js + FastAPI modüler monoliti + PostgreSQL, MVP'de tek transaction sınırı ve düşük operasyon yükü sağlar. Anahtarsız `rule_based` başlangıcı ve GitHub/AI kurulumu aşağıdadır.

[Windows / macOS kurulumu](#hızlı-başlangıç) · [Doküman haritası](docs/README.md) · [Güncel doğrulama](docs/VALIDATION.md)

## Problem

CV’deki beceri beyanlarını doğrulamak ve dağınık proje bilgilerini incelemek zaman alır. Kurumların doğal dildeki ihtiyaçları her zaman açık teknik kriterlere dönüşmez; tek başına verilen bir eşleşme skoru da kararın dayanağını göstermez.

## Çözüm

```mermaid
flowchart LR
    A[Hesap ve aday profili] --> P[Proje / eğitim / deneyim kayıtları]
    P --> G[İsteğe bağlı GitHub snapshot ve analiz]
    P --> M[Deterministik eşleşme]
    G --> M
    N[Kurum ihtiyacı] --> C[Zorunlu / tercih edilen kriterler]
    C --> M
    M --> R[Kanıt Uyumu ve nasıl hesaplandı]
    R --> T[Evidence Trace ve boşluklar]
    C --> D[Aday keşfi]
    D --> U[Elle seçilen takım kapsamı]
    U --> K[Takım Tamamlayıcıları]
    T --> Q[Kanıt İsteği]
```

Akışlar ihtiyaca göre kullanılır; her kullanıcının bütün adımları tamamlaması gerekmez. Snapshot incelenen dosyaları ve commit referansını, kayıtlı eşleşme ise o andaki kriter/kanıt ilişkilerini saklar.

## Neden Farklı?

- Teknik kriterleri yalnız `observed` proje kanıtı karşılar. Profil kriterlerini ilgili ailedeki kayıt karşılar; `declared_only` / `linked` durumu açıkça gösterilir ve teknik beceriye çevrilmez.
- Kanıt gücü, kişinin beceri seviyesi değildir. Kanıt bulunamaması da becerinin olmadığı anlamına gelmez.
- LLM final skoru üretmez; matching aynı girdilerle aynı sonucu veren bir fonksiyondur.
- LLM çıktısı ortak JSON Schema, strict Pydantic ve kaynak/alıntı kontrollerinden geçer.
- Repository içeriği güvenilmeyen veri olarak ele alınır. Analizler provider, model ve sürüm bilgileriyle izlenir.

## Güncel Ürün Akışı

1. `/kayit` üzerinden Aday veya Kurum hesabı açın. Aday profili hesapla birlikte oluşturulur; kurum kendi ihtiyaçlarını yönetir. `/giris` ve çıkış menüsü DB tabanlı oturum kullanır.
2. Aday, proje ve isteğe bağlı eğitim/sertifika/hackathon/etkinlik/topluluk/portföy kayıtlarını ekler. GitHub projesi analiz edildiğinde `RepositorySnapshot`, `AnalysisRun` ve kaynaklı `SkillEvidence` oluşur.
3. Kurum ihtiyacını doğal dille anlatır veya açık kriterlerle oluşturur; zorunlu ve tercih edilen kriterleri inceler.
4. Eşleşmedeki “Nasıl hesaplandı?” ile kriter sayılarını, kapsamı ve formülü; **Evidence Trace** ile kaynakları ve kanıt boşluklarını okur.
5. İhtiyaca göre aday keşfini, kanıt odaklı görünümü ve elle seçilen takımın kapsamını kullanabilir; açık kriterler için **Takım Tamamlayıcıları** arayabilir.
6. Karşılanmayan kriter için **Kanıt İsteği** açabilir. Aday mevcut proje, profil kaydı veya HTTPS bağlantısı paylaşır. Gönderim ya da kapatma, kanıtı otomatik olarak `observed` yapmaz; kayıtlı match snapshot/skorunu değiştirmez.

Match için en az bir başarılı proje analizi veya profil kaydı gerekir. Yalnız profil kaydı teknik kriteri karşılamaz; kanıt üretilmemesi geçerli bir analiz sonucudur. [Kanıt İsteği iş akışı ve API](docs/PROOF_REQUESTS.md).

## Yaşayan Profil, Keşif ve Takım Kapsamı

`/profil`; Gelişim Zaman Çizelgesi, kayıt sayılarına dayalı Yetenek Haritası ve **Kanıt Pasaportu** sunar. Sayılar kalite/yetenek puanı değildir; tarihi olmayan kayıtlar eklenme tarihiyle etiketlenir. `/aday` üzerinden profil kanıtları düzenlenir. Profil kayıtları ve bağlantılar bağımsız doğrulama değildir; sürekli senkronizasyon henüz yoktur.

`/kesif`, en fazla **100 aktif adaylık tam havuzu** önce Kanıt Uyumu, gerekli kapsam ve tercih edilen kapsam azalan; eşitlikte aday kimliği artan sırada sıralar, sonra sayfalar. Havuz sınırı aşılırsa kısmi sonuç dönmez. Kanıt odaklı inceleme (blind review), kimlik alanlarını ve kaynak serbest metinlerini sunucuda çıkarır; tam anonimlik garantisi değildir. Yetkili kurum yalnız kendi ihtiyacı bağlamında kullanır.

| Akış | Ne yapar? |
|---|---|
| **Takım oluşturucu** | Elle seçilen **2–4 adayın** kriter birleşimini (union coverage) matriste gösterir. Bir kriteri birden fazla adayın karşılaması ek puan vermez. |
| **Takım Tamamlayıcıları** | **2–3 aday seçili ve açık kriter varsa**, kullanıcı isteğiyle aynı sınırlı tam aktif havuzu değerlendirir. Seçili adayları çıkarır; yalnız en az bir açık kriteri mevcut matcher ile kapatan adayları gösterir. |

Tamamlayıcıların sırası: **kapatılan zorunlu boşluk sayısı DESC → tercih edilen boşluk sayısı DESC → candidate_id ASC**. Genel aday skoru tie-break değildir. Teknik `declared_only` kanıt teknik boşluğu kapatamaz; ilgili profil deneyimi kriterlerinin mevcut beyan/bağlantı semantiği korunur.

Her sonuç destekleyen kaynak referanslarını ve aday eklenirse oluşacak gerekli/tercih edilen union kapsamını gösterir. “Takıma ekle” yalnız arayüz seçimini günceller; takım kapsamı yeniden hesaplanır, eski öneri temizlenir. Dört kişide ekleme sınırına ulaşılır. Otomatik takım seçimi, takım üyeliği/öneri kaydı, AI/provider çağrısı veya dış URL fetch yapılmaz. Bu araçlar takım başarısı ya da kişilik/takım uyumu tahmini değildir. [Sözleşme ve sınırlar](docs/LIVING_PROFILE.md).

Arayüz **TR/EN** arasında geçer ve dil tercihini tarayıcıda saklar. Aday adları, kurum açıklamaları, beceri etiketleri, notlar ve kaynak alıntıları otomatik çevrilmez. Dil seçimi eşleşme sonucunu değiştirmez.

## Kanıt Modeli

| Alan | Değerler | Anlamı |
|---|---|---|
| `evidence_status` | `observed`, `declared_only`, `not_found` | Gözlemlenen kanıt, yalnız beyan veya kanıt bulunamaması |
| `evidence_strength` | `weak`, `medium`, `strong` | Kanıtın destek gücü; kişinin beceri seviyesi değil |
| `evidence_type` | `project_description`, `readme`, `source_file`, `dependency_file`, `repository_language`, `user_claim` | Kanıtın kaynak türü |

LLM analizinde README/açıklama/beyan ve repository dil metadatası `declared_only / weak` olarak sınırlandırılır; tek başına `observed` teknik kanıt veya teknik kriter karşılığı olamaz. Dependency-only kanıt en fazla `medium` olur. Evidence kayıtları kaynak URL’si, varsa dosya yolu, alıntı, gerekçe ve sınırlamalar taşır.

**Evidence strength ≠ skill proficiency.** İsteğe bağlı GitHub App bağlantısı hesap kontrolünü ve repository erişimini doğrular; katkı sahipliği/yazarlık doğrulamaz ve skoru değiştirmez. [Kurulum ve sınırlar](docs/GITHUB_ACCOUNT_VERIFICATION.md).

Adaylar birden fazla projeyi ekleyebilir, ad/açıklamasını düzenleyebilir ve geçmiş eşleşmeleri koruyarak arşivleyebilir. Seçili GitHub repository’leri doğrudan içe aktarılır; public kaynaklar mevcut analizden geçer, private kaynak analizi desteklenmez. LinkedIn profil URL’si ve adayın yapıştırdığı metin, önizleme/onay ile mevcut profil kayıtlarına eklenir; scraping veya teknik beceri doğrulaması yapılmaz. [Yaşam döngüsü, veri sınırları ve doğrulama](docs/PROJECT_LIFECYCLE.md).

## Eşleşme / Scoring

[Scorer](backend/app/services/matching/scorer.py), teknik kriterlerde normalize `skill_key` ve `observed` kanıtları, diğer kriterlerde ilgili proje/profil ailesini kullanır. Okul prestiji, GPA, etkinlik/kayıt sayısı, sosyal skor, kişilik veya soft-skill bonusu yoktur. Bir kriterin birden fazla kanıtı olması kapsamı artırmaz; evidence strength bir puan çarpanı değildir.

`requiredCoverage` ve `preferredCoverage`, ilgili grupta kanıtla karşılanan kriter sayısının toplam kriter sayısına oranıdır.

| Kriterler | Formül |
|---|---|
| Required ve preferred birlikte | `100 × (0.80 × requiredCoverage + 0.20 × preferredCoverage)` |
| Yalnız required | `100 × requiredCoverage` |
| Yalnız preferred | `100 × preferredCoverage` |
| Kriter yok | HTTP 422, `MATCHING_FAILED` |

Skor 0–100 aralığındadır. İhtiyaç yalnızca `technical_skill` kriterlerinden oluşuyorsa `evidence-coverage-v0.2`; en az bir `project_experience` veya profil/deneyim kriteri içeriyorsa `evidence-coverage-v0.3` sürümü saklanır. İki required kriterden biri karşılanıp tek preferred kriter karşılanmıyorsa skor 40’tır.

“**Nasıl hesaplandı?**” disclosure’ı gerçek kriter listelerinden karşılanan/toplam sayıları, backend’in required/preferred coverage değerlerini ve yukarıdaki formülü gösterir. **Backend `result.score` authoritative değerdir**; frontend yeni karar skoru üretmez. Kanıt gücü skoru değiştirmez.

**Evidence Trace**, kriterin kaynak ailesini, `observed / declared_only / not_found` durumunu ve neden sayılıp sayılmadığını açıklar. README/proje açıklamasındaki yalnız beyan, `declared_only / weak` kalır ve `technical_skill` kriterini karşılamaz. Tarihsel match ve kanıt izi dondurulmuştur; sessizce yeniden hesaplanmaz. Trace alanı olmayan eski kayıtlar bunu belirtir.

**Kanıt Uyumu, belirli ihtiyaç için mevcut kanıt ve ilgili profil kayıtlarının kapsamıdır; işe alınma ihtimali veya genel yetenek skoru değildir.**

## Yapay Zekâ Nerede Kullanılıyor?

LLM, sınırlı proje açıklaması/README/kaynak dosya bağlamından beceri kanıtlarını çıkarır, normalize eder, yapılandırır ve açıklar; kurum ihtiyacını `required` ve `preferred` kriterlere dönüştürür. Alıntıların gönderilen kaynakta bulunması ve beceriyle ilişkisi backend tarafından kontrol edilir.

AI işe alınma olasılığı veya genel yetenek puanı hesaplamaz. Final matching skoru Eşleşme / Scoring bölümündeki sabit formülle hesaplanır. Kaynak doğrulaması kodun çalıştığını, adayın kodu yazdığını veya model yorumunun her durumda doğru olduğunu ispatlamaz.

## Canlı AI Doğrulaması

Önceki fazda ekip gerçek Gemini project/need structured output ve grounding smoke testinin geçtiğini bildirdi. Bu tarihsel entegrasyon sonucu, güncel worker/C++ akışının canlı doğrulaması değildir. O testte kullanılan demo ayarları:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
LLM_TIMEOUT_SECONDS=120
```

Eski smoke kaydındaki `observed / repository_language` örneği güncel kanıt kuralına uygun değildir ve geçerli örnek olarak kullanılmaz: metadata tek başına yalnız beyandır. Gerçek kaynak içeriğiyle desteklenen kanıt gerekir. Güncel test kapsamı ve canlı doğrulama sınırları [VALIDATION](docs/VALIDATION.md) içinde ayrılır. Demo için 120 saniyelik HTTP timeout kullanılır; retry toplam süreyi uzatabilir.

## Desteklenen Analiz Modları

| `LLM_PROVIDER` | Kullanım ve doğrulama |
|---|---|
| `rule_based` | Anahtarsız geliştirme/test; sınırlı kural tabanlı analiz |
| `gemini` | generateContent REST adaptörü; otomatik mock testler, önceki faza ait canlı smoke kaydı |
| `openai` | Responses REST adaptörü; mock testler geçti, canlı OpenAI testi henüz yapılmadı |

Kod varsayılanı `rule_based`, `.env.example` demo seçimi `gemini`dir. Modeller environment üzerinden gelir; kodda sabitlenmez. Seçilen LLM için key/model eksikse `LLM_NOT_CONFIGURED` döner; sessiz fallback yoktur. Açık kriterlerle ihtiyaç oluşturmak LLM çağrısı gerektirmez.

## Mimari

Backend **modüler monolit** olarak tasarlandı: API, auth, GitHub, analiz/provider ve matching modülleri aynı uygulama ve veritabanı sınırında çalışır. Frontend ayrı Next.js uygulamasıdır.

**Neden mikroservis değil?** Küçük MVP ekibinde bağımsız servis deploy'u, servisler arası auth, dağıtık transaction ve ağ hatalarının maliyeti ürün doğrulamasına katkı sağlamıyordu. Tek PostgreSQL transaction sınırı import/provenance tutarlılığını, ortak tipli sözleşmeler ise test ve hata ayıklamayı kolaylaştırır. Yavaş analiz HTTP import isteğinden ayrılmış, DB'de kalıcı job ve worker ile yürütülür; bunun için ayrı mikroservis gerekmez. Dezavantajı ortak deploy ve hata/ölçekleme sınırıdır. Ölçülen yük gerektirirse provider/analiz worker'ı bu modül sınırından ayrılabilir; bugün dağıtık mikroservis ölçeği iddia edilmez.

```mermaid
flowchart TD
    U[Next.js / Swagger / API istemcisi] --> API[FastAPI endpointleri]
    API --> W[Workflow katmanı]
    W --> J[Kalıcı analiz job / worker]
    J --> G[Sınırlı GitHub kaynak okuma]
    G --> S[RepositorySnapshot]
    S --> A[Analiz katmanı]
    W -->|Kurum ihtiyacı| A
    A --> P[rule_based / Gemini / OpenAI]
    P --> V[Şema ve kaynak kontrolünden geçen çıktılar]
    V --> W
    W --> M[Deterministik matching]
    W --> DB[(PostgreSQL)]
    M --> W
```

Provider adaptörleri yalnız API iletişimi ve structured output taşır; veritabanı işlemleri workflow katmanındadır. Gemini ve OpenAI aynı project/need analyzer ve Pydantic sözleşmelerini kullanır. Analiz kayıtlarında provider/model, analiz sürümü, başlangıç/bitiş zamanı ve proje için commit SHA tutulur.

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | Next.js 16.3.8, React 19.3, TypeScript, App Router |
| Backend | Python 3.12 doğrulanmış hedef, FastAPI, Uvicorn |
| Validation | Pydantic 2, pydantic-settings |
| ORM / migration | SQLAlchemy 2, Alembic |
| Veritabanı | PostgreSQL; varsayılan testlerde SQLite |
| HTTP / AI | httpx; Gemini ve OpenAI REST adaptörleri |
| Test | pytest, HTTP mock transport |
| Yerel veritabanı | PostgreSQL 18; eski Docker Compose alternatifi PostgreSQL 16 |

Sürümler [requirements.txt](backend/requirements.txt) içinde sabittir. Frontend kurulumu ve sözleşme üretimi [frontend/README.md](frontend/README.md) içinde açıklanır.

## API

| Method | Endpoint | Amaç |
|---|---|---|
| POST / GET | `/auth/register`, `/auth/login`, `/auth/logout` (POST); `/auth/me` (GET) | Hesap, oturum ve mevcut kullanıcı |
| POST / GET / PATCH | `/candidates` (POST); `/candidates/{candidate_id}` (GET/PATCH) | Aday profili |
| GET / POST | `/candidates/{candidate_id}/projects` | Projeleri listele / GitHub projesi ekle |
| GET / POST | `/projects/{project_id}` (GET); `/projects/{project_id}/analyze` (POST) | Projeyi oku / snapshot ve kanıt analizi |
| GET | `/projects/{project_id}/evidence`, `/snapshots/{snapshot_id}`, `/evidence/{evidence_id}`, `/analysis-runs/{run_id}` | Kanıtlar, snapshot ve analiz durumu |
| GET / POST | `/candidates/{candidate_id}/profile-evidence` | Profil kanıtlarını listele / ekle |
| GET / PATCH / DELETE | `/profile-evidence/{evidence_id}` | Profil kaydını oku / düzenle / sil |
| GET | `/candidates/{candidate_id}/living-profile` | Yaşayan profil, timeline, Yetenek Haritası, Kanıt Pasaportu |
| GET / POST | `/needs` | Kurumun ihtiyaçları / kriterli ihtiyaç oluştur |
| GET / PATCH | `/needs/{need_id}` | İhtiyacı oku / rol ve beklenen çıktı metadata’sını düzenle |
| POST / GET | `/matches` (POST); `/matches/{match_id}` (GET) | Deterministik eşleşme kaydet / frozen sonucu oku |
| GET | `/matches/{match_id}/gaps`, `/matches/{match_id}/evidence/{evidence_id}` | Kayıtlı boşluklar ve eşleşmeyle ilişkili kanıt |
| GET | `/needs/{need_id}/discovery` | İhtiyaca özgü, tam havuzda sıralanan aday keşfi |
| POST | `/needs/{need_id}/team-coverage` | Elle seçilen 2–4 adayın union kapsamı |
| POST | `/needs/{need_id}/team-complements` | 2–3 farklı aktif adayın açık kriterlerini kapatan adaylar |
| GET / POST | `/proof-requests` | Kanıt İsteklerini listele / oluştur |
| GET / PATCH / POST | `/proof-requests/{request_id}` (GET/PATCH); `/proof-requests/{request_id}/submit` (POST) | İsteği oku / durumunu güncelle / kanıt paylaş |
| GET | `/health`, `/health/live`, `/health/ready` | DB bağlantısı / süreç canlılığı / DB ve migration readiness |

Geliştirme ortamında [Swagger](http://127.0.0.1:8000/docs) ve `/openapi.json` ayrıntılı sözleşmeyi sunar; production’da docs varsayılan kapalıdır. Özel uçlarda rol ve sahiplik kontrolü vardır; discovery/team uçları kurumun kendi ihtiyacına bağlıdır. [Üretilen frontend sözleşmesi](frontend/openapi.json).

Hatalar `error.code`, `message`, `retryable`, `details` alanlarıyla döner. LLM timeout, provider ve validation hataları sırasıyla `LLM_TIMEOUT`, `LLM_PROVIDER_ERROR`, `INVALID_MODEL_OUTPUT` olarak ayrılır.

## Hızlı Başlangıç

Yerel hedef: **Python 3.12**, **Node 22.21.0** (`.python-version`, `.nvmrc`),
**PostgreSQL 18**. Node test runner için minimum 22.13; Next 16.3.8 için minimum
20.9 olduğundan 22.21.0 ikisini de karşılar. macOS 14+ Apple Silicon hedeflenir;
bu Windows ortamında gerçek macOS smoke çalıştırılmadı.

Git clone sonrası repo kökünde çalışın. Root `.env` backend tarafından her yeni
süreçte otomatik okunur; frontend için ayrı `frontend/.env.local` kullanılır.
İki dosya da Git tarafından ignore edilir. Örnekleri yalnız **ilk kurulumda**
kopyalayın; mevcut secret dosyasını ezmeyin. `DATABASE_URL` placeholder'ını yerel
DB'nize göre düzenleyin. Anahtarsız başlangıç için `LLM_PROVIDER=rule_based` seçin.
GitHub App/AI özellikleri için [ayrıntılı güvenli kurulum](docs/GITHUB_ACCOUNT_VERIFICATION.md).
Mevcut `GITHUB_APP_ENCRYPTION_KEY` sabit kalmalıdır; startup anahtar üretmez.

### Local Development — Windows

Python 3.12, Node 22.21.0 ve yerel PostgreSQL 18 kurulmuş olmalıdır.
PostgreSQL'de geliştirme kullanıcınızı ve `zeminai`, `zeminai_test` veritabanlarını
oluşturun (pgAdmin veya aşağıdaki `createuser`/`createdb` komutları kullanılabilir).

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env.local
python -m pip install -r backend/requirements.txt
# .env içindeki DATABASE_URL ve seçilen provider ayarlarını yerel editörde düzenleyin.
cd backend
python -m alembic upgrade head
python -m alembic current
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Ayrı terminal, repo kökü:

```powershell
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1
```

Yeni backend terminalinde yalnız venv'i etkinleştirip `cd backend` ve uvicorn
komutunu tekrarlayın. Aktivasyon policy'si engellerse `..\.venv\Scripts\python.exe`
ile backend komutlarını çalıştırın; sistem execution policy'sini gevşetmeyin.

### Local Development — macOS

[Homebrew PostgreSQL 18](https://formulae.brew.sh/formula/postgresql@18) yolu:

```sh
brew install python@3.12 postgresql@18
brew services start postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
createuser --pwprompt zeminai_dev
createdb --owner=zeminai_dev zeminai
createdb --owner=zeminai_dev zeminai_test
# Node version manager kuruluysa repo kökünde:
nvm install
nvm use
python3.12 -m venv .venv
source .venv/bin/activate
cp .env.example .env
cp frontend/.env.example frontend/.env.local
python -m pip install -r backend/requirements.txt
# .env DATABASE_URL: postgresql+psycopg://zeminai_dev:<URL-encoded-password>@127.0.0.1:5432/zeminai
cd backend
python -m alembic upgrade head
python -m alembic current
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Node version manager yoksa Node 22.21.0 kurup `node --version` doğrulayın.
Ayrı zsh terminalinde repo kökünden `nvm use`, `cd frontend`, `npm ci`,
`npm run dev -- --hostname 127.0.0.1` çalıştırın. Sonraki backend terminalinde
`source .venv/bin/activate`, `cd backend`, yukarıdaki uvicorn komutu yeterlidir.
`.env` dosyalarını her terminalde yeniden kopyalamayın. Parolayı shell history'ye
yazmayın; `createuser --pwprompt` yerel olarak sorar.

Apple Silicon'da native ARM64 Python/Node kullanın; Windows venv veya node_modules
klasörünü taşımayın. Python binary wheel çözümlemesi ayrı kontrol edilir; bu gerçek
macOS kurulumu/çalıştırması değildir. [cryptography platformları](https://cryptography.io/en/50.0.2/installation/),
[psycopg binary dosyaları](https://pypi.org/project/psycopg-binary/3.2.9/).
Mevcut `docker-compose.yml` eski PostgreSQL 16 demo alternatifidir; PG18 doğrulaması
yerine geçmez. Mevcut DB volume'unun major sürümünü yerinde değiştirmeyin.

### Yerel origin, test DB ve kalite kontrolü

Frontend **http://127.0.0.1:3000**, backend **http://127.0.0.1:8000**,
GitHub callback **http://127.0.0.1:8000/github/callback**. `localhost` ile karıştırmayın.
Yerel HTTP `.env`: `SESSION_COOKIE_SECURE=false`; production HTTPS/Secure şartları değişmez.
Migration mevcut head'e (şu anda `a18_analysis_diagnostics`) ulaşmalıdır. Kod/config
veya encryption key dosyası değişikliklerinden sonra backend/embedded worker'ları yeniden başlatın.
`--reload` geliştirmede isteğe bağlıdır; worker restart/deadline davranışı için
[analiz yaşam döngüsü](docs/PROJECT_LIFECYCLE.md).

Backend dizininde `python -m pytest -q -p no:cacheprovider`,
`python -m compileall -q app tests migrations scripts`, `python -m pip check`,
`python -m alembic check` çalışır. Gerçek PostgreSQL için yalnız test DB sahibinin
bağlantısını ignored `work/pg-test.env` içine `TEST_DATABASE_URL=...` olarak kaydedin.
Repo kökünden `python backend/scripts/test_postgres.py` çalıştırın. Test fixture'ı
rastgele izole şemalar oluşturur, head'e migrate eder ve yalnız kendi şemalarını
siler; production DB kullanmayın. URL/parola komut satırına veya rapora yazılmaz.

Frontend dizininde `npm test`, `npm run lint`, `npm run build`. `.env.local` içindeki
`ZEMINAI_ENV=development` yerel build'i açıkça tanımlar; production build için gerçek
HTTPS `API_BACKEND_URL`, `FRONTEND_ORIGIN`, `ZEMINAI_ENV=production` gerekir.

Dependency hardening ile FastAPI **0.142.2**, transitif Starlette **1.7.0** ve
pytest **9.0.3** temiz Python 3.12 ortamında doğrulandı. Starlette doğrudan pinlenmez.
Tercihen yukarıdaki gibi temiz venv kullanın. Mevcut venv güncelleniyorsa
`python -m pip install --upgrade --upgrade-strategy eager -r backend/requirements.txt`
komutunu repo kökünden çalıştırın. Kurulumdan sonra doğrulayın:

```bash
python -c "import fastapi, starlette; from packaging.version import Version; print(fastapi.__version__, starlette.__version__); assert Version(starlette.__version__) >= Version('1.3.1')"
```

### Web arayüzünü başlatma

Backend açıkken ayrı terminalde `frontend/` dizinine geçin. Node.js 22.13+ kullanın ve
`.env.example` dosyasını `.env.local` olarak kopyalayın. Frontend ayarı:

```env
ZEMINAI_ENV=development
API_BACKEND_URL=http://127.0.0.1:8000
```

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

[Web uygulamasını](http://127.0.0.1:3000) açıp hesap oluşturun. Profil, keşif, eşleşme ve Kanıt İstekleri gerçek API’yi kullanır. Yerel HTTP için `SESSION_COOKIE_SECURE=false` gerekir; production HTTPS ayarında `true` korunur. Tarayıcı same-origin `/api` proxy’sini kullanır; oturum token’ı localStorage’da tutulmaz.
Frontend key içermez; Gemini/OpenAI anahtarları backend’de kalır. Kalite kontrolü için `npm run lint`,
`npm test` ve `npm run build` kullanılır. Jüri demosunu geliştirme göstergesi olmadan,
yalnız yerel arayüzde çalıştırmak için:

```bash
npm run build
npm run start -- --hostname 127.0.0.1
```

Production build modu, uygulamanın production güvenliğine hazır olduğu anlamına gelmez.

### Environment ayarları

`.env` repo kökünden otomatik okunur; process environment değişkenleri önceliklidir. Aşağıdaki değerler [.env.example](.env.example) ile uyumludur.

| Değişken | Örnek / kullanım |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://zeminai_dev:REPLACE_LOCALLY@127.0.0.1:5432/zeminai`; yerel PostgreSQL placeholder'ı |
| `CORS_ORIGINS` | `["http://127.0.0.1:3000"]`; izin verilen frontend origin’leri |
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

**10 Ekim 2026 — commit öncesi stabilizasyon doğrulaması:**

- **SQLite full backend: 506 PASS**; **gerçek PostgreSQL 18 full backend: 506 PASS**.
- **Frontend: 91 PASS**; lint ve production build başarılı.
- PostgreSQL migration `a18_analysis_diagnostics` head; Alembic current/check başarılı.
- `compileall`, `pip check`, OpenAPI/types drift ve `git diff --check`: başarılı.

Backend'de tek Starlette TestClient/httpx deprecation uyarısı vardır; test başarısızlığı değildir. Sentetik browser QA, gerçek PostgreSQL testleri ve canlı provider doğrulaması birbirinden ayrıdır. [Kapsam ve sınırlar](docs/VALIDATION.md). Bu dokümantasyon turunda ürün kodu değişmedi; önceki stabilizasyon sonuçları korunur, yeni npm audit sonucu iddia edilmez.

Regresyon kapsamı; auth/ownership/CSRF, kalıcı bütçeler, matching/evidence sınırları, frozen trace, provider hata/grounding kontrolleri, migration’lar ve Team Complements’ın deterministik sırası, anonimliği, tam havuz sınırı ve sabit sorgu davranışını içerir. Otomatik testler gerçek API anahtarı veya internet gerektirmez.

Etkin sanal ortamla `backend/` içinde:

```bash
python -m pytest -q
python -m compileall -q app tests migrations scripts
python -m pip check
python -m alembic check
```

`alembic check` migrate edilmiş, erişilebilir geliştirme DB'si gerektirir. PostgreSQL suite'i için ayrı test DB bağlantısını ignored `work/pg-test.env` içine `TEST_DATABASE_URL=...` olarak kaydedin; repo kökünden `python backend/scripts/test_postgres.py` çalıştırın. Fixture'lar kendi rastgele izole şemalarını oluşturur, migrate eder ve temizler; üretim DB'sini kullanmayın.

İsteğe bağlı canlı test: `python scripts/smoke_llm.py`. Seçilen provider’ın key/model ayarı yoksa `SKIPPED` döner; varsa iki gerçek API çağrısı yapar ve ücret doğurabilir. Docker Compose başlatma bu doğrulama ortamında çalıştırılmadı; DB kontrollerinde yerel PostgreSQL kullanıldı.

## Güvenlik ve Güvenilirlik İlkeleri

Production odaklı hardening uygulanmıştır; gerçek production deployment doğrulaması tamamlanmış değildir. Uygulanan kontroller:

- Aday/kurum rolleri ve ownership; oturumsuz erişimde 401, yanlış rolde 403, bulunmayan veya sahip olunmayan kayıtta 404.
- Rastgele opaque session token; DB’de yalnız hash’i tutulur. Cookie `HttpOnly`, `SameSite=Lax`; production yapılandırmasında `Secure=true`.
- İzinli origin ile tam eşleşen Origin/Referer CSRF kontrolü ve same-origin proxy. CORS authentication değildir.
- AI ve compute için kullanıcı + IP bazlı, DB-backed kalıcı/atomik fixed-window bütçeleri; 429/Retry-After ve DB hatasında fail-closed reddetme.
- Açık development/test/production davranışı, güvensiz production ayarında fail-fast; trusted-host ve security-header kontrolleri.
- `/health/live`, DB/migration kontrollü `/health/ready`, kontrollü DB pooling/timeouts; request ID ve hassas içerik taşımayan loglar.

Bu bütçeler **in-flight/global concurrency limiti veya global provider harcama tavanı değildir**. Gerçek HTTPS/ingress/reverse-proxy/cookie smoke, secret manager, DB TLS, backup/restore doğrulaması, provider harcama/global concurrency sınırları, monitoring/alerting ve dependency advisory süreci deployment/operasyon işleri olarak açıktır. E-posta doğrulama, parola kurtarma ve daha kapsamlı session/device yaşam döngüsü de henüz yoktur.

[Auth modeli](docs/AUTH.md) · [Güvenlik değerlendirmesi](docs/SECURITY_REVIEW.md) · [Deployment rehberi](docs/DEPLOYMENT.md) · [Production doğrulama kaydı](docs/PRODUCTION_READINESS.md)

İstek gövdeleri JSON parse öncesinde 1 MiB ile sınırlıdır; aşımda
`413 / PAYLOAD_TOO_LARGE` standart hata cevabı döner.

- Repository metni sistem talimatı değil, güvenilmeyen veri olarak gönderilir; dosyalardaki talimatları izlememesi modele açıkça söylenir. Bu, prompt injection’a karşı mutlak garanti değildir.
- Structured output strict Pydantic ile doğrulanır. Uydurulan path, gönderilmeyen alıntı ve kaynakta desteklenmeyen beceri reddedilir; kaynak URL’leri backend tarafından belirlenir.
- GitHub okuyucusu yalnız public repository kabul eder; en fazla 30 dosya, dosya başına 100 KB ve toplam 1 MB içerik alır. LLM bağlamında dosya alıntıları ayrıca sınırlandırılır; tüm repository’nin analiz edildiği iddia edilmez.
- GitHub dil metadatası güncel repository durumudur; dosyalar gibi commit anına sabitlenmez.
- `.env` ignore edilir; örnek key alanları boştur. Provider ham hata gövdeleri ve hassas header’lar API hata cevabına konmaz.
- Kalıcı analiz job'ları deadline ile sınırlandırılır; worker/DB yeniden erişilebilir olduğunda süresi aşılmış işlerin durumu uzlaştırılır. Bu, kesintisiz çalışma veya anında failover garantisi değildir. [Restart/retry davranışı](docs/PROJECT_LIFECYCLE.md).

## Bilinen Sınırlar

- Public kaynak okuması dosya/süre/boyut sınırları içerir; tüm repository veya private kaynak analiz edilmez.
- Dil metadatası, README ve profil beyanı tek başına observed teknik kanıt değildir; GitHub erişimi yazarlık değildir.
- Keşif tam havuzu 100 aktif adayla sınırlıdır; daha büyük üretim ölçeği ayrıca tasarlanmalıdır.
- Provider kota/maliyet/ağ hataları mümkündür. Sahte başarı veya sessiz fallback yoktur.
- macOS için kurulum ve wheel taşınabilirliği kontrol edildi; gerçek macOS smoke yapılmadı.
- Gerçek HTTPS/proxy/cookie deployment smoke ve yukarıdaki operasyon işleri açıktır. Production güvenliği garantisi verilmez.

## Mevcut Durum

### Uygulananlar

- GitHub teknik kanıtı ve çok kaynaklı profil kayıtları; Yaşayan Profil, zaman çizelgesi, factual Yetenek Haritası ve Kanıt Pasaportu.
- İhtiyaca özgü deterministik Kanıt Uyumu, “Nasıl hesaplandı?”, frozen Evidence Trace ve kanıt boşlukları.
- Candidate Discovery, kanıt odaklı inceleme, Takım oluşturucu, Takım Tamamlayıcıları ve Kanıt İsteği.
- DB tabanlı auth/ownership ve güvenlik hardening’i; gerçek API kullanan responsive TR/EN arayüz.

### Sonraki Adımlar

Bunlar mevcut özellikler değil, geliştirme/operasyon öncelikleridir:

- GitHub katkı metrikleri; mevcut hesap/erişim doğrulamasından ayrı, bireysel yazarlığı varsaymadan.
- Süre sonu, iptal ve frozen snapshot içeren seçici paylaşılabilir Kanıt Pasaportu.
- İhtiyaç netleştirme soruları, hafif eşleşme yaşam döngüsü ve tanıştırma sonrası takip; sonuç/referans geri bildirim döngüsü.
- Dağıtık worker ölçekleme, global provider concurrency/spend sınırları ve sürekli senkronizasyon; model kalite değerlendirmeleri. Kalıcı proje analiz kuyruğu ve deadline recovery için [yaşam döngüsü notları](docs/PROJECT_LIFECYCLE.md).
- Gerçek deployment doğrulaması ve yukarıdaki operasyon kontrolleri; e-posta doğrulama, parola kurtarma ve session/device yaşam döngüsü.

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
  scripts/                 Preflight, canlı smoke ve izole PostgreSQL test launcher
frontend/                  Next.js App Router, API client ve arayüz testleri
scripts/                   Windows demo preflight yardımcısı
docs/                      Rehberler, sözleşmeler ve tarihli doğrulamalar; docs/README.md
docker-compose.yml         Eski yerel PostgreSQL 16 alternatifi
.env.example               Secretsız demo ayarları
.python-version / .nvmrc    Python ve Node geliştirme sürümleri
CONTRIBUTING.md             Katkı, test ve güvenli paylaşım kuralları
LICENSE                    MIT License
```

[Orijinal ürün vizyonu](docs/VISION.md) daha geniş hedefleri içerir; mevcut uygulama kapsamı bu README’de açıklanır.

## Lisans

ZeminAI kaynak kodu **[MIT License](LICENSE)** ile sunulur. Üçüncü taraf bağımlılıklar kendi lisanslarına tabidir.

## Ekip

- **Ahmet Çağdaş Geçgül** — AI, matching ve teknik koordinasyon.
- **Yiğit Alp Ünal** — Backend, veritabanı ve entegrasyon.
- **Azra Gülbahar** — Ürün, UX, veri ve kalite.
