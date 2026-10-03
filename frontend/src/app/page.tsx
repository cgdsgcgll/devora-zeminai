import Link from "next/link";
export default function Home() {
  return (
    <>
      <section className="landing-hero">
        <p className="eyebrow">Kanıta dayalı yetenek profili</p>
        <h1>
          Ne ürettiğinizi,
          <br className="desktop-break" /> ne öğrendiğinizi ve nerelerde katkı
          verdiğinizi <span>görünür kılın.</span>
        </h1>
        <p className="lead">
          Profesyonel hikâyenizi projeleriniz ve deneyimlerinizle anlatın.
          <br className="desktop-break" /> İhtiyaçlarla ilişkiniz,
          dayanaklarıyla anlaşılsın.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/kayit?role=candidate">
            Aday olarak başla
          </Link>
          <Link className="button secondary" href="/kayit?role=institution">
            Kurum olarak başla
          </Link>
        </div>
      </section>
      <section className="story-section" aria-labelledby="story-title">
        <div className="section-heading">
          <p className="eyebrow">NASIL ÇALIŞIR?</p>
          <h2 id="story-title">Bir sonuç. Açık bir dayanak.</h2>
          <p className="muted">
            Deneyiminizden ihtiyaca uzanan, izlenebilir bir bağ.
          </p>
        </div>
        <ol className="evidence-story">
          {[
            [
              "Beyan",
              "Hikâyenizi anlatın.",
              "Projelerinizi, eğitiminizi ve katkılarınızı bir araya getirin.",
            ],
            [
              "Kanıt",
              "Kaynağını görün.",
              "Bir bağlantı, bir beyan ve gözlemlenen kullanım ayrı gösterilir.",
            ],
            [
              "İhtiyaç",
              "Beklentiyi netleştirin.",
              "Gerekli ve tercih edilen kriterleri kendi cümlelerinizle tanımlayın.",
            ],
            [
              "Açıklanabilir eşleşme",
              "İlişkiyi inceleyin.",
              "Hangi kriterin hangi kaynakla desteklendiğini görün.",
            ],
          ].map(([label, title, body], i) => (
            <li key={label}>
              <span className="story-index">0{i + 1}</span>
              <p className="story-label">{label}</p>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="evidence-feature" aria-labelledby="evidence-title">
        <div>
          <p className="eyebrow">AYRINTI FARK YARATIR</p>
          <h2 id="evidence-title">
            Bir teknoloji adı.
            <br />
            İki farklı dayanak.
          </h2>
          <p className="lead">
            Bir README’de yazanla kaynak dosyasında gözlemlenen aynı şey
            değildir. ZeminAI bu ayrımı görünür tutar.
          </p>
          <p className="small">
            Aşağıdaki örnek kavramsaldır; bir adaya ait analiz sonucu değildir.
          </p>
        </div>
        <div className="evidence-example">
          <p className="example-caption">ÖRNEK / PYTHON</p>
          <div>
            <span className="evidence-marker" aria-hidden="true" />
            <div>
              <h3>“Python kullanıyorum.”</h3>
              <p>Proje açıklaması · Yalnızca beyan</p>
            </div>
          </div>
          <div>
            <span className="evidence-marker filled" aria-hidden="true" />
            <div>
              <h3>Kaynakta Python kullanımı</h3>
              <p>Kaynak dosyası · Gözlemlenen kullanım</p>
            </div>
          </div>
          <p className="small">Kanıt gücü, beceri seviyesi değildir.</p>
        </div>
      </section>
      <section className="entry-paths" aria-label="Başlangıç yolları">
        <article>
          <p className="eyebrow">ADAYLAR İÇİN</p>
          <h2>Hikâyenize yer açın.</h2>
          <p>
            Projeler, eğitim, hackathonlar ve topluluk katkıları. Zaman içinde
            gelişen tek bir profil.
          </p>
          <Link href="/kayit?role=candidate">
            Profilimi oluşturmaya başla <span aria-hidden="true">→</span>
          </Link>
        </article>
        <article>
          <p className="eyebrow">KURUMLAR İÇİN</p>
          <h2>İhtiyaçtan başlayın.</h2>
          <p>
            Genel yargılar yerine, belirli bir ihtiyaç için hangi dayanakların
            bulunduğunu inceleyin.
          </p>
          <Link href="/kayit?role=institution">
            İhtiyacımı tanımla <span aria-hidden="true">→</span>
          </Link>
        </article>
      </section>
    </>
  );
}
