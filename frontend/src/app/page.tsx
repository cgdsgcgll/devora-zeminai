import Link from "next/link";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">ZEMİNAI / YAŞAYAN YETENEK PROFİLİ</p>
          <h1>
            Yaptıklarınız
            <br />
            görünür olsun.
          </h1>
          <p className="hero-subtitle">
            Her deneyimin bir yeri. Her eşleşmenin bir dayanağı.
          </p>
          <p className="lead">
            Ne ürettiğinizi, ne öğrendiğinizi ve nerelerde katkı verdiğinizi
            zaman içinde görünür kılın. Kurum ihtiyaçlarıyla uyumu, her kriterin
            dayanağını görerek değerlendirin.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/aday">
              Profilini oluştur <span aria-hidden="true">→</span>
            </Link>
            <Link className="button secondary" href="/ihtiyac">
              Kurum ihtiyacını tanımla
            </Link>
          </div>
          <p className="small">
            GitHub teknik kanıtları · Eğitim · Sertifika · Hackathon · Topluluk
          </p>
        </div>
        <div
          className="hero-diagram"
          aria-label="Kaynak kanıtından açıklanabilir eşleşmeye giden kavramsal akış"
        >
          <div className="diagram-top">
            <span className="eyebrow">BİLGİDEN DAYANAĞA</span>
            <span className="badge">Nasıl çalışır?</span>
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
