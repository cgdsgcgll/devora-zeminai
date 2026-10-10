# Katkıda bulunma

ZeminAI, [MIT License](LICENSE) ile sunulur. Küçük, tek amaçlı değişiklikler ve
tekrarlanabilir hata raporları tercih edilir.

1. [README](README.md#hızlı-başlangıç) üzerinden Python 3.12, Node 22.21.0 ve
   PostgreSQL 18 ortamını kurun. Windows/macOS adımlarını izleyin; env dosyalarını
   yalnız ilk kurulumda kopyalayın.
2. Güncel `main` üzerinden açıklayıcı bir branch açın. Sorunu, beklenen davranışı
   ve kapsamı issue/PR açıklamasında belirtin. İlgisiz refactor eklemeyin.
3. Davranış değişikliğine regresyon testi ekleyin. Backend içinde
   `python -m pytest -q -p no:cacheprovider`,
   `python -m compileall -q app tests migrations scripts`, `python -m pip check`
   çalıştırın. Erişilebilir migrate edilmiş geliştirme DB'sinde
   `python -m alembic check`; izole PostgreSQL testi için repo kökünden
   `python backend/scripts/test_postgres.py` kullanın. Üretim DB'sini kullanmayın.
4. Frontend değiştiyse `frontend/` içinde `npm ci`, `npm test`, `npm run lint`,
   `npm run build` çalıştırın. API sözleşmesi değiştiyse repo kökünden
   `python frontend/scripts/export_openapi.py`, sonra frontend içinde
   `npm run types:generate` çalıştırın; üretilen tipleri elle düzenlemeyin.
5. `git diff --check` ve `git diff --cached` ile gönderilecek kapsamı inceleyin.
   PR'da neyin değiştiğini, test sonuçlarını ve çalıştırılamayan kontrolleri yazın.

## Korunacak kurallar

- Dil metadatası/README beyanı tek başına observed teknik kanıt değildir.
  LLM final skoru vermez; erişim doğrulaması yazarlık veya uzmanlık doğrulamaz.
- Auth/ownership, kaynak sınırları ve frozen Match/Evidence Trace korunmalıdır.
- Gerçek token, parola, encryption key, kullanıcı verisi veya ham provider
  yanıtını issue/PR/test fixture'ına koymayın. `.env`, venv, DB, ekran görüntüsü
  ve geçici çalışma raporları ignored `work/` altında kalmalıdır.
- Güvenlik açığına ait secret veya istismar ayrıntılarını public issue'ya yazmayın;
  maintainer ile özel bir bildirim kanalı belirleyin.
- Harici kaynaklardan alınan kodun lisansını ve atıf gereksinimlerini koruyun.
