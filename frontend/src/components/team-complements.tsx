"use client";
import { useRef, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";
import { Sources } from "./evidence-sources";

export function TeamComplements({
  needId,
  anonymous,
  selected,
  team,
  onAdd,
}: {
  needId: string;
  anonymous: boolean;
  selected: string[];
  team: Model<"TeamCoverage">;
  onAdd: (id: string) => void;
}) {
  useLocale();
  const [response, setResponse] = useState<Model<"TeamComplements">>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const gaps = team.criteria.filter((c) => !c.supporters.length);
  if (!gaps.length) return <p className="small">{t("complementFull")}</p>;
  if (selected.length >= 4)
    return <p className="small">{t("complementLimit")}</p>;
  if (selected.length < 2) return null;
  return (
    <section aria-label={t("showComplements")}>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(true);
          setError("");
          try {
            setResponse(await api.teamComplements(needId, selected, anonymous));
          } catch (e) {
            setResponse(undefined);
            setError(userError(e));
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        {t("showComplements")}
      </button>
      {busy && <p role="status">{t("m123")}</p>}
      {error && <p role="alert">{error}</p>}
      {response && (
        <div aria-live="polite">
          <p className="small">{t("complementOrder")}</p>
          {!response.candidates.length && <p>{t("complementNone")}</p>}
          {response.candidates.map((c) => (
            <article className="criterion" key={c.candidate_id}>
              <h3>
                {anonymous
                  ? `${t("m252")} #${c.candidate_id.slice(0, 8)}`
                  : c.label}
              </h3>
              <p>
                {t("complementCloses")}{" "}
                {c.closes.map((g) => g.label).join(" · ")}
              </p>
              <p>
                {t("closesRequired")}: +{c.closes_required_count} ·{" "}
                {t("closesPreferred")}: +{c.closes_preferred_count}
              </p>
              <p>
                {t("requiredCriteria")}:{" "}
                {Math.round(team.required_coverage * 100)}% →{" "}
                {Math.round(c.resulting_required_coverage * 100)}%
              </p>
              <p>
                {t("preferredCriteria")}:{" "}
                {Math.round(team.preferred_coverage * 100)}% →{" "}
                {Math.round(c.resulting_preferred_coverage * 100)}%
              </p>
              <details>
                <summary>{t("complementEvidence")}</summary>
                {c.closes.map((g) => (
                  <div key={g.criterion_id}>
                    <strong>{g.label}</strong>
                    <Sources items={g.sources} />
                  </div>
                ))}
              </details>
              <button
                className="button secondary"
                disabled={
                  selected.length >= 4 || selected.includes(c.candidate_id)
                }
                onClick={() => onAdd(c.candidate_id)}
              >
                {t("addToTeam")}
              </button>
            </article>
          ))}
          <p className="small">{t("complementNote")}</p>
        </div>
      )}
    </section>
  );
}
