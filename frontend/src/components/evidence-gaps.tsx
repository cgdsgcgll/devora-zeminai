"use client";
import { t, tx } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";

export function EvidenceGaps({ matchId }: { matchId: string }) {
  useLocale();

  const [response, setResponse] = useState<Model<"GapSummary">>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .gaps(matchId)
      .then((data) => {
        if (active) {
          setResponse(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(userError(e));
      });
    return () => {
      active = false;
    };
  }, [matchId, retry]);
  return (
    <section className="result-section">
      <h2>{t("m266")}</h2>
      <p>{t("m267")}</p>
      {error && (
        <div role="alert">
          <p>{tx(error)}</p>
          <button
            className="button secondary"
            onClick={() => setRetry((v) => v + 1)}
          >
            {t("m268")}
          </button>
        </div>
      )}
      {!response && !error && <p role="status">{t("m269")}</p>}
      {response?.items
        .filter((item) => item.state !== "strength")
        .map((item) => (
          <article className="criterion missing" key={item.criterion_id}>
            <h3>
              {item.label} ·{" "}
              {item.priority === "required" ? t("m130") : t("m131")}
            </h3>
            <p>{item.explanation}</p>
            <p>{item.next_step}</p>
          </article>
        ))}
      {response &&
        response.items.every((item) => item.state === "strength") && (
          <p>{t("m270")}</p>
        )}
    </section>
  );
}
