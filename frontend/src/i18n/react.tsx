"use client";
import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  getLocale,
  subscribeLocale,
  setLocale,
  restoreLocale,
  t,
} from "./index";
export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "tr" as const);
}
export function LocaleBridge() {
  useLayoutEffect(() => {
    try {
      setLocale(restoreLocale(window.localStorage));
    } catch {
      setLocale("tr");
    }
    delete document.documentElement.dataset.localePending;
  }, []);
  return null;
}
export function LocaleFrame({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function LanguageSwitch() {
  const locale = useLocale();
  return (
    <details
      className="language-switch"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={t("language")}>
        {locale.toUpperCase()}
        <svg
          className="utility-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          aria-hidden="true"
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </summary>
      <div
        className="utility-panel locale-panel"
        role="group"
        aria-label={t("language")}
      >
        {(["tr", "en"] as const).map((code) => (
          <button
            type="button"
            key={code}
            aria-pressed={locale === code}
            onClick={(event) => {
              setLocale(code);
              const details = event.currentTarget.closest("details");
              if (details) {
                details.open = false;
                details.querySelector("summary")?.focus();
              }
            }}
          >
            {code === "tr" ? "Türkçe" : "English"}
          </button>
        ))}
      </div>
    </details>
  );
}
export function SkipLink() {
  useLocale();
  return (
    <a href="#main" className="skip">
      {t("m166")}
    </a>
  );
}
export function Footer() {
  useLocale();
  return (
    <footer className="footer">
      <span>ZeminAI / {t("m168")}</span>
      <span>{t("m169")}</span>
    </footer>
  );
}
