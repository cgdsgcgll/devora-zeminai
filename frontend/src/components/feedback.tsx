"use client";
import { t, tx } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
export function LoadingState({
  label,
  skeleton = false,
}: {
  label: string;
  skeleton?: boolean;
}) {
  useLocale();

  return (
    <div
      className={skeleton ? "loading loading-skeleton" : "loading"}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>{tx(label)}</strong>
        <p>{t("m284")}</p>
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
  useLocale();

  return (
    <div className="success-notice" role="status" aria-live="polite">
      <span className="success-icon" aria-hidden="true">
        ✓
      </span>
      <div className="notice-copy">
        <strong>{t("m285")}</strong>
        <p>{tx(message)}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="notice-dismiss"
          onClick={onDismiss}
          aria-label={t("m286")}
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
  useLocale();

  const copy = {
    project: [t("m287"), t("m288")],
    need: [t("m289"), t("m290")],
    match: [t("m291"), t("m292")],
  }[kind];
  return (
    <section className="processing-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <p className="small">{t("m293")}</p>
    </section>
  );
}
export function ButtonProgress({ active }: { active: boolean }) {
  useLocale();

  return active ? (
    <span className="spinner button-spinner" aria-hidden="true" />
  ) : null;
}
