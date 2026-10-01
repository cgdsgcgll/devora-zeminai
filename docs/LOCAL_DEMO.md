# Yerel demo başlangıcı

Uvicorn `startup complete` yalnız uygulamanın açıldığını gösterir. SQLAlchemy bağlantıyı ilk sorguda kurar. `/health` gerçek DB sorgusu yapar; erişim yoksa 503 ve standart `DATABASE_ERROR` döner. Başarısızlıkta SQLite'a geçilmez.

İncelenen clone'da kök `.env` yoktu. Varsayılan örnek bağlantı bilgileri 5432'de çalışan PostgreSQL tarafından **password authentication failed** ile reddedildi. Aday/ihtiyaç POST istekleri 503 verdi. Bağlantı kurulamadığından o veritabanının migration durumu doğrulanamadı. Mevcut PostgreSQL şifresi değiştirilmedi. Açıkça yapılandırılmış ayrı yerel PostgreSQL ile migration ve gerçek GitHub/rule_based akışı doğrulandı.

## Windows / PowerShell

1. Repository kökünde Python virtualenv oluşturun ve backend bağımlılıklarını kurun:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
   ```
2. `.env.example` dosyasını kök `.env` olarak kopyalayın. `DATABASE_URL` gerçek yerel PostgreSQL'inizle eşleşmeli. Compose örneği yalnız yerel demo içindir; başka PostgreSQL 5432'yi kullanıyorsa önce port çakışmasını çözün. Mevcut volume'un şifresi env değiştirince değişmez; volume silmeyin.
3. API key gerektirmeyen demo için `LLM_PROVIDER=rule_based`. Gemini için `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.1-flash-lite`, `LLM_TIMEOUT_SECONDS=120`; anahtarı yalnız yerel ortamınızda ayarlayın. `.env` commit edilmez. Frontend'e key aktarılmaz.
4. Kök dizinde `./scripts/start-demo.ps1` çalıştırın. Docker Compose DB'yi başlatır, hazır olmasını bekler, `alembic upgrade head` uygular ve bağlantı/migration head kontrolü yapar. Başarısız adımda durur.
   Mevcut PostgreSQL kullanıyorsanız `./scripts/start-demo.ps1 -UseExistingPostgres`. Başka virtualenv için `-Python <python.exe yolu>` verin. Script hiçbir parolayı değiştirmez, DB oluşturmaz ve sunucuları arka planda başlatmaz.
5. Aynı ortam değişkenleriyle `backend/` içinde `../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000` çalıştırın.
6. `Invoke-RestMethod http://127.0.0.1:8000/health`: HTTP 200 ve `database=ok` olmalı. Ayrı kontrol: `python scripts/demo_preflight.py` migration head'i de doğrular.
7. İkinci terminalde `frontend/`: `npm.cmd ci`, `npm.cmd run build`, `npm.cmd start`. Frontend API adresi `NEXT_PUBLIC_API_BASE_URL`; varsayılan `http://127.0.0.1:8000`. Özel adres build sırasında ayarlanmalıdır.

`DATABASE_URL` process environment değeri `.env` değerini geçersiz kılar. Kök `.env` mutlak dosya yolu ile okunur; backend çalışma dizini değişse de başka `.env` seçilmez. CORS için frontend origin'ini backend `CORS_ORIGINS` listesine açıkça ekleyin.

Auth/authorization ve rate limiting bulunmadığından demo yalnız kontrollü, yerel ortam içindir.

## Profil ve eşleşme demosu

Aday oluşturun; isteğe bağlı GitHub projesi ekleyip analiz edin. Gelişim ve Deneyim bölümünden eğitim, sertifika, hackathon, etkinlik veya topluluk kaydı oluşturun. Link olmadan “Beyan”, HTTPS linkiyle “Kaynak bağlantısı mevcut” görünür; bu provider doğrulaması değildir.

Örnek ihtiyaç: `Python gerekli; hackathon deneyimi tercih edilir; topluluk deneyimi tercih edilir`. Teknik kriter yalnız observed proje kanıtıyla karşılanır. Teknik kanıt yoksa profil kayıtları Python puanını yükseltmez. Profil değişikliğinden sonra “Eşleşmeyi Yenile” kullanın; eski sonuç kayıt kopyasını korur. “Demoyu sıfırla” yalnız tarayıcının seçimini temizler, backend verilerini silmez.

Anonim GitHub kotası dolarsa gerçek analiz kontrollü hata verir. Tekrar tekrar denemeyin; kota yenilenmesini bekleyin veya yetkili operatör kendi yerel `GITHUB_TOKEN` ayarını kullanabilir. Token'ı arayüze, loga veya commit'e yazmayın. Gemini anahtarı yoksa canlı test `BLOCKED_BY_MISSING_KEY`; rule_based modu anahtarsız çalışır.

3000 meşgulse production frontend `npm.cmd start -- --hostname 127.0.0.1 --port 3001` ile açılabilir. Backend'i başlatan terminalde `CORS_ORIGINS` içine yalnız gerekli local origin'i açıkça koyun; örnek PowerShell: `$env:CORS_ORIGINS='["http://127.0.0.1:3001"]'`. CORS değişikliği backend restart gerektirir. Eski sürecin yeni kodu çalıştırdığını varsaymayın.
