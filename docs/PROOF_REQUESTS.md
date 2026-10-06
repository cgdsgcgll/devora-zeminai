# Kanıt İsteği ve ürün araçları

## Anlam ve sınırlar

Kanıt İsteği (Proof Request), kurumun **kendi eşleşmesindeki karşılanmayan kriter** için adaydan çalışma istemesidir. Bir sınav, otomatik beceri doğrulaması veya AI değerlendirmesi değildir. Yalnız ilgili kurum ve aday okuyabilir. Başka kullanıcıların kimlikleriyle erişim 404, yanlış rol 403 verir; cookie auth ve exact-origin CSRF geçerlidir.

`open → submitted → closed` temel akıştır. Kurum `submitted → open` ile güncelleme isteyebilir; `open/submitted → cancelled` ile iptal edebilir. Kapatılmış istek yeniden açılmaz; yeni istek oluşturulabilir. Aynı match criterion için yalnız bir `open/submitted` kayıt DB partial unique index ile korunur. Eşzamanlı yaratmada biri 201, diğeri 409 alır. Güncelleme koşullu SQL ile uygulanır.

Aday yalnız kendi projesini/profil kaydını bağlar veya güvenli HTTPS URL gönderir. Arbitrary URL **fetch edilmez**; HTTP, localhost, özel IP, credentials ve uygunsuz port reddedilir. Yeni GitHub projesi mevcut proje oluşturma/analiz akışından geçmelidir. Proje bağlantısının üst durumu `linked`; ekli analiz kanıtlarının kendi `observed/declared_only/not_found` durumları ayrı gösterilir. Profil kaydının mevcut durumu korunur. Kurumun kapatması hiçbir kanıtı yükseltmez.

Gönderim anındaki başlık, URL, not ve analiz kanıtları dondurulur. Kaynak sonradan düzenlense/silinse de bu kayıt değişmez. İsteği güncellemeye açıp yeniden gönderme son gönderimi değiştirir; tüm gönderim sürümlerinin audit geçmişi bu MVP'de tutulmaz. E-posta/bildirim teslimatı, deadline ve dosya yükleme yoktur. Gelen kutusu 20'lik sayfalarla, API en çok 100 kayıtla sınırlıdır.

## API / migration

- `POST /proof-requests`: match_id, criterion_id, title, instructions; kurum sahipliği, karşılanmayan kriter ve compute bütçesi kontrol edilir.
- `GET /proof-requests?offset=0&limit=20`, `GET /proof-requests/{id}`: sahiplik filtresi.
- `POST /proof-requests/{id}/submit`: project_id / profile_evidence_id / source_url alanlarından tam biri, isteğe bağlı note.
- `PATCH /proof-requests/{id}`: open / closed / cancelled kurum iş akışı.

`a14_proof_requests`, `a13_operation_budgets` üstüne gelir: `proof_requests` ve nullable `match_criteria.trace_items`. Fresh ve a13→head upgrade, `alembic check` doğrulandı. Veri içeren proof/trace downgrade'i sessiz kayıp yerine engeller. Eski trace alanı olmayan match'ler açık `trace_available=false` döndürür; canlı kaynaklardan tarihsel açıklama uydurulmaz. OpenAPI ve TypeScript tipleri mevcut generator ile yeniden üretildi.

## Evidence Trace / kör inceleme / takım

Trace, eşleşme anındaki kriterin kaynaklarını ve durumlarını dondurur; declared/not_found kayıtlar da görünür. Scoring değişmez. Sonraki analiz gerçekten observed kanıt üretirse yalnız **yeni** eşleşme bundan yararlanır. Eski eşleşme aynen kalır.

Match `anonymous=true` yanıtında aday adı, serbest açıklamalar, profil kayıtları, kaynak URL/path ve alıntılar çıkarılır. Kriter, skor/kapsam ve kaynak ailesi/durumu/strength korunur. Frontend discovery ve match'te bu modu varsayılan açar. Kurum yetkisi altında normal ayrıntılar yeniden alınır. Teknik ID ve ihtiyacın kendi kriterleri kalır; tam anonimlik veya yeniden tanımlamaya karşı garanti değildir.

2–4 aday için takım matrisi mevcut deterministik criterion union hesabını kullanır. Seçim değiştikçe gerçek endpoint çağrılır; eski istek sonuçları ekrana uygulanmaz. LLM çağrısı, kişilik/başarı skoru veya okul/GPA ağırlığı yoktur. Discovery mevcut global sıralama ve 100 aday hard limitini korur; seçili adaylar sayfa/need/kör görünüm değişiminde temizlenir. Mobil matris kendi alanında kayar; mevcut reduced-motion CSS geçerlidir.

## 6 Ekim 2026 doğrulama kaydı

- SQLite full backend: **346 passed**, 1 mevcut Starlette TestClient/httpx deprecation uyarısı; 327 eski test + 19 yeni test. `compileall`, `pip check`, fresh migration ve `alembic check` başarılı.
- Yeni testler: sahiplik/rol/CSRF, unsafe link, mükerrer aktif istek, eşzamanlı iki bağlantı/restart, gönderim/close/reopen/cancel, değişmeyen eski snapshot, yeni observed OSPF ile yalnız yeni match, legacy trace ve bounded SELECT. Inbox 1/12 kayıtta sabit; match okuması toplu ilişki yükler. Mevcut discovery/team sorgu regresyonları da geçti.
- Frontend: **47 passed**; lint/build başarılı. TR varsayılanı, kalıcılık/html.lang, dictionary eşitliği, çevrilmeyen kaynak metni, güvenli hata mesajları, 401 dışı session koruması ve API payloadları test edildi. `npm audit --omit=dev`: 0 vulnerability. Yeni dependency eklenmedi.
- Browser QA gerçek yerel UI + SQLite + açıkça **sentetik** analiz fixture'larıyla yapıldı; canlı Gemini/GitHub sonucu değildir. TR/EN landing, auth formu, profil/sayaçlar, discovery, blind/reveal, match trace ve proof inbox görüldü. Dil yenilemede korundu. A Python+Docker, B React seçimi **3/3**; çıkarma 1 aday durumuna döndü. OSPF beyanı unmatched kaldı; kurum isteği → aday proje gönderimi → kurum close tamamlandı. Gönderimde observed Python/Docker ile declared OSPF ayrı kaldı. Mobil landing/match/team/proof sayfalarında sayfa düzeyinde yatay taşma yoktu.
- Manuel gerçek PostgreSQL18 doğrulaması tamamlandı: `DATABASE_URL` bağlantısı başarılı (`SELECT 1 → 1`), izole schema `zeminai_test`.
- `a14_proof_requests` migration gerçek PostgreSQL18 üzerinde **head PASS**; full backend suite **346/346 PASS** (`346 passed, 2 warnings, 38.93s`). Starlette TestClient/httpx deprecation ve Windows pytest cache permission uyarıları test failure değildir. Testlerden sonra çalışma ağacı temizlendi.

HTTPS ingress/proxy/cookie smoke, secret manager, DB TLS/backup/restore, monitoring, e-posta doğrulama/parola kurtarma, session/device lifecycle ve provider spend/global concurrency sınırları önceki deployment kaydındaki açık işlerdir. Bu çalışma production güvenliği onayı değildir.
