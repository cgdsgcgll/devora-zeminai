# Yaşayan Yetenek Profili

Ne ürettiğinizi, ne öğrendiğinizi ve nerelerde katkı verdiğinizi zaman içinde görünür kılın.
Kurumlar profil statüsü yerine belirli ihtiyaçla ilişkili dayanakları inceleyebilir.
Bu sürüm kontrollü demo içindir; genel Talent/Social/Activity/Potential Score yoktur.

## CURRENT — uygulanan kapsam

- `/profil`: deterministik profil özeti, Yetenek Haritası, Gelişim Zaman Çizelgesi ve Kanıt Pasaportu. Bölüm düğmeleri klavyeyle kullanılabilir; tek görünüm açık kalır.
- `/aday`: mevcut proje akışı ve açılır Gelişim & Deneyim CRUD. Portföy aynı profil tablosunda altıncı kategoridir.
- `/kesif`: seçili kurum ihtiyacına göre aday keşfi, varsayılan kanıt odaklı görünüm ve elle seçilen 2–4 adayın takım kapsamı.
- `/eslesme`: saklanmış MatchCriterion kayıtlarından türetilen kanıt boşlukları ve koşullu, deterministik kayıt ekleme önerileri. Yeni AI çağrısı yoktur.

## Zaman ve factual counts

Timeline yalnız mevcut Project ve ProfileEvidenceItem satırlarından oluşur. Artan tarih, eşitlikte UUID sırası kullanılır; arayüz ay bazında gruplar. Profil tarihi sırasıyla `started_at`, sertifika `issued_at`, `ended_at`, `created_at` içinden ilk mevcut değerdir. Projelerde yalnız sisteme eklenme tarihi bulunur. `date_basis=recorded_at` açıkça etiketlenir; deneyimin o gün gerçekleştiği iddia edilmez. Son 6/12 ay filtreleri yalnız timeline'ı daraltır, tüm profil sayılarını değiştirmez.

Harita proje/teknik kanıt, eğitim/sertifika, hackathon/bağlantı, topluluk/organizatör ve portföy/etkinlik kayıt sayılarını gösterir. Bunlar kalite, gelişim hızı, liderlik veya beceri seviyesi puanı değildir. Teknik kanıtlar her projenin son başarılı analizinden gelir; yeniden analiz eski evidence'ı iki kez saydırmaz. Sonraki başarısız analiz varsa son başarılı snapshot kullanıldığı belirtilir.

Pasaport gerçek kaynak ailesi + provenance sayılarını gösterir:

| Durum | Anlam |
|---|---|
| declared_only | Kullanıcı beyanı |
| linked | Kullanıcının HTTPS kaynak bağlantısı; içeriği bağımsız doğrulanmadı |
| observed | Repo verisinde gözlemlenen teknik dayanak; kişisel yazarlık doğrulaması değil |
| verified | Provider doğrulaması için ayrılmış; bu sürümün CRUD'u üretemez |
| not_found | Analizde kanıt bulunamayan kayıt; gözlem veya beceri yokluğu değildir |

## Keşif ve takım algoritması

Persisted match, discovery ve team aynı `load_material` + `calculate_for_need` yolunu kullanır. Mevcut formül değişmez: iki grup varsa `100 × (0.8 × required_coverage + 0.2 × preferred_coverage)`; tek grup varsa onun kapsamı %100 ağırlıktadır. Kanıt sayısı, okul, GPA, organizatör/konuşmacı rolünden çıkarılan soft skill bonus değildir. Portföy bağlantıları teknik kriterleri karşılamaz; yeni portfolio criterion eklenmedi, NeedAnalyzer sözleşmesi korundu.

Keşif **global top-N sıralama değildir**. Adaylar `created_at ASC, id ASC` ile sınırlı sayfalara ayrılır; yalnız getirilen sayfa `score DESC, created_at ASC, id ASC` sırasına konur. Varsayılan 20, maksimum 50 aday; offset 0–100000. Sayfalar arasında skor sırası vaat edilmez. Büyük ölçek için tenant filtreli, versiyonlu match projection ve cursor pagination gelecekte değerlendirilebilir; mevcut demo tüm aday evrenini taramaz.

İsimsiz görünüm API'de ad yerine `Aday #<UUID ilk 8 karakter>` döndürür. Okul, kurum, profil başlığı, açıklama, kaynak URL ve excerpt dönmez: bunlar dolaylı kimlik içerebilir. Kriter adı, durumu, kaynak ailesi/provenance ve destekleyen kayıt sayısı korunur. Fotoğraf/GPA alanı eklenmedi. Normal görünümde aday adı ve profil/kalıcı eşleşme bağlantıları vardır. Bu **tam anonimleştirme veya erişim kontrolü değildir**: aday UUID'si gönderilir ve auth olmayan diğer uçlar açık kalır. Bias'ın ortadan kalktığı iddia edilmez.

Takım hesaplaması aynı ihtiyaç için seçilen adayları yeniden değerlendirir ve karşılanan criterion ID'lerinin birleşimini alır. Bir kriter kaç kişi desteklerse desteklesin bir kez sayılır; destekleyen aday + kaynak aileleri ayrıca gösterilir. 2–4 farklı aday zorunludur, bilinmeyen aday 404; başka need'in match ID'leri veya keyfi alanlar kabul edilmez. Eksik grubun coverage değeri 0'dır. Takım seçimi/başarı tahmini yapılmaz; toplam başarı skoru yoktur. Sonuç salt hesaplamadır, DB'ye yazılmaz. Seçim/mod/sayfa değişince UI takım sonucunu temizler.

## Kanıt boşlukları ve geçmiş

Matched criterion → strength; unmatched required → required_gap; unmatched preferred → preferred_gap. “Mevcut profil verilerinde Docker kriterine ilişkin yeterli kanıt bulunamadı” ifadesi beceri yokluğu iddiası değildir. Öneriler yalnız “Varsa ilgili gerçek projenizi/kaydınızı ekleyebilirsiniz” biçimindedir; eğitim veya kariyer reçetesi verilmez.

`GET /matches/{id}/gaps` güncel profil üzerinden geçmiş sonucu değiştirmez, dondurulmuş match kayıtlarından türetilir. Mevcut MatchResult ve JSON profil snapshot davranışı korunur. Discovery/team güncel verileri okur ve otomatik geçmiş match kaydı üretmez.

## API ve sorgu sınırları

| Metot | Yol | İşlev |
|---|---|---|
| GET | `/candidates/{id}/living-profile?since=YYYY-MM-DD` | Tek yanıtta summary, map, passport, timeline |
| GET | `/needs/{id}/discovery?anonymous=true&offset=0&limit=20` | Sınırlı aday sayfası ve kriter kaynakları |
| POST | `/needs/{id}/team-coverage` | `{candidate_ids: [2–4 UUID], anonymous: true}` |
| GET | `/matches/{id}/gaps` | Geçmiş eşleşmeden boşluklar ve sonraki adımlar |

Standart 404/422/error envelope korunur. Material okuyucu projeleri, pencere fonksiyonuyla son başarılı run'ları, tamamlanmamış son analiz zamanlarını, evidence ve profile kayıtlarını toplu sorgular. Keşif 1 veya 12 aday/24 projede **8 SELECT** yapar; aday/proje başına ek sorgu yoktur. Her material sorgusu en fazla 5001 satır okur; 5000 üzeri kontrollü `READ_LIMIT_EXCEEDED` döner. Sessiz eksik skor/özet üretilmez. Timeline özetleri aynı material üzerinden hesaplanır. Bu sınırlar rate limiting veya tenant kotası değildir.

## Portföy ve migration

`portfolio` kategorisinin `output_type` değerleri: `web_app`, `demo`, `package`, `article`, `service`. Serbest yeni enum, fetch veya içerik doğrulaması yoktur. HTTPS link varsa linked, yoksa declared_only. Mevcut URL/mass-assignment/tarih/uzunluk sınırları geçerlidir.

`529ac1_living_portfolio` yalnız profil kategori CHECK koşulunu genişletir. Eski candidate/project/evidence/profile satırları değiştirilmez. SQLite ve PostgreSQL upgrade/check/downgrade/upgrade veri koruma testleri vardır. **Portföy kaydı varken downgrade bilinçli olarak durur**; veriyi silerek veya başka kategoriye çevirerek başarılı görünmez. Eski uygulamaya dönüş öncesinde kayıtları koruyan bir export/uyumluluk planı gerekir. Demo DB'de downgrade yapılmadı; döngüler ayrı test DB'lerinde çalıştırıldı.

## GitHub attribution kararı

GitHub hesabını aday kimliğine doğrulanmış biçimde bağlayan auth akışı yoktur. Public contributor, commit author, PR author veya changed files tek başına aday yazarlığını doğrulamaz; bu fazda contribution fetch eklenmedi. Yeni contribution fetch bütçeleri dolayısıyla **0 commit / 0 contributor / 0 PR / 0 changed file**; mevcut bounded repository fetch ve GitHub allow-list korunur. UI/API “Repository-level evidence; individual authorship not verified” sınırlamasını gösterir. Repo bir adaya bağlı olduğu için kişisel katkı kanıtı oluşturulmaz. Mevcut snapshot yeniden kullanılabilir, quota 0 ise tekrar fetch döngüsü yapılmaz.

## FUTURE — uygulanmadı

Provider-backed verification, doğrulanmış GitHub kimliğine bağlı bounded attribution, continuous sync, authenticated endorsements, gelişmiş takım optimizasyonu ve tam collaboration lifecycle. `Match → Contact/Interview → Collaboration → Project → Output` gelecekte yetkilendirilmiş bir süreç olabilir; bu sürümde sahte endorsement, reviewed/contacted alanı veya CRM yoktur.

Auth/authorization/tenant isolation/IDOR ve rate limiting **HIGH / OPEN production blockers**. Profil, keşif ve takım uçları da erişim kontrolü olmadan public üretime açılmamalıdır. Kontroller ve çalıştırılan komutlar [güvenlik incelemesinde](SECURITY_REVIEW.md).
