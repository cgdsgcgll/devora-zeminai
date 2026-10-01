import Link from "next/link";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">KANIT → BECERİ → KRİTER → EŞLEŞME</p>
          <h1>
            Yetenek beyanının
            <br />
            ötesine bakın.
          </h1>
          <p className="hero-subtitle">
            Doğrulanabilir Yetenek ve
            <br />
            Akıllı Eşleşme Platformu
          </p>
          <p className="lead">
            Ne ürettiğinizi, ne öğrendiğinizi ve nerelerde katkı verdiğinizi
            görünür kılın. Kurum ihtiyaçlarıyla uyumu, her kriterin dayanağını
            görerek değerlendirin.
          </p>
          <Link className="button" href="/aday">
            Demoyu başlat <span aria-hidden="true">↗</span>
          </Link>
          <p className="small">
            GitHub teknik kanıtları · Eğitim · Sertifika · Hackathon · Topluluk
          </p>
        </div>
        <div
          className="hero-diagram"
          aria-label="Kaynak kanıtından açıklanabilir eşleşmeye giden kavramsal akış"
        >
          <div className="diagram-top">
            <span className="eyebrow">DEĞERLENDİRMENİN TEMELİ</span>
            <span aria-hidden="true">↗</span>
          </div>
          <div className="diagram-row">
            <span className="diagram-number">01</span>
            <div>
              <strong>Kaynak</strong>
              <p>Proje · öğrenme · deneyim · katkı</p>
            </div>
          </div>
          <div className="diagram-row">
            <span className="diagram-number">02</span>
            <div>
              <strong>Kanıt</strong>
              <p>Ne gözlemlendi? Nereden biliyoruz?</p>
            </div>
          </div>
          <div className="diagram-row accent">
            <span className="diagram-number">03</span>
            <div>
              <strong>Açıklanabilir uyum</strong>
              <p>Kriterler ve onları destekleyen kaynaklar</p>
            </div>
          </div>
          <p className="diagram-note">
            Bir sonuçtan fazlası: sonucun dayanağı.
          </p>
        </div>
      </section>
      <section className="home-process">
        <div className="section-heading">
          <p className="eyebrow">ÜÇ ADIMDA</p>
          <h2>
            Profilinizin anlattığını
            <br />
            ihtiyaçla buluşturun.
          </h2>
        </div>
        <div className="process-grid">
          {[
            [
              "01",
              "Profilini görünür kıl",
              "GitHub projelerinizi analiz edin; eğitim, sertifika, hackathon ve topluluk kayıtlarınızı ekleyin.",
            ],
            [
              "02",
              "İhtiyacı yapılandır",
              "Aradığınız becerileri gerekli ve tercih edilen kriterlere dönüştürün.",
            ],
            [
              "03",
              "Uyumu incele",
              "Skoru, karşılanan kriterleri ve kaynak kanıtlarını birlikte görün.",
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span className="eyebrow">{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <aside className="home-note">
        <strong>Skor bir işe alınma olasılığı değildir.</strong>
        <p>
          Eşleşme, açık ihtiyaç kriterleri ile ilgili kaynakların uyumunu
          gösterir. Profil bağlantıları bağımsız doğrulama değildir. Okul
          prestiji veya kayıt sayısı bonus getirmez.
        </p>
      </aside>
    </>
  );
}
