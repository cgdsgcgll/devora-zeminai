export function LoadingState({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <p>İşlem sürüyor. Tamamlandığında sonuç burada görünecek.</p>
      </div>
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
      <p>{message}</p>
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
