"use client";
import { t, tx } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";

import Link from "next/link";
import { discoveryPreview } from "@/lib/visual-summary";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { PageHeader, Notes, Empty } from "@/components/ui";
import { LoadingState } from "@/components/feedback";
import { sourceLabels } from "@/lib/profile";
import { Sources } from "@/components/evidence-sources";
import { TeamComplements } from "@/components/team-complements";

function DiscoveryView({
  needId,
  anonymous,
}: {
  needId: string;
  anonymous: boolean;
}) {
  useLocale();

  const session = useSession();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: Model<"Discovery">;
    error?: string;
  }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [teamResponse, setTeamResponse] = useState<{
    key: string;
    data?: Model<"TeamCoverage">;
    error?: string;
  }>();
  const selectionKey = selected.slice().sort().join(",");
  useEffect(() => {
    let active = true;
    if (selected.length >= 2)
      api
        .team(needId, selected, anonymous)
        .then((data) => {
          if (active) setTeamResponse({ key: selectionKey, data });
        })
        .catch((e) => {
          if (active)
            setTeamResponse({ key: selectionKey, error: userError(e) });
        });
    return () => {
      active = false;
    };
  }, [needId, anonymous, selectionKey, selected]);
  const team =
    teamResponse?.key === selectionKey ? teamResponse.data : undefined;
  const key = `${offset}:${retry}`;
  useEffect(() => {
    let active = true;
    api
      .discovery(needId, anonymous, offset)
      .then((data) => {
        if (active) setResponse({ key, data });
      })
      .catch((e) => {
        if (active) setResponse({ key, error: userError(e) });
      });
    return () => {
      active = false;
    };
  }, [needId, anonymous, offset, key]);
  const data = response?.key === key ? response.data : undefined;
  const error = response?.key === key ? response.error : undefined;
  const candidateLabel = (id: string, label?: string) =>
    anonymous
      ? `${t("m252")} #${id.slice(0, 8)}`
      : label ||
        team?.criteria
          .flatMap((c) => c.supporters)
          .find((c) => c.candidate_id === id)?.label ||
        "#" + id.slice(0, 8);
  const busy = !!session.busy;
  return (
    <>
      <div className="view-switch">
        <button
          className="button secondary"
          disabled={busy || (!data && !error)}
          onClick={() => {
            setRetry((v) => v + 1);
            setTeamResponse(undefined);
          }}
        >
          {t("m117")}
        </button>
      </div>
      <section className="team-builder" aria-label={t("m118")}>
        <h2>
          {t("m119")}
          <span className="count">{selected.length}/4</span>
        </h2>
        <div className="team-members">
          {selected.map((id) => (
            <button
              className="button secondary"
              key={id}
              onClick={() => setSelected((ids) => ids.filter((v) => v !== id))}
            >
              {candidateLabel(
                id,
                data?.candidates.find((c) => c.candidate_id === id)?.label,
              )}{" "}
              × <span className="sr-only">{t("m120")}</span>
            </button>
          ))}
        </div>
        {selected.length === 0 && <p>{t("m121")}</p>}
        {selected.length === 1 && <p>{t("m122")}</p>}
        {selected.length >= 2 && !team && (
          <p role="status">
            {(teamResponse?.key === selectionKey && teamResponse.error) ||
              t("m123")}
          </p>
        )}
        {team && (
          <div aria-live="polite" className="content-enter">
            <p>
              <strong>
                {team.matched_count}/{team.total_count}
              </strong>
              {t("m124")}
            </p>
            <p>
              {t("m125")}
              {Math.round(team.required_coverage * 100)}
              {t("m126")}
              {Math.round(team.preferred_coverage * 100)}%
            </p>
            <div
              className="team-matrix"
              tabIndex={0}
              role="region"
              aria-label={t("m127")}
            >
              <table>
                <caption>{t("m128")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("m129")}</th>
                    {selected.map((id) => (
                      <th scope="col" key={id}>
                        {candidateLabel(
                          id,
                          data?.candidates.find((c) => c.candidate_id === id)
                            ?.label,
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.criteria.map((c) => (
                    <tr key={c.criterion_id}>
                      <th scope="row">
                        {c.label}
                        <br />
                        <small>
                          {c.priority === "required" ? t("m130") : t("m131")}
                        </small>
                      </th>
                      {selected.map((id) => (
                        <td key={id}>
                          <span
                            aria-label={
                              c.supporters.some((s) => s.candidate_id === id)
                                ? t("m132")
                                : t("m133")
                            }
                          >
                            {c.supporters.some((s) => s.candidate_id === id)
                              ? "✓"
                              : "—"}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {t("m134")}
              {team.criteria
                .filter((c) => !c.supporters.length)
                .map((c) => c.label)
                .join(" · ") || t("none")}
            </p>
            <TeamComplements
              key={`${needId}:${anonymous}:${selectionKey}:${retry}`}
              needId={needId}
              anonymous={anonymous}
              selected={selected}
              team={team}
              onAdd={(id) => {
                setSelected((ids) =>
                  ids.length < 4 && !ids.includes(id) ? [...ids, id] : ids,
                );
                setTeamResponse(undefined);
              }}
            />
          </div>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {tx(error)}
        </p>
      )}
      {!data && !error && <LoadingState label={t("m135")} skeleton />}
      {data && (
        <>
          <details className="disclosure">
            <summary>{t("m136")}</summary>
            <p className="small">{t("discoveryOrder")}</p>
          </details>
          {!data.candidates.length && (
            <Empty title={t("m137")} href="/aday" action={t("m138")}>
              {t("m139")}
            </Empty>
          )}
          <div className="discovery-grid content-enter">
            {data.candidates.map((candidate) => (
              <article className="discovery-row" key={candidate.candidate_id}>
                <h2>
                  {candidateLabel(candidate.candidate_id, candidate.label)}
                </h2>
                <label className="team-select">
                  <input
                    type="checkbox"
                    checked={selected.includes(candidate.candidate_id)}
                    disabled={
                      busy ||
                      (!selected.includes(candidate.candidate_id) &&
                        selected.length >= 4)
                    }
                    onChange={(e) => {
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, candidate.candidate_id]
                          : ids.filter((id) => id !== candidate.candidate_id),
                      );
                      setTeamResponse(undefined);
                    }}
                  />{" "}
                  {t("m140")}
                  {candidateLabel(candidate.candidate_id, candidate.label)}
                </label>
                <p className="discovery-score">
                  {t("m141")}{" "}
                  <strong>{Number(candidate.score.toFixed(2))}/100</strong>
                </p>
                <p>
                  {t("m142")}
                  {Math.round(candidate.required_coverage * 100)}
                  {t("m143")}
                  {Math.round(candidate.preferred_coverage * 100)}
                </p>
                <div className="criterion-preview" aria-label={t("m144")}>
                  <p>
                    <strong>{t("m145")}</strong>
                    {discoveryPreview(candidate.criteria).signals.join(" · ") ||
                      t("m146")}
                  </p>
                  <p>
                    <strong>{t("m147")}</strong>
                    {discoveryPreview(candidate.criteria).missing}
                    {t("m148")}
                  </p>
                </div>
                <details>
                  <summary>{t("m149")}</summary>
                  {candidate.criteria.map((c) => (
                    <section className="criterion" key={c.criterion_id}>
                      <h3>{c.label}</h3>
                      <p>
                        {c.matched ? t("evidenceFound") : t("m150")} ·{" "}
                        {c.priority === "required" ? t("m130") : t("m131")}
                      </p>
                      <p className="small">
                        {sourceLabels[c.family] || c.family}
                      </p>
                      <Sources items={c.sources} />
                    </section>
                  ))}
                </details>
                {
                  <div className="profile-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void session.act(t("m061"), async () => {
                          const match = await api.createMatch(
                            {
                              candidate_id: candidate.candidate_id,
                              need_id: needId,
                            },
                            anonymous,
                          );
                          session.saveCandidate({
                            id: candidate.candidate_id,
                            name: candidate.label,
                          });
                          session.saveMatch(match);
                          router.push("/eslesme");
                        })
                      }
                    >
                      {t("m151")}
                    </button>
                  </div>
                }
              </article>
            ))}
          </div>
          <div className="view-switch">
            <button
              className="button secondary"
              disabled={busy || offset === 0}
              onClick={() => {
                setOffset((v) => Math.max(0, v - 20));
                setSelected([]);
                setTeamResponse(undefined);
              }}
            >
              {t("m152")}
            </button>
            <button
              className="button secondary"
              disabled={busy || !data.has_more}
              onClick={() => {
                setOffset((v) => v + 20);
                setSelected([]);
                setTeamResponse(undefined);
              }}
            >
              {t("m153")}
            </button>
          </div>
          <Notes title={t("m154")} items={[t("discoveryNote")]} />
        </>
      )}
    </>
  );
}

export default function DiscoveryPage() {
  useLocale();

  const { data, ready, busy } = useSession();
  const [anonymous, setAnonymous] = useState(true);
  return (
    <div className="discovery-page">
      <PageHeader step={t("m155")} title={t("m156")}>
        {t("m157")}
      </PageHeader>
      {!ready ? (
        <p role="status">{t("m158")}</p>
      ) : !data.need?.criteria.length ? (
        <Empty title={t("m159")} href="/ihtiyac" action={t("m160")}>
          {t("m161")}
        </Empty>
      ) : (
        <>
          <p className="need-brief">
            <span className="eyebrow">{t("m162")}</span> {data.need.description}{" "}
            <Link href="/ihtiyac">{t("m163")}</Link>
          </p>
          <div className="discovery-controls">
            <label className="team-select">
              <input
                type="checkbox"
                checked={anonymous}
                disabled={!!busy}
                onChange={(e) => setAnonymous(e.target.checked)}
              />{" "}
              {t("m058")}
            </label>
            <details className="disclosure">
              <summary>{t("m164")}</summary>
              <p>{t("m059")}</p>
            </details>
          </div>
          <DiscoveryView
            key={`${data.need.id}:${anonymous}`}
            needId={data.need.id}
            anonymous={anonymous}
          />
        </>
      )}
    </div>
  );
}
