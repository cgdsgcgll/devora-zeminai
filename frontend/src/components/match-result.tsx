"use client";
import { t, interpolate, tx } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

import { useState } from "react";
import Link from "next/link";
import { api, userError, type Match, type Model } from "@/lib/api/client";
import {
  safeProfileSource,
  sourceLabels,
  provenanceLabels,
} from "@/lib/profile";
import { strengthLabels } from "@/lib/presentation";

function RequestProof({
  result,
  criterion,
}: {
  result: Match;
  criterion: Model<"CriterionMatch">;
}) {
  useLocale();

  const [title, setTitle] = useState(
    interpolate("requestTitle", { criterion: criterion.skill_label }),
  );
  const [instructions, setInstructions] = useState(t("m295"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <details className="proof-compose">
      <summary>{t("m296")}</summary>
      {done ? (
        <p role="status">
          {t("m297")}
          <Link href="/kanit-istekleri">{t("m298")}</Link>
        </p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await api.createProof({
                match_id: result.id,
                criterion_id: criterion.criterion_id,
                title,
                instructions,
              });
              setDone(true);
            } catch (e) {
              setError(userError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {t("m299")}
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {t("m300")}
            <textarea
              required
              maxLength={4000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
          {error && <p role="alert">{tx(error)}</p>}
          <button className="button" disabled={busy}>
            {busy ? t("m104") : t("m301")}
          </button>
        </form>
      )}
    </details>
  );
}

export function MatchCalculation({ result }: { result: Match }) {
  const locale = useLocale();
  const rows = [...result.matched_criteria, ...result.unmatched_criteria];
  const required = rows.filter((c) => c.priority === "required");
  const preferred = rows.filter((c) => c.priority === "preferred");
  const number = (n: number) =>
    n.toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
      maximumFractionDigits: 6,
    });
  const formula =
    required.length && preferred.length
      ? `100 × (${number(0.8)} × ${number(result.required_coverage)} + ${number(0.2)} × ${number(result.preferred_coverage)})`
      : `100 × ${number(required.length ? result.required_coverage : result.preferred_coverage)}`;
  return (
    <details className="disclosure">
      <summary>{t("howCalculated")}</summary>
      {[
        {
          label: t("requiredCriteria"),
          rows: required,
          coverage: result.required_coverage,
        },
        {
          label: t("preferredCriteria"),
          rows: preferred,
          coverage: result.preferred_coverage,
        },
      ].map((group) => (
        <p key={group.label}>
          {group.label}: {group.rows.filter((c) => c.matched).length} /{" "}
          {group.rows.length} · {number(group.coverage * 100)}%
        </p>
      ))}
      <p>
        {t("formulaLabel")}: {formula}
      </p>
      <p>
        {t("m141")}: {number(result.score)} / 100
      </p>
      <p className="small">{t("strengthNoWeight")}</p>
    </details>
  );
}

export function MatchResult({ result }: { result: Match }) {
  useLocale();

  return (
    <section className="result-section content-enter">
      <div className="score-layout">
        <div className="score-card">
          <p className="eyebrow">{t("m141")}</p>
          <h2>{t("m302")}</h2>
          <p className="score">
            {Number(result.score.toFixed(2))}
            <span>/ 100</span>
          </p>
          <p>{t("m303")}</p>
          <p className="small">{t("m304")}</p>
          <MatchCalculation result={result} />
        </div>
        <div className="score-detail">
          <h2>{t("m305")}</h2>
          <p>
            {t("m306")}
            <strong>{Math.round(result.required_coverage * 100)}%</strong>
          </p>
          <progress
            max={1}
            value={result.required_coverage}
            aria-label={t("m307")}
          />
          <p>
            {t("m308")}
            <strong>{Math.round(result.preferred_coverage * 100)}%</strong>
          </p>
          <progress
            max={1}
            value={result.preferred_coverage}
            aria-label={t("m309")}
          />
          <p className="small">{t("m310")}</p>
        </div>
      </div>
      <h2>{t("m311")}</h2>
      <p>{t("m312")}</p>
      {[...result.matched_criteria, ...result.unmatched_criteria].map((c) => (
        <article className="criterion trace-row" key={c.criterion_id}>
          <details>
            <summary>
              <strong>{c.skill_label}</strong>
              <span className="badge">
                {c.priority === "required" ? t("m130") : t("m131")}
              </span>
              <span>{c.matched ? t("m313") : t("m314")}</span>
              <span className="small">
                {Array.from(
                  new Set(
                    c.trace_items?.map(
                      (e) => sourceLabels[e.family] || e.family,
                    ),
                  ),
                ).join(" · ")}
              </span>
            </summary>
            {c.trace_available && <p className="small">{t("frozenTrace")}</p>}
            {!c.trace_available ? (
              <p>{t("m315")}</p>
            ) : !c.trace_items?.length ? (
              <p>{t("noCriterionEvidence")}</p>
            ) : (
              c.trace_items.map((e, i) => {
                const url = safeProfileSource(e.source_url);
                return (
                  <div className="trace-source" key={i}>
                    <p>
                      <strong>{provenanceLabels[e.status]}</strong> ·{" "}
                      {sourceLabels[e.family] || e.family}
                    </p>
                    {e.strength && (
                      <p className="small">{strengthLabels[e.strength]}</p>
                    )}
                    {e.summary && <p>{e.summary}</p>}
                    {e.excerpt && <blockquote>{e.excerpt}</blockquote>}
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {e.source_label || t("m099")} ↗
                      </a>
                    ) : (
                      <p className="small">
                        {result.anonymous ? t("m317") : t("m318")}
                      </p>
                    )}
                    <p>
                      {e.status === "not_found"
                        ? t("noCriterionEvidence")
                        : e.status === "declared_only" &&
                            (c.kind === "technical_skill" ||
                              c.kind === "project_experience" ||
                              !c.matched)
                          ? t("uncountedDeclaration")
                          : e.status === "observed" && c.matched
                            ? t("countedEvidence")
                            : c.matched
                              ? t("profileRecordCounted")
                              : t("noCriterionEvidence")}
                    </p>
                  </div>
                );
              })
            )}
          </details>
          {!c.matched && <RequestProof result={result} criterion={c} />}
        </article>
      ))}
    </section>
  );
}
