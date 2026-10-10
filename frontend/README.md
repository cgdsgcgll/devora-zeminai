# ZeminAI Frontend

Next.js 16.3.8, React 19.3 ve TypeScript App Router ile gerçek FastAPI servislerini kullanan demo arayüzü. Hafif CSS, React Context ve merkezi API client kullanılır; sahte analiz veya eşleşme sonucu yoktur.

## Çalıştırma

Node.js 22.21.0 (`../.nvmrc`) ve npm kullanın. Önce ana README'deki Windows/macOS backend kurulumunu tamamlayın ve API'yi `http://127.0.0.1:8000` üzerinde başlatın.

`frontend/` içinde `.env.example` dosyasını yalnız ilk kurulumda `.env.local` adıyla kopyalayın (PowerShell: `Copy-Item .env.example .env.local`; Linux/macOS: `cp .env.example .env.local`). Mevcut dosyayı ezmeyin.

```env
ZEMINAI_ENV=development
API_BACKEND_URL=http://127.0.0.1:8000
```

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

[Uygulamayı açın](http://127.0.0.1:3000). `NEXT_PUBLIC_*` değerleri tarayıcıya açıktır ve build sırasında yerleştirilir; API key veya başka secret eklemeyin. Anahtarlar yalnız backend environment’ında kalır.

Yerel `CORS_ORIGINS` JSON listesinde `http://127.0.0.1:3000` kullanın; `localhost` ile karıştırmayın. Yerel HTTP backend ayarı `SESSION_COOKIE_SECURE=false`; production HTTPS güvenli varsayılanı korunur. Port değişirse origin ayarlarını açıkça güncelleyin; wildcard kullanmayın.

## Akış

| Route | İşlev |
|---|---|
| `/` | Projenin yaklaşımı ve hesap başlangıcı |
| `/giris` | Cookie oturumu ile giriş |
| `/kayit` | Aday/kurum hesabı oluşturma |
| `/aday` | Aday/proje oluşturma, public GitHub analizi ve kaynaklı evidence |
| `/ihtiyac` | İhtiyaç oluşturma, required/preferred kriterler |
| `/eslesme` | Dondurulmuş Evidence Trace, kanıt odaklı inceleme ve kanıt isteği |
| `/profil` | Yaşayan profil, zaman çizelgesi ve kanıt pasaportu |
| `/kesif` | Need kapsamındaki keşif ve 2–4 adayla takım matrisi |
| `/kanit-istekleri` | Role ve sahipliğe göre özel gelen kutusu |

Candidate ve project adımları ayrı kaydedilir; proje isteği hata verirse aday yeniden oluşturulmaz. İhtiyaçtaki “Örnekle başla” yalnız sentetik input doldurur. Form submit’leri gerçek endpoint’lere gider. İşlemler sırasında tekrar submit engellenir; sahte yüzde veya aşama ilerlemesi gösterilmez.

## Sözleşme ve kod düzeni

- `openapi.json`: FastAPI uygulamasından dışa aktarılan sözleşme.
- `src/lib/api/schema.d.ts`: `openapi-typescript` tarafından üretilen tipler; elle düzenlenmez.
- `src/lib/api/client.ts`: API çağrıları, backend error envelope ve ağ hataları.
- `src/components/session.tsx`: Cookie hesabı bootstrap, rol ve sahip olunan DB kayıtlarını yeniden yükleme.
- `src/components/`: Ortak shell, kanıt/kriter kartları ve eşleşme sunumu.
- `src/app/`: Route’lar, genel CSS, 404 ve hata sayfası.

Sözleşme güncellenince repo kökünde backend sanal ortamının Python’uyla:

```bash
python frontend/scripts/export_openapi.py
cd frontend
npm run types:generate
```

Pydantic’in varsayılan UUID alanları OpenAPI’de optional görünür. Persist edilmiş yanıtlarda ID varlığı API client’ta kontrol edilir ve tipler buna göre daraltılır.

## Oturum

HttpOnly cookie `/api` proxy’si üzerinden gönderilir. SessionProvider `/auth/me` ile hesabı yükler; token veya demo ID’leri tarayıcı depolamasında tutulmaz. Reload/login sonrasında kendi son proje/ihtiyaç kaydı API’den yüklenir. `/giris` ve `/kayit` hesap akışlarıdır.

## Kalite kontrolleri

```bash
npm run lint
npm test
npm run build
npm run start -- --hostname 127.0.0.1
```

`npm test` Node’un yerleşik test runner’ıyla API hata ayrıştırma, label semantiği, form validation ve güvenli kaynak linklerini sınar. Ağ veya canlı AI gerekmez. `npm run format` kaynak dosyalarını Prettier ile biçimlendirir.

10 Ekim stabilizasyonunda backend SQLite ve PostgreSQL'de ayrı ayrı 506, frontend'de 91 test geçti; lint/build başarılı. Sentetik tarayıcı QA'sı gerçek OAuth/provider smoke değildir. Güncel kapsam [VALIDATION](../docs/VALIDATION.md), önceki fazın tarihsel kaydı [FRONTEND_VALIDATION](../docs/FRONTEND_VALIDATION.md) içindedir.

Cookie authentication ve aday/kurum ownership uygulanır. Deployment hardening mevcuttur; gerçek HTTPS ingress/cookie smoke ve operasyonel sınırlar için [deployment kaydına](../docs/PRODUCTION_READINESS.md) bakın. [AUTH](../docs/AUTH.md).

## Demo sunumu ve güvenlik

Jüri demosunda `npm run build` ardından `npm run start -- --hostname 127.0.0.1`
kullanın. Production modunda Next.js development göstergesi yoktur. Arayüz
150–260 ms native CSS geçişleri kullanır; `prefers-reduced-motion: reduce`
giriş/spinner animasyonlarını ve buton hareketlerini kapatır, odak ve aktif
sayfa işaretlerini korur. Mobil aksiyonlar hover gerektirmez.

Yanıtlarda nosniff, referrer/permissions policy ve iframe koruması vardır.
Bu başlıklar backend yetkilendirmesi sağlamaz. API yalnız kontrollü yerel demo
verisiyle kullanılmalıdır; [güvenlik raporundaki](../docs/SECURITY_REVIEW.md)
AI quota ve deployment riskleri public deployment öncesi çözülmelidir.

## TR / EN ve kanıt araçları

`src/i18n/tr.ts` ana anahtar sözleşmesidir; `en.ts` aynı anahtarları TypeScript ile zorunlu tutar. Varsayılan TR, `zeminai.locale` tercihi localStorage'da saklanır. `useSyncExternalStore` ile seçili dil tüm istemci bileşenlerine yayılır; `html.lang` güncellenir. Dil kütüphanesi veya yeni dependency yoktur. İngilizce tercihi olan tarayıcıda ilk Türkçe görünüm hydration tamamlanana kadar gizlenir; storage kullanılamıyorsa TR çalışır. Bu MVP JavaScript gerektirir; sunucu tarafında locale routing/SEO uygulanmaz.

`t(key)` statik arayüz metinleri içindir. `tx` yalnız sabit eski arayüz etiketleri ve bilinen sistem notlarını eşler; kullanıcı başlığı, açıklaması, alıntısı veya kurum notuna uygulanmaz. Hatalar backend mesajından değil `error.code`/HTTP durumundan çevrilir. Bilinmeyen hata güvenli genel mesaj verir; 403/404/409/422/429/503 oturumu silmez.

Kanıt zinciri tek match yanıtından okunur; kriter başına evidence HTTP isteği yoktur. Kör yanıt kaynak metni/URL'yi sunucuda çıkarır. Team seçimi 2–4 aday için mevcut union coverage endpoint'ini çağırır, eski yanıtlar seçim anahtarıyla gizlenir. Gönderim formu proje/profil/HTTPS kaynaklarından yalnız birini bağlar. [İş akışı ve test kaydı](../docs/PROOF_REQUESTS.md).
