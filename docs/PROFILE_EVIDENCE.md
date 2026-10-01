# Gelişim ve deneyim kaynakları

`ProfileEvidenceItem` aday seviyesindedir; `Project` ve `SkillEvidence` yerine geçmez. Kategoriler: education, certification, hackathon, event, community, portfolio. Gönüllülük etkinlik/topluluk `participation_type=volunteer` ile temsil edilir.

Başlık, kurum, rol, açıklama, tarihler, kaynak URL/etiketi, kategori, doğrulama durumu ve zaman damgaları ayrı kolonlardır. Sınırlı metadata: eğitimde program/tür/durum/sınıf; sertifikada credential ID/veriliş/son geçerlilik; hackathonda proje adı/sonuç; etkinlik/toplulukta katılım türü/sorumluluk; toplulukta ayrıca teknoloji/diğer alanı; portföyde web_app/demo/package/article/service çıktı türü. Başlık/kurum/rol 200, açıklama 4000, URL 2000, sorumluluk 1000 karakterle sınırlı. Bilinmeyen alanlar ve başka kategoriye ait metadata reddedilir.

## Doğrulama

| Durum | Anlam |
|---|---|
| declared_only | Kaynaksız kullanıcı beyanı |
| linked | Kullanıcının HTTPS bağlantısı; içerik doğrulanmadı |
| verified | Gelecekte trusted provider için ayrılmış durum; mevcut CRUD üretemez |

Kaynak ekleme/çıkarma durumu backend'de yeniden türetir. Kullanıcı verification_status, candidate_id, kimlik veya zaman damgası atayamaz. PATCH kategoriyi değiştiremez; metadata nesnesi verildiğinde bütünüyle değiştirilir. Tarih sırası birleşik kayıt üzerinden kontrol edilir. URL'ler ziyaret edilmez; HTTPS, kimlik bilgisi içermeyen hostname ve standart port gerekir. IP/local adresler ve tehlikeli şemalar reddedilir. GitHub'ın ayrı allow-list fetch mantığı korunur.

## API

| Metot | Yol | Yanıt |
|---|---|---|
| POST | /candidates/{candidate_id}/profile-evidence | 201 kayıt |
| GET | /candidates/{candidate_id}/profile-evidence | 200 liste |
| GET | /profile-evidence/{evidence_id} | 200 kayıt |
| PATCH | /profile-evidence/{evidence_id} | 200 güncel kayıt |
| DELETE | /profile-evidence/{evidence_id} | 204 boş yanıt |

Yoksa 404, geçersiz input 422; mevcut error envelope korunur. Auth ve ownership kontrolü henüz yoktur: UUID güvenlik kontrolü değildir. Public kullanıma açılmamalıdır.

## Kriterler

Eski kriterlerin varsayılan kind değeri technical_skill. `skill_key` alan adı geriye uyumluluk için korunur. Teknik dışı anahtarlar kontrollü katalogdadır; bilinmeyen aile/anahtar çifti reddedilir.

| Kind / anahtar | Karşılık |
|---|---|
| technical_skill / python | Aynı beceride observed SkillEvidence |
| project_experience / project_experience | observed source_file |
| project_experience / ai_project_experience | observed kaynak alıntısında ayrıştırılabilir Python AI SDK importu; yalnız Python/README yeterli değil |
| education / education_student | Devam eden eğitim |
| education / education_year_3_4 | Devam eden eğitim + açık sınıf 3/4 |
| certification / certification_experience | Genel sertifika kaydı |
| hackathon / hackathon_experience | Hackathon kaydı |
| hackathon / hackathon_finalist veya hackathon_winner | Tam olarak ilgili sonuç; katıldı/finalist/kazandı birbirine çevrilmez |
| community / community_experience veya community_organizer | Topluluk kaydı / açık organizatör rolü |
| community / technology_community_experience | Açık focus=technology olan topluluk kaydı |
| event / event_experience veya event_speaker | Etkinlik kaydı / açık konuşmacı rolü |

Rule-based ve ortak LLM need analyzer açık ifadeleri işler. Teknik dışı kriterler aksi açıkça istenmedikçe preferred olur. Doğal dil kapsamı sınırlıdır; üretilen kriterleri inceleyin. Katalog `backend/app/core/criteria.py` içindedir. Belirli sertifika/program talepleri genel kayda genişletilmez; bu sürümün otomatik eşleştirme kapsamı dışındadır. LLM teknik kriterleri de sınırlı teknoloji sözlüğü ve birebir alıntıyla doğrular; desteklenmeyen model çıktısı hata verir.

Örnek: “React bilen, yapay zekâ projelerinde çalışmış, hackathon deneyimi olan ve teknoloji topluluklarında aktif…” → React required; AI proje, hackathon, topluluk preferred. “İletişimi kuvvetli sosyal biri” kural analizinde kriter üretmez. Hackathon → teamwork, organizer → iyi lider, speaker → iletişim becerisi çıkarımı yapılmaz.

## Skor ve geçmiş

Formül: iki grup varsa `100 × (0.8 × required_coverage + 0.2 × preferred_coverage)`; tek grup varsa onun kapsamı %100 ağırlıklı. Her kriter bir kez sayılır. On sertifika, sekiz etkinlik veya okul adı Python/FastAPI skorunu değiştirmez. Profil beyanları yalnız açıkça istenen ilgili deneyim kriterini karşılayabilir; bağımsız doğrulanmış yetkinlik gibi sunulmaz.

GitHub-only sonuçlar evidence-coverage-v0.2, genişletilmiş sonuçlar v0.3 resolver sürümünü taşır; formül aynıdır. Eşleşme kriterinde kategori ve kullanılan profil kayıtlarının JSON kopyası dondurulur. Profil düzenleme/silme eski sonucu değiştirmez. Profil silme, geçmiş kopyaları kapsayan tam kişisel veri silme değildir; retention/erasure politikası production öncesi tasarlanmalıdır.

## Migration

178f73ddc6dc: yeni profil tablosu. 41c0cbaf4250: need/match kriter ailesi ve dondurulmuş kaynaklar. Eski kriterlere technical_skill, eski sonuçlara boş profil listesi atanır. Eski candidate/project/skill evidence verileri yeniden yazılmaz.

`python -m alembic upgrade head`; `python -m alembic check`. İki migration reversible. Downgrade yeni feature kolonlarını/kayıtlarını kaldırır; gerçek ortamda önceden yedek alın. Otomatik downgrade yapılmaz. Test döngüsü ayrı yerel PostgreSQL üzerinde eski proje/kanıt verileriyle uygulandı.

Gelecek: trusted certificate/event provider doğrulaması, contributor attribution, continuous profil güncelleme. Bunlar mevcut özellik değildir.

## Yaşayan profil genişlemesi

Portföy mevcut CRUD, güvenli HTTPS ve declared_only/linked semantiğini kullanır; dış kaynak indirilmez. Portföy teknik skora dönüşmez ve NeedAnalyzer kriter kataloğunu değiştirmez. `529ac1_living_portfolio` kategori CHECK koşulunu genişletir. Portföy kaydı varsa downgrade veri kaybını önlemek için durur; eski kayıtlarda upgrade/check/downgrade/upgrade veriyi korur.

Timeline, harita ve pasaport aynı gerçek DB verilerinden türetilir; discovery ve team aynı scorer/material okuyucusunu paylaşır. [Yaşayan profil sözleşmesi](LIVING_PROFILE.md), API sınırları ve CURRENT/FUTURE ayrımı için referanstır.
