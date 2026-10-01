"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty" role="alert">
      <h1>Sayfa gösterilemedi.</h1>
      <p>
        Demo kayıtlarınız backend’de korunur. Sayfayı yeniden deneyebilirsiniz.
      </p>
      <button className="button" onClick={reset}>
        Yeniden dene
      </button>
    </section>
  );
}
