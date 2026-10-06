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
    <div className="language-switch" role="group" aria-label={t("language")}>
      {(["tr", "en"] as const).map((code) => (
        <button
          type="button"
          key={code}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
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
