"use client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Evidence, Model } from "@/lib/api/client";
import { familyLabels } from "@/lib/profile";
import {
  safeSource,
  statusLabels,
  strengthLabels,
  typeLabels,
  evidenceExplanation,
  criterionExplanation,
  presentationNote,
} from "@/lib/presentation";

export function PageHeader({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: ReactNode;
}) {
  useLocale();

  return (
    <header className="page-header">
      <p className="eyebrow">{step}</p>
      <h1>{title}</h1>
      <p className="lead">{children}</p>
    </header>
  );
}
export function Info({ children }: { children: ReactNode }) {
  useLocale();

  return <div className="callout">{children}</div>;
}
export function Notes({ title, items }: { title: string; items?: string[] }) {
  useLocale();

  return items?.length ? (
    <section className="notes">
      <h3>{title}</h3>
      <ul>
        {[...new Set(items)].map((t, i) => (
          <li key={i}>{presentationNote(t)}</li>
        ))}
      </ul>
    </section>
  ) : null;
}
export function Empty({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  useLocale();

  return (
    <section className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
      {href && (
        <Link className="button secondary" href={href}>
          {action}
        </Link>
      )}
    </section>
  );
}
export function EvidenceCard({ item }: { item: Evidence }) {
  useLocale();

  const source = safeSource(item.source_url);
  return (
    <article className="evidence-card">
      <div className="card-heading">
        <h3>{item.skill_label}</h3>
        <span className={`badge ${item.evidence_status}`}>
          {statusLabels[item.evidence_status]}
        </span>
      </div>
      <p className="meta">
        {strengthLabels[item.evidence_strength]}{" "}
        <span aria-hidden="true">·</span> {typeLabels[item.evidence_type]}
      </p>
      <p>{evidenceExplanation(item.evidence_status)}</p>
      <div className="source">
        {source ? (
          <a href={source} target="_blank" rel="noopener noreferrer">
            {item.path || t("m408")} <span aria-hidden="true">↗</span>
            <span className="sr-only">{t("m235")}</span>
          </a>
        ) : (
          <span>{item.path || t("m318")}</span>
        )}
      </div>
      <details>
        <summary>{t("m409")}</summary>
        <pre>{item.excerpt || t("m410")}</pre>
        <Notes title={t("m411")} items={item.limitations} />
      </details>
    </article>
  );
}
export function CriterionCard({ item }: { item: Model<"NeedCriterion"> }) {
  useLocale();

  return (
    <article className="criterion">
      <div className="card-heading">
        <h3>{item.skill_label}</h3>
        <span className="badge">
          {item.priority === "required" ? t("m130") : t("m131")}
        </span>
      </div>
      <p>{criterionExplanation(item.priority)}</p>
      <p className="meta">
        {t("m412")}
        {familyLabels[item.kind || "technical_skill"]}
      </p>
    </article>
  );
}
