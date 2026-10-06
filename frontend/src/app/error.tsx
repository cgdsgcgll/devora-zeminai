"use client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  useLocale();

  return (
    <section className="empty" role="alert">
      <h1>{t("m049")}</h1>
      <p>{t("m050")}</p>
      <button className="button" onClick={reset}>
        {t("m051")}
      </button>
    </section>
  );
}
