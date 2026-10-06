"use client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
import Link from "next/link";
export default function Home() {
  useLocale();

  return (
    <>
      <section className="landing-hero">
        <p className="eyebrow">{t("m173")}</p>
        <h1>
          {t("m174")} <br className="desktop-break" />
          <span>{t("m175")}</span>
        </h1>
        <p className="lead">{t("m176")}</p>
        <div className="hero-actions">
          <Link className="button" href="/kayit?role=candidate">
            {t("m177")}
          </Link>
          <Link className="button secondary" href="/kayit?role=institution">
            {t("m178")}
          </Link>
        </div>
      </section>
      <section className="story-section" aria-labelledby="story-title">
        <div className="section-heading">
          <p className="eyebrow">{t("m179")}</p>
          <h2 id="story-title">{t("m180")}</h2>
          <p className="muted">{t("m181")}</p>
        </div>
        <ol className="evidence-story">
          {[
            [t("m182"), t("m183"), t("m184")],
            [t("m185"), t("m186"), t("m187")],
            [t("m188"), t("m189"), t("m190")],
          ].map(([label, title, body], i) => (
            <li key={label}>
              <span className="story-index">0{i + 1}</span>
              <p className="story-label">{label}</p>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="evidence-feature" aria-labelledby="evidence-title">
        <div>
          <p className="eyebrow">{t("m191")}</p>
          <h2 id="evidence-title">
            {t("m192")}
            <br />
            {t("m193")}
          </h2>
          <p className="lead">{t("m194")}</p>
          <p className="small">{t("m195")}</p>
        </div>
        <div className="evidence-example">
          <p className="example-caption">{t("m196")}</p>
          <div>
            <span className="evidence-marker" aria-hidden="true" />
            <div>
              <h3>{t("m197")}</h3>
              <p>{t("m198")}</p>
            </div>
          </div>
          <div>
            <span className="evidence-marker filled" aria-hidden="true" />
            <div>
              <h3>{t("m199")}</h3>
              <p>{t("m200")}</p>
            </div>
          </div>
          <p className="small">{t("m201")}</p>
        </div>
      </section>
      <section className="entry-paths" aria-label={t("m202")}>
        <article>
          <p className="eyebrow">{t("m203")}</p>
          <h2>{t("m204")}</h2>
          <p>{t("m205")}</p>
          <Link href="/kayit?role=candidate">
            {t("m206")}
            <span aria-hidden="true">→</span>
          </Link>
        </article>
        <article>
          <p className="eyebrow">{t("m207")}</p>
          <h2>{t("m208")}</h2>
          <p>{t("m209")}</p>
          <Link href="/kayit?role=institution">
            {t("m210")}
            <span aria-hidden="true">→</span>
          </Link>
        </article>
      </section>
    </>
  );
}
