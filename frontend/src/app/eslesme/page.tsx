"use client";
import { t } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";

import { useEffect, useState } from "react";
import { api, userError, type Match } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { Empty, PageHeader } from "@/components/ui";
import { MatchResult } from "@/components/match-result";
export default function MatchPage() {
  useLocale();

  const s = useSession();
  const { candidate, need, match } = s.data;
  const [anonymous, setAnonymous] = useState(true);
  const [response, setResponse] = useState<{
    key: string;
    result?: Match;
    error?: string;
  }>();
  const key = `${match?.id}:${anonymous}`;
  useEffect(() => {
    let active = true;
    if (match)
      api
        .match(match.id, anonymous)
        .then((result) => {
          if (active) setResponse({ key, result });
        })
        .catch((e) => {
          if (active) setResponse({ key, error: userError(e) });
        });
    return () => {
      active = false;
    };
  }, [match, key, anonymous]);
  const result = response?.key === key ? response.result : undefined;
  return (
    <div className="match-page">
      <PageHeader step={t("m052")} title={t("m053")}>
        {t("m054")}
      </PageHeader>
      {!candidate || !need ? (
        <Empty title={t("m055")} href="/kesif" action={t("m056")}>
          {t("m057")}
        </Empty>
      ) : (
        <>
          <label className="team-select">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            {t("m058")}
          </label>
          <p className="small">{t("m059")}</p>
          <div className="match-toolbar">
            <strong>
              {result?.candidate_label ||
                (anonymous ? "#" + candidate.id.slice(0, 8) : t("m060"))}
            </strong>
            <button
              className="button secondary"
              disabled={!!s.busy}
              onClick={() =>
                void s.act(t("m061"), async () =>
                  s.saveMatch(
                    await api.createMatch(
                      { candidate_id: candidate.id, need_id: need.id },
                      anonymous,
                    ),
                  ),
                )
              }
            >
              {t("m062")}
            </button>
          </div>
          {response?.key === key && response.error && (
            <p role="alert">{response.error}</p>
          )}
          {match && !result && !response?.error && (
            <p role="status">{t("m063")}</p>
          )}
          {result && <MatchResult result={result} />}
        </>
      )}
    </div>
  );
}
