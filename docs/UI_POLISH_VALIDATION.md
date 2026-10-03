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

## İkinci tur — bütünsel ürün deneyimi

Tarih: 2026-10-03. Aynı `feat/ui-polish-apple` dalı; ilk tur `8a6e17c` korundu.

### Gerçek görsel denetim

Değişiklikten önce ve sonra `/`, `/aday`, `/profil`, `/ihtiyac`, `/eslesme`, `/kesif` ekranları gerçek tarayıcıda desktop (1280 px) ve mobil (390 px) incelendi. İlk turdaki sorunlar:

- Sayfalar arası CSS tekrarları ve üst üste eklenen kurallar.
- Mobilde iki satır navigasyon + her ekranda tekrar eden adımlar; asıl içeriğin aşağı itilmesi.
- Yaşayan profilde uzun başlık, yinelenen özetler ve geç görünen kayıtlar.
- Kategori chip'leri ve bir seferde açılan uzun deneyim formu.
- Keşifte uzun yöntem açıklamaları, buna karşın kapalı kriter sonuçları.
- Eşleşmede baskın koyu skor kutusu, aşağıda kalan gerekli/tercih edilen kapsam.

### Tasarım sistemi ve akış

`globals.css` temeller, navigasyon, kontroller, yüzeyler, feedback, ana sayfa, profil ve kapsam bölümleriyle yeniden toplandı. Sayfa genişliği, section ritmi, kart padding/radius, input/button yüksekliği ve gölgeler ortak token'lardan gelir. Sayfa bazlı override yığını kaldırıldı. Metinlere transform uygulayan giriş animasyonları yok; yalnız spinner/skeleton ve kısa control transition'ları var. Reduced-motion hepsini durdurur.

Navigasyon beş görev odaklı bağlantıdan oluşur; logo ana sayfaya döner. Mobilde açık isimli Menü düğmesi, aria-expanded/controls ve Escape ile odağın geri dönüşü vardır. Adım göstergesi yalnız profil oluşturma / ihtiyaç / uyum akışında görünür.

Ana sayfa ürün tanımını açıkça söyler, aday ve kurum girişlerini ayırır. Sağda iç içe kartlar yerine tek kaynak hikâyesi vardır. Beyan/bağlantı/gözlem ayrımı korunur; sahte aday veya skor gösterilmez.

Deneyim türleri açıklamalı büyük kartlardır. Başlık, kurum ve kaynak görünür; rol/tarih/kategori ayrıntıları açık etiketli isteğe bağlı bölümde. Düzenlemede ayrıntılar açık gelir. Profil kaydı sonrası güncel profile geçiş sunulur. Boş kayıt alanı görünür Hackathon ekle CTA'sına sahiptir. Silme aksiyonları ayrı ve sakin destructive stildedir. Alan validation'ı formda, servis hatası ayrı alert'te sunulur.

Yaşayan profilin başlığı ve açıklaması kısaldı; profil sahibi ve Deneyim ekle aksiyonu üstte. İhtiyaç formunda rol/çıktı isteğe bağlı bölümde; örnek metin açıklaması geliştirici dilinden arındırıldı.

Eşleşmede düşük puanı kişisel değerlendirme gibi sunmayan “Bu ihtiyaca ilişkin kanıt kapsamı” başlığı ve nötr yüzey; required/preferred kapsam için gerçek oranları gösteren erişilebilir progress elemanları var. Bunlar işlem ilerlemesi değildir. Unmatched açıklamaları backend'den aynen korunur.

Keşifte karşılanan/karşılanmayan kriter özetleri kartta görünür. Yöntem/sıralama ayrıntıları açılabilir, erişilebilir alandadır. Veri modeli yalnız matched bilgisi verdiği yerde “yeterli dayanak yok” denir; beyan bulunmadığı iddia edilmez. Score/sort/pagination değişmez.

Skeleton'lar gerçek ilk yükleme süresince gösterilir; şekiller aria-hidden, tek anlaşılır status metni vardır. Yapay timeout, sahte aşama veya yüzde eklenmez. Uzun analiz ve ihtiyaç hazırlama için gerçek isteğin kapsamını açıklayan sabit yardımcı metin kullanılır. Bilinen sabit İngilizce yazarlık uyarısı Türkçe sunulur; keyfi model metni veya kaynak alıntısı çevrilmez.

### Son kalite kapısı

- `npm run lint`: başarılı.
- `npm test`: **19 passed**; skeleton erişilebilirliği ve bilinen uyarının Türkçe sunumu/kaynak metninin değişmemesi dahil.
- `npm run build`: başarılı, tüm sayfalar üretildi.
- `git diff --check`: başarılı.
- Mobil altı route'ta scrollWidth <= innerWidth. Menü aç/kapa ve Escape odak dönüşü gerçek tarayıcıda doğrulandı.
- İzole QA API'de hackathon proje adı ve finalist sonucu girildi; ayrıntılar kapatılıp kaydedildi, veriler korundu. Düzenleme de başarılı. `https://localhost` kaynak girişinde alan hatası çıktı; ilgisiz yeniden yükleme aksiyonu gösterilmedi.
- İlk turdan kalan gerçek ihtiyaç/analiz/eşleşme kayıtlarıyla coverage ve discovery ekranları incelendi. Yeni hackathon kaydı sonrası canlı read model 100/100; eski kayıtlı match 80/100 olarak kaldı, tarihsel sonuç yeniden yazılmadı.
- Backend, API, matching, Gemini, doğrulama ve güvenlik ayarlarında değişiklik yok. Bu turda canlı Gemini veya backend tam suite çalıştırılmadı.

**READY_FOR_VISUAL_REVIEW**. Bu bir final tasarım onayı değildir; kullanıcı gerçek tarayıcıda inceleyecek. Push yapılmadı.
