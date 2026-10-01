# Geliştirme geçmişi

Bu kayıtlar önceki README’den taşınmıştır; teslim anındaki durumu anlatır.
Test sayıları, canlı doğrulama ve Git işlem notları güncel durum beyanı değildir.
Güncel kurulum ve davranış için [README](../README.md) esas alınmalıdır.

## İlk teslim doğrulama kaydı (v0.1, tarihsel)

Bu teslimde 45 test SQLite üzerinde, aynı 45 test ayrı PostgreSQL 18.6 test kümesinde geçti.
PostgreSQL üzerinde `alembic upgrade head`, `downgrade base`, tekrar `upgrade head` ve `alembic check` başarılı oldu.
Gerçek GitHub okuma denemesinde başlangıç deposunun README'si alındı; teknolojiler yalnızca `declared_only` çıktı.
Uvicorn gerçek HTTP sunucusunda `/health`, aday/proje/ihtiyaç kaydı, canlı GitHub analizi, match kaydı/okuması ve
`/openapi.json` doğrulandı. README-only repo için skor 0 olarak PostgreSQL'e kaydedildi.
`compileall`, FastAPI import/OpenAPI üretimi, `pip check` ve `git diff --check` başarılı oldu.
Starlette/AnyIO bağımlılığından bir deprecation uyarısı vardır; test başarısızlığı yoktur.
Docker bu makinede bulunmadığı için `docker compose up -d` burada çalıştırılmadı.
Paket sunucusuna erişim sorunu nedeniyle test ortamının bağımlılıkları geçici PyPI aynası üzerinden kuruldu;
projede kalıcı index/mirror ayarı yapılmadı.

## İkinci tur doğrulama kaydı (v0.2)

Önceki 45 test başlangıçta tekrar geçti. Yeni toplam 96 test SQLite ve PostgreSQL 18.6 üzerinde ayrı ayrı geçti.
Migration upgrade/downgrade/upgrade/check başarılı; eski kayıtların korunması ayrıca test edildi.
OpenAI istek gövdesi, structured output, malformed output, timeout, retry, provider/config hataları mock HTTP ile test edildi.
Gerçek LLM key/model bulunmadığı için manuel smoke script `SKIPPED` döndü; canlı OpenAI başarısı iddia edilmiyor.
Yeni bağımlılık eklenmedi; önceki Python 3.12 sanal ortamı doğrulamada yeniden kullanıldı.
Bu sandbox'ta pytest geçici dizin izinleri nedeniyle `--basetemp=../work/<ayrı-test-dizini>` kullanıldı.
Frontend'e başlanmadı. Değişiklikler yereldir; GitHub'a push yapılmadı.
