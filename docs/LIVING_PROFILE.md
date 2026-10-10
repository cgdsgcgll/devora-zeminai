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

Timeline yalnız arşivlenmemiş Project ve mevcut ProfileEvidenceItem satırlarından oluşur. Artan tarih, eşitlikte UUID sırası kullanılır; arayüz ay bazında gruplar. Profil tarihi sırasıyla `started_at`, sertifika `issued_at`, `ended_at`, `created_at` içinden ilk mevcut değerdir. Projelerde yalnız sisteme eklenme tarihi bulunur. `date_basis=recorded_at` açıkça etiketlenir; deneyimin o gün gerçekleştiği iddia edilmez. Son 6/12 ay filtreleri yalnız timeline'ı daraltır, tüm profil sayılarını değiştirmez.

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

Keşif belirli ihtiyacın **tam aday havuzunu önce skorlar**, sonra `score DESC, required_coverage DESC, preferred_coverage DESC, candidate_id ASC` ile deterministik sıralar ve en son offset/limit uygular. Normal ve kanıt odaklı mod aynı sıralamayı kullanır. İlk sayfa bu ihtiyacın en yüksek Kanıt Uyumu sonuçlarını içerir; genel yetenek değerlendirmesi değildir.

Kontrollü demo için tam havuz maksimum **100 adaydır**. Sorgu en fazla 101 aday okur; 101. aday varsa **hiçbir kısmi sıralama döndürmeden** 422 `DISCOVERY_POOL_LIMIT_EXCEEDED` ve `details.max_candidates=100` döner. Sınır içindeki tüm adaylar değerlendirilir, ilk 100'ün sessizce seçilmesi söz konusu değildir. Sayfa varsayılan 20/maksimum 50, offset 0–100000; `has_more` global sıralamadaki kalan sonuçları ifade eder. Boş/sonrası sayfa boş liste döndürür.

Her istek güncel veriden yeniden hesaplar: istekler arasında aday, kanıt veya ihtiyaç değişirse sıra değişebilir; snapshot pagination garantisi yoktur. Production için tenant/uygunluk kapsamlı, need/evidence sürümüyle ilişkilendirilmiş kalıcı match projection, DB'de aynı composite ordering ve snapshot/cursor pagination gerekir. Bu demo sınırı production ölçek çözümü olarak sunulmaz.

İsimsiz görünüm API'de ad yerine `Aday #<UUID ilk 8 karakter>` döndürür. Okul, kurum, profil başlığı, açıklama, kaynak URL ve excerpt dönmez: bunlar dolaylı kimlik içerebilir. Kriter adı, durumu, kaynak ailesi/provenance ve destekleyen kayıt sayısı korunur. Fotoğraf/GPA alanı eklenmedi. Normal görünümde aday adı ve profil/kalıcı eşleşme bağlantıları vardır. Bu **tam anonimleştirme veya erişim kontrolü değildir**: aday UUID'si gönderilir; diğer özel uçlar rol ve sahiplik kontrolü altındadır. Bias'ın ortadan kalktığı iddia edilmez.

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

Standart 404/422/error envelope korunur. Material okuyucu projeleri, pencere fonksiyonuyla son başarılı run'ları, tamamlanmamış son analiz zamanlarını, evidence ve profile kayıtlarını toplu sorgular. Keşif 1 veya 12 aday/24 projede **8 SELECT** yapar; aday/proje başına ek sorgu yoktur. Sayfa büyüklüğü skorlanan havuzu daraltmaz; en fazla 100 adayın skor ve sıralaması bellekte tutulur. Her material sorgusu en fazla 5001 satır okur; 5000 üzeri kontrollü `READ_LIMIT_EXCEEDED` döner. Sessiz eksik skor/özet üretilmez. Timeline özetleri aynı material üzerinden hesaplanır. Bu sınırlar rate limiting veya tenant kotası değildir.

## Portföy ve migration

`portfolio` kategorisinin `output_type` değerleri: `web_app`, `demo`, `package`, `article`, `service`. Serbest yeni enum, fetch veya içerik doğrulaması yoktur. HTTPS link varsa linked, yoksa declared_only. Mevcut URL/mass-assignment/tarih/uzunluk sınırları geçerlidir.

`529ac1_living_portfolio` yalnız profil kategori CHECK koşulunu genişletir. Eski candidate/project/evidence/profile satırları değiştirilmez. SQLite ve PostgreSQL upgrade/check/downgrade/upgrade veri koruma testleri vardır. **Portföy kaydı varken downgrade bilinçli olarak durur**; veriyi silerek veya başka kategoriye çevirerek başarılı görünmez. Eski uygulamaya dönüş öncesinde kayıtları koruyan bir export/uyumluluk planı gerekir. Demo DB'de downgrade yapılmadı; döngüler ayrı test DB'lerinde çalıştırıldı.

## GitHub attribution kararı

GitHub hesabı OAuth/PKCE ile adaya bağlanabilir; bu yalnız hesap/erişim ilişkisidir. Public contributor, commit author, PR author veya changed files tek başına aday yazarlığını doğrulamaz; bu fazda contribution fetch eklenmedi. Yeni contribution fetch bütçeleri dolayısıyla **0 commit / 0 contributor / 0 PR / 0 changed file**; mevcut bounded repository fetch ve GitHub allow-list korunur. UI/API “Repository-level evidence; individual authorship not verified” sınırlamasını gösterir. Repo bir adaya bağlı olduğu için kişisel katkı kanıtı oluşturulmaz. Mevcut snapshot yeniden kullanılabilir, quota 0 ise tekrar fetch döngüsü yapılmaz.

## FUTURE — uygulanmadı

Provider-backed verification, doğrulanmış GitHub kimliğine bağlı bounded attribution, continuous sync, authenticated endorsements, gelişmiş takım optimizasyonu ve tam collaboration lifecycle. `Match → Contact/Interview → Collaboration → Project → Output` gelecekte yetkilendirilmiş bir süreç olabilir; bu sürümde sahte endorsement, reviewed/contacted alanı veya CRM yoktur.

Auth/ownership kontrolleri ve IDOR negatif testleri uygulanmıştır; AI rate limiting/kota **HIGH / OPEN production blocker** kalır. [Auth sözleşmesi](AUTH.md). Profil, keşif ve takım uçları da erişim kontrolü olmadan public üretime açılmamalıdır. Kontroller ve çalıştırılan komutlar [güvenlik incelemesinde](SECURITY_REVIEW.md).


### Team complements (7 Ekim 2026)

`POST /needs/{need_id}/team-complements`, `TeamComplementCreate`: 2–3 farklı,
aktif aday kimliği ve `anonymous` (varsayılan true). Yalnız kurumun kendi ihtiyacı;
Origin/Referer kontrolü ve DB-backed `compute` bütçesi uygulanır.
`TeamCoverage` değişmez. Tam aktif discovery havuzu (en fazla 100 aday) toplu
olarak yüklenir; sınır aşılırsa 422 döner, kısmi öneri üretilmez.
Seçili takımın criterion union kapsamı çıkarılır. Yalnız açık kriterlerden en az
birini mevcut matcher ile karşılayan, seçilmemiş adaylar döner.
Sıra: `closes_required_count DESC, closes_preferred_count DESC, candidate_id ASC`.
`resulting_*` alanları tek aday eklenmesinin gerçek union kapsamını gösterir.
Genel skor tie-break olarak kullanılmaz. Sonuç/seçim saklanmaz; AI veya URL fetch yoktur.
Teknik `declared_only` kanıt sayılmaz; açıkça istenen profil deneyimi kriterlerinin
mevcut beyan/bağlantı semantiği korunur. Repository kanıtı bireysel yazarlık doğrulamaz.
Anonim yanıt ad/kaynak serbest metni/URL taşımaz; kanıt referansları family/status/count'tur.
Frontend yalnız kullanıcı isteğiyle çağırır; takım/need/anonim görünüm değişimi eski
sonucu kaldırır. Dört kişilik takım ve tam kapsam durumunda aksiyon gösterilmez.

Eşleşmedeki “Nasıl hesaplandı?” açıklaması kayıtlı kriter sayılarını ve sunucu
coverage değerlerini gösterir; `result.score` authoritative kalır. 80/20 veya tek
öncelik grubunda %100 ağırlık açıklanır; strength puan katsayısı değildir.
Frozen trace yeniden hesaplanmaz; tarihsel kayıt olduğu açıkça gösterilir.


## 8 Ekim 2026 — Kaynak ve proje yaşam döngüsü

Arşivlenen proje yeni profil, discovery ve match hesaplarında kullanılmaz; eski analiz/evidence FK satırları ve frozen match/trace sonuçları korunur.
Public GitHub import sonrası yalnız mevcut analyzer'ın ürettiği kanıtlar görünür olur. Repository adı veya README beyanı observed'a yükselmez.
LinkedIn URL'si linked referanstır; pasted_text kayıtları URL içerse bile declared_only kalır. Kaynak/import metadata'sı düzenleme sırasında korunur.
İş/staj/project metinleri mevcut portfolio ailesinde, diğer açık kayıt türleri mevcut education/certification/community/event/hackathon ailesinde saklanır.
Mevcut resolver'ın desteklemediği work/internship/portfolio kriterleri için yeni eşleşme kuralı eklenmedi; project_experience hâlâ observed source_file kanıtı ister.
Detaylar: [Proje yaşam döngüsü ve profesyonel profil](PROJECT_LIFECYCLE.md).
