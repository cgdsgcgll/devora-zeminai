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


## 1 Ekim 2026 — mikro etkileşim ve güvenlik turu

Production build ve `npm run start -- --hostname 127.0.0.1` ile kontrol edildi:

- 1440×1000 desktop: nav underline normalde scaleX(0), hover'da scaleX(1)
  ve soldan açılma; ayrılınca sağa kapanma computed style ile doğrulandı.
  Aktif sayfa çizgisi korunuyor. CTA hareketi -1px, ok hareketi +3px.
- Formda klavye ile Tab geçişinde görünür solid focus ring; textarea yalnız
  dikey resize. Tamamlanmış adımlar sakin yeşil, aktif adım daha koyu.
- Giriş geçişi 260 ms; bitiminde opacity 1. Statik evidence kartları hareket etmiyor.
  Demo restore sırasında gerçek indeterminate loading ve disabled butonlar görüldü.
  Sahte yüzde/aşama veya score counter yok.
- Mevcut gerçek API kayıtları restore edildi; yeni backend middleware ile
  “Eşleşmeyi Yenile” isteği başarılı, Kanıt Uyumu 80, gerekli kapsam %100,
  tercih edilen kapsam %0. Yeni canlı AI çağrısı yapılmadı.
- 390×844 mobil: ihtiyaç formu ve eşleşme ekranı okunabilir; document scrollWidth
  ve clientWidth 375px (scrollbar hariç), yatay taşma yok. Navigasyon, reset ve
  CTA görünür; ana aksiyonlar hover'a bağımlı değil. Fiziksel touch cihaz testi yapılmadı.
- Production DOM'da Next.js development indicator portalı yok.
- Reduced motion CSS kuralları incelendi: giriş/spinner animation ve transition
  kapalı, CTA/ok/dekoratif dönüşüm kapalı; aktif/focus underline görünürlüğü
  korunuyor. Tarayıcı aracında media emulation desteği yok; gerçek sistem
  reduced-motion açıkken görsel QA bu turda yapılamadı (mevcut tercih false).
- Güvenlik başlıklarının dört değeri çalışan production HTTP yanıtında kontrol edildi.

Son kalite sonuçları: frontend lint/build başarılı, **7 frontend testi** ve
**163 backend testi** geçti. `npm audit` (JSON çıktı) ve `npm audit --omit=dev`
sıfır bulgu; Python audit aracı mevcut değil. Diğer güvenlik kapsamı ve açık
production engelleri [SECURITY_REVIEW.md](SECURITY_REVIEW.md) dosyasında.
