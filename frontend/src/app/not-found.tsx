import Link from "next/link";
export default function NotFound() {
  return (
    <section className="empty">
      <p className="eyebrow">404</p>
      <h1>Bu sayfa bulunamadı.</h1>
      <p>Demo akışına ana sayfadan devam edebilirsiniz.</p>
      <Link className="button" href="/">
        Ana sayfaya dön
      </Link>
    </section>
  );
}
