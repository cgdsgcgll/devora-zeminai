# ZeminAI Frontend

Next.js 16.3.8, React 19.3 ve TypeScript App Router ile gerçek FastAPI servislerini kullanan demo arayüzü. Hafif CSS, React Context ve merkezi API client kullanılır; sahte analiz veya eşleşme sonucu yoktur.

## Çalıştırma

Node.js 22.13+ ve npm gerekir. Önce ana README’deki backend kurulumunu tamamlayın ve API’yi `http://127.0.0.1:8000` üzerinde başlatın.

`frontend/` içinde `.env.example` dosyasını `.env.local` adıyla kopyalayın (PowerShell: `Copy-Item .env.example .env.local`; Linux/macOS: `cp .env.example .env.local`).

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

```bash
npm install
npm run dev
```

[Uygulamayı açın](http://localhost:3000). `NEXT_PUBLIC_*` değerleri tarayıcıya açıktır ve build sırasında yerleştirilir; API key veya başka secret eklemeyin. Anahtarlar yalnız backend environment’ında kalır.

Backend `CORS_ORIGINS` JSON listesi varsayılan olarak `http://localhost:3000` ve `http://127.0.0.1:3000` adreslerini kabul eder. Farklı bir frontend portu kullanırsanız bu listeyi backend tarafında güncelleyin; wildcard kullanmayın.

## Akış

| Route | İşlev |
|---|---|
| `/` | Projenin yaklaşımı ve demo başlangıcı |
| `/aday` | Aday/proje oluşturma, public GitHub analizi ve kaynaklı evidence |
| `/ihtiyac` | İhtiyaç oluşturma, required/preferred kriterler |
| `/eslesme` | Gerçek eşleşme, kapsam, matched/unmatched kriterler ve evidence |

Candidate ve project adımları ayrı kaydedilir; proje isteği hata verirse aday yeniden oluşturulmaz. İhtiyaçtaki “Demo verisini doldur” yalnız sentetik input doldurur. Form submit’leri gerçek endpoint’lere gider. İşlemler sırasında tekrar submit engellenir; sahte yüzde veya aşama ilerlemesi gösterilmez.

## Sözleşme ve kod düzeni

- `openapi.json`: FastAPI uygulamasından dışa aktarılan sözleşme.
- `src/lib/api/schema.d.ts`: `openapi-typescript` tarafından üretilen tipler; elle düzenlenmez.
- `src/lib/api/client.ts`: API çağrıları, backend error envelope ve ağ hataları.
- `src/components/session.tsx`: Demo oturumu ve ID’lerden backend kayıtlarını yeniden yükleme.
- `src/components/`: Ortak shell, kanıt/kriter kartları ve eşleşme sunumu.
- `src/app/`: Route’lar, genel CSS, 404 ve hata sayfası.

Sözleşme güncellenince repo kökünde backend sanal ortamının Python’uyla:

```bash
python frontend/scripts/export_openapi.py
cd frontend
npm run types:generate
```

Pydantic’in varsayılan UUID alanları OpenAPI’de optional görünür. Persist edilmiş yanıtlarda ID varlığı API client’ta kontrol edilir ve tipler buna göre daraltılır.

## Oturum ve güven sınırları

Yalnız candidate/project/need/match/run/evidence ID’leri localStorage’da saklanır; açıklamalar, kaynak dosyaları ve API key’ler saklanmaz. Refresh tamamlanan kayıtları backend’den tekrar okur. “Yeni demo” yalnız tarayıcı seçimini temizler, backend verisini silmez. Bu bir giriş veya yetkilendirme mekanizması değildir.

Uzun analiz sırasında sayfayı yenilemeyin: backend bir job/progress API sağlamaz. Yanıt gelmeden bağlantı kesilirse oluşmuş analizi otomatik bulma veya tekrar isteği tekilleştirme garantisi yoktur. Kalıcı backend veritabanı değişirse eski ID’ler yüklenemeyebilir; arayüz yeniden yükleme/yeni demo seçenekleri sunar.

Kaynak linkleri yalnız HTTPS GitHub URL’leri için açılır ve `noopener noreferrer` kullanır. Model metni React’in metin render mekanizmasıyla gösterilir; HTML olarak çalıştırılmaz. Kanıt gücü beceri seviyesi, eşleşme skoru işe alınma ihtimali olarak sunulmaz.

## Kalite kontrolleri

```bash
npm run lint
npm test
npm run build
npm start
```

`npm test` Node’un yerleşik test runner’ıyla API hata ayrıştırma, label semantiği, form validation ve güvenli kaynak linklerini sınar. Ağ veya canlı AI gerekmez. `npm run format` kaynak dosyalarını Prettier ile biçimlendirir.

Backend CORS testleri dahil 135 pytest testi geçmektedir. Canlı Gemini backend smoke testi daha önce ekip tarafından doğrulandı; bu frontend ortamında key/model bulunmadığı için canlı Gemini E2E ayrıca blokludur. Tarayıcı kontrollerinin ayrıntıları [doğrulama kaydında](../docs/FRONTEND_VALIDATION.md) bulunur.

Authentication, çok kullanıcılı oturum yönetimi, deployment ve background jobs bu MVP kapsamında değildir.
