# UI polish — ilk inceleme turu

Tarih: 2026-10-03. Dal: `feat/ui-polish-apple`, başlangıç: `main` / `7ac91ef`.

## Bulgu ve değişiklikler

- Ana sayfa diyagramında `transform: rotate(-1deg)` tüm alt metinleri de döndürüyordu. Döndürülmüş metnin rasterizasyonu okunabilirliği zayıflatıyordu; transform kaldırıldı. Tarayıcıda computed transform `none` doğrulandı. Blur filtresi eklenmedi.
- Ana sayfa: daha net başlık, aday/kurum için iki ayrı CTA, beyaz kaynak akışı kartı, rafine tipografi ve daha dengeli boşluklar. ZeminAI yeşili korundu.
- Ortak yüzeyler, kartlar, butonlar, input/select, badge, focus, empty/error/loading alanları düzenlendi. Navigasyon mobilde altı bağlantıyı üç sütunlu iki satırda gösterir.
- Deneyim formu kapalı details arkasından çıkarıldı. Aday sayfasının üstünde görünür deneyim kısayolu ve formda altı açık kategori butonu var. Hackathon artık seçici içinde saklı değil.
- Düzenleme formuna kaydırma, kategori kilidi açıklaması, zorunlu/isteğe bağlı alan açıklaması, daha doğal Türkçe belge/bağlantı etiketleri eklendi.
- İşlem sürerken ilgili butonda işlem adı ve disabled durum, ekran altında görünür gerçek işlem bildirimi; başarıda işe özel ve kapatılabilir bildirim. Profil ve keşif yüklemesi ortak loading bileşenini kullanır.
- Başarı sadece task resolve olduğunda oluşturulur; yeni işlem önceki başarıyı temizler. Hata mesajı ayrı alert olarak odak alır. Sahte süre, ilerleme yüzdesi veya gecikme yok.
- Demo sıfırlama yerel ve senkron bir işlemdir: onay sonrası gerçek tamamlanma bildirimi verilir, sahte spinner eklenmez; backend kayıtları silinmez.
- Mobil hedefler en az 44 px; input yazısı 16 px. Reduced-motion kuralı korunur. Skor kartındaki küçük açıklamanın kontrastı düzeltildi.
- Eşleşme ekranında session yüklenirken yanıltıcı boş aday durumu gösterilmez.

## QA

Frontend `npm run lint`, `npm test` (**18 passed**) ve `npm run build` başarılı. `git diff --check` başarılı.

Tarayıcıyla 1280 px desktop ve 390 px mobil görünüm incelendi: ana sayfa, aday/profil formu, ihtiyaç, eşleşme, keşif ve yaşayan profil. İncelenen mobil sayfalarda yatay taşma yok (scrollWidth <= innerWidth). Ana sayfa desktop/mobil görselleri workspace dışı QA artifacts olarak saklandı; build veya test veritabanı commit edilmedi.

İzole `work/ui-polish-qa.db` ve yerel 8101 API / 3100 frontend ile gerçek HTTP/UI işlemleri:

- Aday oluşturma, proje kaydetme, public GitHub projesinin rule_based analizi: başarılı.
- Gerçek analiz sırasında loading metni, görünür işlem bildirimi ve disabled analiz butonu doğrulandı; tamamlanınca başarı gösterildi.
- Hackathon ekleme, düzenleme ve yalnız bu QA kaydını silme: başarılı; kayıt listesi ve bildirim güncellendi.
- Python gerekli + hackathon tercih edilen ihtiyacı ve eşleşme: başarılı; profile-only hackathon ile mevcut formül 20/100, teknik kriter karşılanmadı.
- Keşif ve yaşayan profil read modelleri yüklendi.
- Boş ihtiyaç formunda validation mesajı; izole API durdurulduğunda gerçek bağlantı hatası ve yeniden yükleme aksiyonu görüldü. Hata başarı olarak gösterilmedi.

Backend dosyalarında değişiklik yok. Matching formülü, evidence durumları, kaynak aileleri, Gemini repair, API contract, CORS/request limit/security header ayarları korunmuştur. Bu turda Gemini canlı testi veya tüm backend regression suite'i çalıştırılmadı; UI QA rule_based sağlayıcıyla yapıldı.

## İnceleme durumu

READY_FOR_REVIEW — ilk tasarım turu. Bu durum nihai tasarım kabulü değildir; kullanıcı tamam diyene kadar görsel geri bildirimlerle polish devam eder. Push yapılmaz.
