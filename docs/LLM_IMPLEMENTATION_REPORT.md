# ZeminAI v0.2 — 30 Eylül 2026

## Doğrulanan önceki durum

Yeni çalışma klasörü `C:\Users\yqt_1\OneDrive\Belgeler\ChatGPT\ZeminAI` başlangıçta yalnızca boş,
commit içermeyen bir `.git` dizini içeriyordu. Önceki gerçek backend teslimi eski çalışma klasöründe bulundu.
Kaynaklar, testler ve migration'lar bu klasöre kopyalandı; `.git`, sanal ortam, cache ve geçici DB aktarılmadı.
Önceki uygulama sıfırdan yeniden yazılmadı. GitHub fetch modülü ve requirements dosyası değiştirilmedi.

Önceki 45 test yeniden çalıştırıldı ve geçti. İlk denemede pytest'in sistem temp dizininde izin hatası oluştu;
workspace altında ayrı `--basetemp` dizini kullanılarak giderildi. Kodda preferred-only durumda coverage=1 ve
80 taban puan davranışı doğrulandı. LLM arayüzüne hazırlık vardı, gerçek provider çağrısı yoktu.

## Düzeltilen matching davranışı

| Kriter grupları | Formül |
|---|---|
| Required + preferred | `100 * (0.80 * requiredCoverage + 0.20 * preferredCoverage)` |
| Yalnız required | `100 * requiredCoverage` |
| Yalnız preferred | `100 * preferredCoverage` |
| Hiç kriter yok | HTTP 422 `MATCHING_FAILED` |

Eksik grup coverage=0 olur. Üç preferred kriterde 0/1/3 eşleşme: 0/33.333333/100.
Yeni sürüm `evidence-coverage-v0.2`. Skor sürümü DB'de String olduğu için skor için migration gerekmiyor.
Pydantic yanıt sözleşmesi hem v0.1 hem v0.2'yi kabul ediyor. Eski sonuçlar yeniden hesaplanmıyor.
`observed` filtresi ve strength'in skora çarpan olmaması korunuyor.

## Eklenen LLM mimarisi

`LLMProvider.generate_structured` → OpenAI Responses REST adapter → project/need analyzer →
Pydantic strict çıktı doğrulaması → kaynak doğrulaması → mevcut domain modelleri ve persistence.

Provider yalnızca talimat, context ve JSON Schema alır; domain veya SQLAlchemy modelleri yönetmez.
Mevcut `httpx` kullanıldığı için yeni SDK/requirements bağımlılığı eklenmedi.
Responses isteği `text.format` içinde `json_schema`, `strict=true` ve `store=false` içerir.
Model sadece environment'tan gelir. Gerçek API cevabı incomplete/refusal/malformed yönünden kontrol edilir.

Resmi sözleşme: https://developers.openai.com/api/docs/guides/structured-outputs

`rule_based` ve `openai` açık modlardır. Eksik key/model veya bilinmeyen provider sessiz fallback yapmaz.
Hatalar: LLM_NOT_CONFIGURED (503), LLM_TIMEOUT (504), LLM_PROVIDER_ERROR (502),
INVALID_MODEL_OUTPUT (502), ANALYSIS_FAILED (mevcut domain hatası).
Timeout/network/429/5xx için en fazla iki ek deneme vardır. Geçersiz model çıktısı otomatik yeniden denenmez.
Provider'ın ham hata metni veya key API cevabına yazılmaz.

## Project analysis akışı

Mevcut `POST /projects/{project_id}/analyze` korunur. GitHub fetch → kaydedilen snapshot → sınırlı LLM context →
doğrulanmış evidence → completed run. Hatalarda snapshot korunur, run failed olur; fake evidence oluşturulmaz.

- Toplam context 24000 UTF-8 baytıyla sınırlı; dosya başına 2500 bayt ve en fazla 30 dosya.
- Bu muhafazakâr byte bütçesidir, model tokenizer'ıyla kesin token sayımı değildir; schema/system overhead ayrıca vardır.
- Modelin kaynak yolu ve alıntısı gönderilen içerikle birebir kontrol edilir; source_url backend tarafından atanır.
- README/açıklama yalnız declared_only/weak; dependency tek başına en fazla medium; dil metadata'sı weak.
- Etiket/anahtar normalizasyonu ve muhafazakâr sözcüksel beceri desteği kontrol edilir.
- Repository metni talimat olarak uygulanmaz; prompt'ta açık untrusted-data sınırı vardır.
- Contributor aidiyeti ve skill proficiency iddiası yoktur.

## Need analysis akışı

`POST /needs` korunur. Description, role ve expected output LLM'e gider.
Her kriterde required/preferred, reason ve tam kaynak alıntısı istenir.
Kaynakta olmayan alıntı/beceri reddedilir; generic backend ihtiyacından Python/Docker/AWS üretilmez.
Belirsiz durumlar uncertainties/boş kriter listesiyle ifade edilebilir. Boş listeyle matching 422 verir.
Açık criteria listesi LLM'den önceliklidir ve eksik API key olsa da kullanılabilir.

## Yeni/değişen dosyalar

Yeni:

- `backend/app/services/llm/base.py`, `openai_provider.py`, `__init__.py`.
- `backend/app/services/analysis/context.py`, `factory.py`, `llm_analyzers.py`, `llm_schemas.py`.
- `backend/app/core/skills.py`.
- `backend/migrations/versions/6b02_llm_metadata.py`.
- `backend/tests/test_llm.py`, `test_llm_api.py`.
- `backend/scripts/smoke_llm.py` ve bu rapor.

Güncellenen:

- Matching scorer; Pydantic domain şemaları; SQLAlchemy domain modelleri.
- Config, API dependency seçimi, workflows ve rule analyzer metadata'sı.
- Matching/migration testleri ve test config izolasyonu.
- `.env.example`, `.gitignore`, README; eski rapora tarihsel sürüm notu.

Metadata migration'ı `analysis_runs` tablosuna nullable provider/model/commit_sha;
`need_criteria` tablosuna nullable reason ekler. Eski kayıtlar null metadata ile korunur.
Aktivasyon: `backend/` içinde `python -m alembic upgrade head`.

## Environment variables

```env
LLM_PROVIDER=rule_based
LLM_MODEL=
LLM_API_KEY=
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=2
LLM_MAX_INPUT_BYTES=24000
LLM_MAX_OUTPUT_TOKENS=4000
```

OpenAI için provider=openai, model=hesabınızda desteklenen structured-output modeli ve key gerekir.
Anahtar değerleri raporlanmadı, kaynak koda veya DB'ye kaydedilmedi. Mevcut DATABASE_URL/GITHUB_TOKEN korunur.

## Test sonuçları

Python 3.12 ve mevcut dependency ortamıyla gerçekten çalıştırılan kontroller:

| Komut/kontrol | Sonuç |
|---|---|
| Önceki suite: `python -m pytest -q --basetemp=../work/baseline-verified` | 45 passed |
| Son SQLite suite: `python -m pytest -q --basetemp=../work/pytest-final-sqlite-96` | 96 passed |
| TEST_DATABASE_URL ile aynı suite, ayrı basetemp | PostgreSQL 18.6: 96 passed |
| `python -m compileall -q app tests migrations scripts` | Başarılı |
| `python -m pip check` | No broken requirements found |
| PostgreSQL `python -m alembic upgrade head` | Başarılı |
| PostgreSQL `downgrade 5aacc06c939c`, tekrar `upgrade head` | Başarılı |
| `python -m alembic check` | No new upgrade operations detected |
| `git diff --check` | Hata yok; boş Git index nedeniyle kaynaklar ayrıca whitespace tarandı |
| Eksik key ile `from app.main import app` ve OpenAPI üretimi | ZeminAI; 13 path |

Önceki 45 test korundu; matching'deki yanlış beklenen taban puan/sürüm güncellendi, 51 test eklendi.
Tek uyarı önceki Starlette/AnyIO deprecation uyarısıdır. Unit/API testlerinde gerçek ağ çağrısı zorunlu değildir.
PostgreSQL için mevcut kullanıcının veritabanına dokunmadan ayrı geçici cluster kullanıldı.

## Gerçek LLM smoke test durumu

`python scripts/smoke_llm.py` çalıştırıldı ve `SKIPPED` döndü.
LLM_API_KEY ve LLM_MODEL yapılandırılmamıştı. Gerçek OpenAI çağrısı yapılmadı; live smoke başarılı sayılmadı.
Anahtar eklendiğinde script iki gerçek structured-output çağrısıyla proje/need semantiğini doğrular.

## Bilinen eksikler

- Canlı OpenAI servis/model uyumluluğu ve kalite eval'leri henüz doğrulanmadı.
- Kaynak eşleştirme sözcükseldir; yanlış negatifler olabilir, alıntı kodun çalıştığını kanıtlamaz.
- Prompt injection önlemleri ve structured output tek başına semantik doğruluk garantisi değildir.
- Metadata'da configured model adı saklanır; model alias'ının provider tarafından çözülmüş snapshot sürümü ayrı saklanmaz.
- Kesin tokenizer hesabı, background job, auth/tenant izolasyonu, contributor attribution ve full account import yok.
- Frontend'e başlanmadı. Git commit/push/PR yapılmadı; değişiklikler yeni yerel çalışma klasöründedir.

## Sonraki önerilen adım

API key ve model yapılandırıp manuel canlı smoke testini çalıştırın; ardından gerçek proje/ihtiyaç örneklerinden
kaynak doğruluğu, yanlış required kriterler ve eksik kanıtlar için küçük bir değerlendirme seti oluşturun.
