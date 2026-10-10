# Güncel doğrulama — 10 Ekim 2026

Bu kayıt `feat/github-account-verification` üzerindeki commit öncesi
stabilizasyon sonuçlarını özetler; production veya gerçek provider sertifikası değildir.

| Kontrol | Sonuç |
|---|---|
| Full backend SQLite | 506 passed, 0 failed; 54.11 s |
| Full backend PostgreSQL 18 | 506 passed, 0 failed; 85.09 s |
| Frontend | 91 passed, 0 failed |
| Lint / production build | PASS |
| compileall / pip check | PASS |
| İzole PostgreSQL Alembic current/check | a18_analysis_diagnostics head; yeni işlem yok |
| OpenAPI / üretilen TypeScript tipleri | Drift yok |
| diff check / bariz secret pattern taraması | PASS / bulgu yok |

Backend'de bir Starlette TestClient/httpx deprecation uyarısı var. İlk PostgreSQL
denemesinde bağlantı timeout'u oldu; bağlantı kontrolünden sonra tam suite geçti.
PostgreSQL fixture'ı yalnız kendi oluşturduğu izole şemaları migrate eder ve temizler.

## Tarayıcı doğrulaması

İzole sentetik aday/veritabanı ile gerçek uygulama ve worker kullanıldı;
GitHub kaynak yanıtları simüle edildi. Boş aday, bağlantısız/kurulumsuz/kurulumlu
GitHub, üçlü ve duplicate import, başarılı/retryable/non-retryable analiz,
proje düzenleme/arşivleme/yeniden import, aktif/terminal durumda refresh,
LinkedIn URL ve pasted profile önizleme/onay, TR/EN, 390px ve klavye çekirdek
akışları doğrulandı. 1280/768/390px'de yatay taşma görülmedi.

Retry yalnız başarısız projeyi etkiledi; analiz hatası proje/provenance kaydını
silmedi. Aktif analiz tekrar başlatılamadı. Profil kaydı silme özeti yeniledi;
geçersiz/silinmiş seçili proje kanıtı session'da bırakılmadı. Terminal polling
durması ve geç gelen yanıtların iptali otomatik regresyonlarla da kontrol edildi.

## Doğrulamanın sınırları

- Gerçek OAuth/GitHub/Gemini ve üç canlı C++ repository akışı bu sentetik QA'nın
  sonucu olarak iddia edilmez. Eski canlı smoke sonuçları tarihsel kayıttır.
- Windows'ta geliştirme/test/build çalıştırıldı. macOS ARM64/Python 3.12 binary
  wheel çözümlemesi ve belgelenen POSIX uyumlu shell bloğunda `bash -n` geçti.
  **macOS prepared/portability-checked, not manually smoke-tested on macOS.**
- Gerçek HTTPS ingress/proxy/cookie smoke, operasyonel secret yönetimi,
  backup/restore ve provider global bütçeleri ayrıca doğrulanmalıdır.
- Tam screen-reader/browser uyumluluğu veya model kalite garantisi verilmez.
