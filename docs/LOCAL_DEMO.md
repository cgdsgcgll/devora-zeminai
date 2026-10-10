# Yerel demo

Windows ve macOS için güncel ilk kurulum [README](../README.md#hızlı-başlangıç)
içindedir. Python 3.12, Node 22.21.0, PostgreSQL 18 ve tek origin kullanın:
frontend `http://127.0.0.1:3000`, backend `http://127.0.0.1:8000`, GitHub callback
`http://127.0.0.1:8000/github/callback`.

## Windows preflight yardımcısı

İlk kurulumu ve yerel DB oluşturmayı tamamladıktan sonra repo kökünde:

```powershell
./scripts/start-demo.ps1 -UseExistingPostgres
```

Script `.venv/Scripts/python.exe` kullanır; başka venv için `-Python <python.exe>`
verilebilir. Migration uygular, DB bağlantısı/head kontrol eder; kullanıcı veya DB
oluşturmaz, parolayı değiştirmez, uygulama sunucularını başlatmaz. Bayraksız kullanım
eski PostgreSQL 16 Docker Compose alternatifini başlatır; PG18 doğrulaması değildir.
Mevcut volume'u silmeyin veya major sürümünü yerinde değiştirmeyin.

## Demo sunumu

1. Root `.env` dosyasını yalnız ilk kurulumda oluşturun. Yerel PostgreSQL bağlantısını
   düzenleyin; HTTP için `SESSION_COOKIE_SECURE=false`,
   `CORS_ORIGINS=["http://127.0.0.1:3000"]` kullanın. Mevcut encryption key sabit kalır.
2. Anahtarsız akış için `LLM_PROVIDER=rule_based`; Gemini seçilecekse key/model yerel
   backend ayarında kalır. Eksik key veya kota hatası sahte başarıya dönüştürülmez.
3. Backend dizininde etkin venv ile
   `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` çalıştırın.
   `/health/ready` DB ve migration hazırlığını doğrulamalıdır; yalnız startup mesajı yeterli değildir.
4. Frontend env örneğini ilk kurulumda `.env.local` olarak kopyalayın.
   `ZEMINAI_ENV=development`, `API_BACKEND_URL=http://127.0.0.1:8000` korunur.
   Frontend dizininde `npm ci`, `npm run build`,
   `npm run start -- --hostname 127.0.0.1` çalıştırın.
5. Ayrı aday/kurum hesapları oluşturun. Adaya public proje ve/veya profil beyanı
   ekleyin; GitHub App bağlantısı isteğe bağlı ve kurulumu ayrı adımdır.
   İçe aktarılan projeler hemen görünür; analiz durumları ve hataları proje bazındadır.
6. Kurumda açık kriterli bir ihtiyaç oluşturun; eşleşme, Evidence Trace ve boşlukları
   gösterin. Profil beyanı teknik kriteri karşılamaz. Kanıt İsteği kapatmak doğrulama değildir.

`DATABASE_URL` process environment değeri root `.env` değerinden önceliklidir.
Origin/port veya kod/config değişirse ilgili sunucuyu yeniden başlatın. Port
değişikliği CORS ve OAuth callback ayarlarıyla tutarlı olmalıdır; kolay demo için
3000/8000'i koruyun. Production HTTPS ayarında Secure=true ve deployment kontrolleri
ayrıdır; yerel build production güvenliği onayı değildir.

Güncel otomatik/sentetik QA sonuçları ve gerçek provider ayrımı:
[VALIDATION](VALIDATION.md). Operasyonel sınırlar: [DEPLOYMENT](DEPLOYMENT.md).
