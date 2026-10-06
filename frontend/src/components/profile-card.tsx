"use client";
import { t, interpolate, formatDate } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
import type { ProfileEvidence } from "../lib/api/client";
import {
  categoryLabels,
  outputLabels,
  participationLabels,
  safeProfileSource,
  verificationLabels,
} from "../lib/profile";

export function ProfileCard({ item }: { item: ProfileEvidence }) {
  useLocale();

  const source = safeProfileSource(item.source_url);
  const meta = item.metadata_json;
  return (
    <article className="evidence-card profile-card">
      <p className="eyebrow">{categoryLabels[item.category]}</p>
      <div className="card-heading">
        <h3>{item.title}</h3>
        <span
          className={`badge ${item.verification_status === "verified" ? "observed" : "declared_only"}`}
        >
          {verificationLabels[item.verification_status]}
        </span>
      </div>
      {item.organization && (
        <p className="profile-organization">{item.organization}</p>
      )}
      {item.role && (
        <p className="meta">
          {t("m234")}
          {item.role}
        </p>
      )}
      {(item.started_at || item.ended_at) && (
        <p className="meta">
          {(item.started_at && formatDate(item.started_at)) || t("m322")} →{" "}
          {(item.ended_at && formatDate(item.ended_at)) ||
            (meta?.status === "ongoing" ? t("ongoing") : t("m323"))}
        </p>
      )}
      {meta?.output_type && <p>{outputLabels[meta.output_type]}</p>}
      {meta?.program && <p>{meta.program}</p>}
      {meta?.focus && (
        <p className="meta">
          {t("m324")}
          {meta.focus === "technology" ? t("technology") : t("m325")}
        </p>
      )}
      {meta?.education_type && (
        <p className="meta">
          {
            {
              degree: t("m326"),
              course: t("course"),
              bootcamp: "Bootcamp",
              other: t("m325"),
            }[meta.education_type]
          }
        </p>
      )}
      {meta?.status && (
        <p className="meta">
          {
            {
              ongoing: t("ongoing"),
              completed: t("m327"),
              left: t("m328"),
            }[meta.status]
          }
          {meta.student_year
            ? " · " + interpolate("year", { year: meta.student_year })
            : ""}
        </p>
      )}
      {meta?.credential_id && (
        <p className="meta break">
          {t("m329")}
          {meta.credential_id}
        </p>
      )}
      {meta?.issued_at && (
        <p className="meta">
          {t("m330")}
          {formatDate(meta.issued_at)}
          {meta.expires_at
            ? " · " +
              interpolate("expires", { date: formatDate(meta.expires_at) })
            : ""}
        </p>
      )}
      {meta?.project_name && (
        <p>
          {t("m331")}
          {meta.project_name}
        </p>
      )}
      {meta?.result && (
        <p className="meta">
          {
            {
              participant: t("m332"),
              finalist: t("finalist"),
              winner: t("m333"),
            }[meta.result]
          }
        </p>
      )}
      {meta?.participation_type && (
        <p className="meta">
          {t("m334")}
          {participationLabels[meta.participation_type]}
        </p>
      )}
      {meta?.responsibility && <p>{meta.responsibility}</p>}
      {item.description && (
        <p className="profile-description">{item.description}</p>
      )}
      <div className="source">
        {source ? (
          <a href={source} target="_blank" rel="noopener noreferrer">
            {item.source_label || t("m099")} ↗
            <span className="sr-only">{t("m235")}</span>
          </a>
        ) : (
          <span>{t("m318")}</span>
        )}
      </div>
      <p className="small">
        {item.verification_status === "linked"
          ? t("m335")
          : item.verification_status === "declared_only"
            ? t("m336")
            : t("m337")}
      </p>
    </article>
  );
}
