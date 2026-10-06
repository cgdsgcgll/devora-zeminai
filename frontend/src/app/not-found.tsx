"use client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
import Link from "next/link";
export default function NotFound() {
  useLocale();

  return (
    <section className="empty">
      <p className="eyebrow">404</p>
      <h1>{t("m170")}</h1>
      <p>{t("m171")}</p>
      <Link className="button" href="/">
        {t("m172")}
      </Link>
    </section>
  );
}
