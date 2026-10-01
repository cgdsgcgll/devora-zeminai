# Frontend doğrulama kaydı

## Ortam

- Branch: `feat/frontend-mvp`; başlangıç: `5a70bcb`.
- Next.js 16.3.8 / React 19.3 / Node.js 22.21.0.
- Yerel FastAPI ve izole `work/frontend-smoke.db` SQLite veritabanı.
- Provider: `rule_based`; GitHub HTTP istekleri gerçek public repository’ye gönderildi.
- Gemini key/model bu ortamda bulunmadı: `LIVE_GEMINI_E2E_BLOCKED`. Daha önce bildirilen Gemini backend smoke başarısı bu frontend E2E testiyle karıştırılmamalıdır.

## Gerçek tarayıcı akışı

Codex Browser ile aday ve proje formları dolduruldu. Sentetik aday için `https://github.com/cgdsgcgll/devora-zeminai` public repository’si analiz edildi; commit `5a70bcb4a7b24ea0dbf5201af971d21b5f75dc64` üzerinden 27 evidence kaydı üretildi. Sonuçlar mock değildir.

İhtiyaç metni: `Python ve FastAPI zorunlu; Docker tercih sebebidir.`

- Python ve FastAPI required, Docker preferred döndü.
- Match gerçek POST isteğiyle oluşturuldu: **80/100 Kanıt Uyumu**.
- Required kapsamı %100, preferred kapsamı %0; Docker için yalnız beyan bulunduğundan observed kapsamına girmedi.
- Matched/unmatched kriterler, belirsizlikler ve gerçek evidence/source bağlantıları render edildi.
- Refresh sonrası kayıtlar backend’den tekrar yüklendi; eşleşme korunarak gösterildi.

Rule-based parser cümlecik ayırmada sınırlıdır; demo metninde required ve preferred ifadeleri noktalı virgülle ayrılır. Backend parser değiştirilmedi ve arayüz backend sonucunu yeniden sınıflandırmaz.

## Otomatik kontroller

- `npm run lint`: başarılı.
- `npm test`: 6 test başarılı; API error parsing, evidence/score semantiği, input validation ve güvenli URL kontrolü.
- `npm run build`: production build ve strict TypeScript başarılı.
- Backend `python -m pytest -q -p no:cacheprovider --basetemp=../work/pytest-frontend-cors`: 135 test başarılı. Dört CORS testi eklendi; mevcut 131 test korundu.
- Starlette/AnyIO için mevcut bir deprecation uyarısı var.

## Görsel kontrol

1440×1000 masaüstü ve 390×844 mobil viewport kontrol edildi. Mobil eşleşme ekranında yatay taşma yok; form, navigasyon, score ve evidence kartları tek kolona geçiyor. İndeterminate analiz durumu ve eksik analiz için empty state tarayıcıda görüldü. Aday adı boş gönderildiğinde Türkçe validation mesajı doğrulandı.

## Sınırlar

Bu bir üretim sertifikasyonu değildir. Canlı Gemini frontend E2E, authentication, deployment ve kesilen uzun işlemlerin otomatik kurtarılması doğrulanmış kapsamın dışındadır. İzole SQLite smoke veritabanı ve ekran görüntüleri `work/` altında ignore edilir.
Backend durdurularak tarayıcıda `NETWORK_ERROR` mesajı, korunmuş form girdisi ve tekrar deneme olanağı doğrulandı. Ardından yerel backend yeniden başlatıldı. Mobilde Yeni demo aksiyonu erişilebilir kalır.
