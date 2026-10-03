export function LoadingState({
  label,
  skeleton = false,
}: {
  label: string;
  skeleton?: boolean;
}) {
  return (
    <div
      className={skeleton ? "loading loading-skeleton" : "loading"}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <p>İşlem sürüyor. Tamamlandığında sonuç burada görünecek.</p>
      </div>
      {skeleton && (
        <div className="skeleton-grid" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <div className="skeleton-card" key={n}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuccessNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="success-notice" role="status" aria-live="polite">
      <span className="success-icon" aria-hidden="true">
        ✓
      </span>
      <div className="notice-copy">
        <strong>İşlem tamamlandı</strong>
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="notice-dismiss"
          onClick={onDismiss}
          aria-label="Bildirimi kapat"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function ProcessingState({
  kind,
}: {
  kind: "project" | "need" | "match";
}) {
  const copy = {
    project: [
      "Proje kanıtları inceleniyor",
      "Kaynak dosyalar ve proje açıklamaları teknik kullanım sinyalleri için değerlendiriliyor.",
    ],
    need: [
      "İhtiyacınız yapılandırılıyor",
      "Gerekli ve tercih edilen kriterler, verdiğiniz ihtiyaç metnine dayanarak hazırlanıyor.",
    ],
    match: [
      "Kanıt uyumu hesaplanıyor",
      "Bu ihtiyaç için kriterler ve ilgili kaynak dayanakları karşılaştırılıyor.",
    ],
  }[kind];
  return (
    <section className="processing-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <p className="small">
        İşlem tamamlandığında sonuç burada görünecek. Sayfayı açık
        tutabilirsiniz.
      </p>
    </section>
  );
}
export function ButtonProgress({ active }: { active: boolean }) {
  return active ? (
    <span className="spinner button-spinner" aria-hidden="true" />
  ) : null;
}
