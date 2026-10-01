# Profil evidence doğrulama kaydı

Tarih: 1 Ekim 2026. Branch: feat/profile-evidence-sources. Taban: adcfb26 (feat/frontend-mvp).

## Backend ve migration

Temiz hardening virtualenv, Python 3.12, FastAPI 0.142.2, Starlette 1.7.0.

`python -m pytest -q -p no:cacheprovider --basetemp=<repo/work/...>`: **204 passed** hem SQLite unit suite hem temiz PostgreSQL integration suite. TestClient/httpx için bir deprecation uyarısı var; test başarısızlığı değil. Compileall ve pip check başarılı.

`python -m alembic check`: No new upgrade operations detected. Ayrı ve boş PostgreSQL test veritabanında eski migration'a candidate/project/snapshot/skill evidence eklenerek upgrade → check → downgrade → upgrade → check uygulandı. Satır içerikleri birebir korundu. Mevcut demo DB'si bu tekrar sırasında downgrade edilmedi.

Preflight: açık config yoksa ret; SQLite fallback yok; ulaşılamayan DB'de güvenli hata; hostname/password çıktıya taşınmıyor. `scripts/start-demo.ps1 -UseExistingPostgres` gerçek PostgreSQL üzerinde CONFIG_OK / DATABASE_READY verdi. Docker CLI bu ortamda yok; Docker Compose çalıştırma kolu canlı doğrulanmadı.

## Gerçek HTTP

- İlk canlı PostgreSQL smoke: health 200; candidate/project/need create 201 ve GET 200; public GitHub → rule_based analiz 27 evidence; Python/FastAPI gerekli + Docker tercih için skor 80.
- Son backend ile beş kategorinin create/list/get/PATCH/DELETE işlemleri; declared_only → linked; kullanıcı verified atama girişiminin 422 reddi; allowed CORS 200 / disallowed CORS 400; 1 MiB üstünde 413 doğrulandı.
- İlk canlı analizden DB'de saklanmış gerçek GitHub kanıtları, yeni hackathon kaydıyla eşleştirildi: Python required + hackathon preferred, skor 100. Bu kontrolde tekrar GitHub fetch yapılmadı; response veya kanıt uydurulmadı.

## Frontend quality gate

`npm run lint`: başarılı, uyarı/hata yok. `npm test`: **11 passed**. `npm run build`: TypeScript dahil başarılı production build. `npm audit` ve `npm audit --omit=dev`: **0 vulnerability**. OpenAPI JSON backend'le eşit; types:generate öncesi/sonrası dosya SHA256 aynı.

Gerçek ProfileCard bileşeninde script/img-onerror girdileri escaped text; unsafe href üretilmiyor. Profile API list/PATCH/204 DELETE ve HTTPS kontrolleri test edildi. `git diff --check` başarılı.

## Browser QA

Gerçek PostgreSQL + son backend (127.0.0.1:8000) + production Next (127.0.0.1:3001). CORS yalnız bu test origin'i için process environment'ta açık. 3000'deki eski süreç bu testin sunucusu olarak kullanılmadı.

1. “Demoyu sıfırla” → açık onay → aday → proje oluşturuldu.
2. Education, certification, hackathon, community ve event formlarıyla kayıt oluşturuldu.
3. Eğitimde ongoing / 3. sınıf, hackathonda participant, toplulukta technology / organizer / responsibility, etkinlikte volunteer doğru gösterildi.
4. Kaynaksız kayıt “Beyan”, HTTPS bağlantılı kayıt “Kaynak bağlantısı mevcut” olarak göründü. Provider verified iddiası yok.
5. Sertifika açıklamasındaki `<script>` içeriği çalışmadan görünür metin olarak kaldı.
6. Etkinlik düzenlendi, kartta yeni başlık görüldü; açık silme onayından sonra listeden kalktı. Reload sonrası diğer dört kayıt korundu.
7. İhtiyaç: Python/FastAPI required; hackathon/teknoloji topluluğu preferred. Teknik analizi olmayan bu adayda required coverage 0, preferred coverage 1, skor **20**. Teknik kriterler unmatched, profil kriterleri doğru kaynak ailesi ve linked açıklamasıyla matched.
8. Desktop **1440×1000**, mobile **390×844** görsel kontrol edildi. Profil ve eşleşme ekranlarında horizontal overflow yok; duplicate DOM id listesi boş. Select stili ve label/id çakışması düzeltildi.
9. `prefers-reduced-motion` animation/transition/scroll kuralları kod seviyesinde korundu. OS düzeyinde reduced-motion emülasyonu bu browser aracında yok; görsel emülasyon yapıldığı iddia edilmez.

Yerel ekran görüntüleri ignored `work/profile-desktop.png`, `work/profile-mobile.png`, `work/profile-match-mobile.png` içinde. Bunlar kullanıcı kaynak doğrulaması veya canlı provider kanıtı değildir.

## External provider sınırları

İlk canlı GitHub/PostgreSQL smoke başarılıdır. Sonraki browser analiz çağrısı anonim GitHub kotası 0 olduğu için GITHUB_FETCH_FAILED ile reddedildi. Rate-limit kontrolünde remaining=0 görüldü; kota doluyken tekrar tekrar analiz çağrılmadı. Bu external limit application bug olarak sınıflandırılmadı. Browser'da yeni teknik analiz başarılıymış gibi gösterilmedi.

Gemini: **BLOCKED_BY_MISSING_KEY**. Rule-based ve mocked structured OpenAI/Gemini regresyonları geçti. Canlı Gemini E2E kullanıcı ortamında ayrıca yapılmalıdır.

## Güvenlik sonucu

pip-audit: **32 dependency, 0 advisory**. Uygulama dosyalarında secret pattern bulgusu yok. Auth/authorization/IDOR ve rate limiting **HIGH / OPEN** production blocker. İnceleme sonucu yalnız **SAFE_FOR_CONTROLLED_DEMO** kapsamındadır.
