"use client";
import { t, tx, formatDate, getLocale } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";

import Link from "next/link";
import { profileHighlights } from "@/lib/visual-summary";
import { useEffect, useState } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { useSession } from "@/components/session";
import { Notes, Empty } from "@/components/ui";
import { useContentMotion } from "@/components/use-content-motion";
import { LoadingState } from "@/components/feedback";
import {
  provenanceLabels,
  participationLabels,
  sourceLabels,
  safeProfileSource,
} from "@/lib/profile";

const sections = ["m211", "m212", "m213", "m214"];

function ProfileView({ candidateId }: { candidateId: string }) {
  useLocale();

  const { ref: motionRef, transition } = useContentMotion();
  const {
    ref: resultRef,
    transition: transitionResult,
    cancel: cancelResult,
  } = useContentMotion();
  const [section, setSection] = useState("m211");
  const [focusedSection, setFocusedSection] = useState("m211");
  const [months, setMonths] = useState(0);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: Model<"LivingProfile">;
    error?: string;
  }>();
  const key = `${candidateId}:${months}:${retry}`;
  useEffect(() => {
    let active = true;
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    api
      .livingProfile(
        candidateId,
        months ? since.toISOString().slice(0, 10) : "",
      )
      .then((data) => {
        if (active)
          void transitionResult(() => {
            if (active) setResponse({ key, data });
          });
      })
      .catch((error) => {
        if (active)
          void transitionResult(() => {
            if (active)
              setResponse((previous) => ({
                key,
                data: previous?.data,
                error: userError(error),
              }));
          });
      });
    return () => {
      active = false;
      cancelResult();
    };
  }, [candidateId, months, key, transitionResult, cancelResult]);
  const data = response?.data;
  const pending = response?.key !== key;
  const error = response?.key === key ? response.error : undefined;
  return (
    <>
      <div
        className="profile-facts"
        aria-label={t("m215")}
        aria-busy={!data && !error}
      >
        {data
          ? profileHighlights(data.summary).map((f) => (
              <div key={tx(f.label)}>
                <strong>{f.count}</strong>
                <span>{tx(f.label)}</span>
              </div>
            ))
          : [t("m216"), t("m217"), t("m218")].map((label) => (
              <div key={tx(label)}>
                <strong>
                  {error ? (
                    "—"
                  ) : (
                    <span className="fact-skeleton" aria-hidden="true" />
                  )}
                </strong>
                <span>{tx(label)}</span>
              </div>
            ))}
        <p>
          {t("m219")}
          <br />
          {t("m220")}
        </p>
      </div>
      <div className="profile-navigation">
        <div
          className="view-switch profile-segments"
          role="tablist"
          aria-label={t("m221")}
        >
          {sections.map((label, index) => (
            <button
              className="button secondary"
              key={tx(label)}
              role="tab"
              id={`profile-tab-${index}`}
              aria-selected={section === label}
              aria-controls="profile-panel"
              tabIndex={focusedSection === label ? 0 : -1}
              onFocus={() => setFocusedSection(label)}
              onKeyDown={(event) => {
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? sections.length - 1
                      : event.key === "ArrowRight"
                        ? (index + 1) % sections.length
                        : event.key === "ArrowLeft"
                          ? (index + sections.length - 1) % sections.length
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                document.getElementById(`profile-tab-${next}`)?.focus();
              }}
              onClick={() => {
                if (
                  section !== label ||
                  motionRef.current?.hasAttribute("data-transitioning")
                )
                  void transition(() => setSection(label));
              }}
            >
              {tx(label)}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          disabled={pending}
          onClick={() => setRetry((v) => v + 1)}
        >
          {t("m222")}
        </button>
      </div>
      <div ref={motionRef} className="motion-viewport profile-content">
        <div className="motion-content">
          <section
            id="profile-panel"
            role="tabpanel"
            aria-labelledby={`profile-tab-${sections.indexOf(section)}`}
            tabIndex={0}
          >
            {section === "m211" && (
              <div
                className="view-switch timeline-filters"
                role="group"
                aria-label={t("m223")}
              >
                {[
                  [0, t("m224")],
                  [6, t("m225")],
                  [12, t("m226")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className="button secondary"
                    aria-pressed={months === value}
                    onClick={() => setMonths(Number(value))}
                  >
                    {tx(label)}
                  </button>
                ))}
              </div>
            )}
            <div
              ref={resultRef}
              className="motion-viewport profile-results-motion"
              aria-busy={pending}
            >
              <div className="motion-content">
                {error && (
                  <p className="error" role="alert">
                    {tx(error)}
                  </p>
                )}
                {!data && !error && <LoadingState label={t("m227")} skeleton />}
                {data && (
                  <div className="profile-result">
                    {section === "m214" && (
                      <>
                        <h2 className="sr-only">{t("m228")}</h2>
                        <p className="small">{t("m229")}</p>
                        <div className="fact-grid">
                          {data.summary.map((f) => (
                            <article className="panel" key={tx(f.label)}>
                              <strong className="fact-count">{f.count}</strong>
                              <p>{tx(f.label)}</p>
                            </article>
                          ))}
                        </div>
                      </>
                    )}
                    {section === "m213" && (
                      <>
                        <h2>{t("m213")}</h2>
                        <div className="fact-grid">
                          {Object.entries(data.talent_map).map(
                            ([label, facts]) => (
                              <article className="panel" key={tx(label)}>
                                <h3>{tx(label)}</h3>
                                {facts.map((f) => (
                                  <p key={tx(f.label)}>
                                    <strong>{f.count}</strong> {tx(f.label)}
                                  </p>
                                ))}
                              </article>
                            ),
                          )}
                        </div>
                      </>
                    )}
                    {section === "m211" && (
                      <>
                        <h2>{t("m230")}</h2>

                        {!data.timeline.length && (
                          <Empty
                            title={t("m231")}
                            href="/aday#experiences"
                            action={t("addExperience")}
                          >
                            {t("m232")}
                          </Empty>
                        )}
                        <ol className="talent-timeline">
                          {data.timeline.map((item, i) => {
                            const source = safeProfileSource(item.source_url);
                            const month = item.date.slice(0, 7);
                            return (
                              <li key={item.id}>
                                {(i === 0 ||
                                  data.timeline[i - 1].date.slice(0, 7) !==
                                    month) && (
                                  <h3>{formatDate(month, true)}</h3>
                                )}
                                <article className="evidence-card">
                                  <p className="eyebrow">
                                    {sourceLabels[item.category] ||
                                      item.category}{" "}
                                    ·{" "}
                                    <time dateTime={formatDate(item.date)}>
                                      {formatDate(item.date)}
                                    </time>
                                  </p>
                                  <h3>{item.title}</h3>
                                  <p>{provenanceLabels[item.status]}</p>
                                  {item.date_basis === "recorded_at" && (
                                    <p className="small">{t("m233")}</p>
                                  )}
                                  {item.organization && (
                                    <p>{item.organization}</p>
                                  )}
                                  {item.role && (
                                    <p>
                                      {t("m234")}{" "}
                                      {participationLabels[
                                        item.role as keyof typeof participationLabels
                                      ] || item.role}
                                    </p>
                                  )}
                                  {source && (
                                    <a
                                      href={source}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {t("m093")}
                                      <span className="sr-only">
                                        {" "}
                                        {t("m235")}
                                      </span>
                                    </a>
                                  )}
                                </article>
                              </li>
                            );
                          })}
                        </ol>
                      </>
                    )}
                    {section === "m212" && (
                      <>
                        <h2>{t("m212")}</h2>
                        <p>{t("m236")}</p>
                        <div className="fact-grid">
                          {data.passport.map((f) => (
                            <article
                              className="panel"
                              key={`${f.family}:${f.status}`}
                            >
                              <h3>{sourceLabels[f.family] || f.family}</h3>
                              <p>{provenanceLabels[f.status]}</p>
                              <strong>
                                {f.count}
                                {t("m116")}
                              </strong>
                            </article>
                          ))}
                        </div>
                        {!data.passport.length && <p>{t("m237")}</p>}
                      </>
                    )}
                    <Notes title={t("m238")} items={data.limitations} />
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function LivingProfilePage() {
  useLocale();

  const { data, ready } = useSession();
  return (
    <>
      {!ready ? (
        <p role="status">{t("m239")}</p>
      ) : data.candidate ? (
        <>
          <header className="profile-masthead">
            <div className="profile-monogram" aria-hidden="true">
              {data.candidate.name.charAt(0).toLocaleUpperCase(getLocale())}
            </div>
            <div>
              <h1>{data.candidate.name}</h1>
              <p className="eyebrow">{t("m240")}</p>
              <p className="lead">
                {t("m241")}
                <br />
                {t("m242")}
              </p>
            </div>
            <Link className="button" href="/aday#experiences">
              {t("m243")}
            </Link>
          </header>
          <ProfileView
            key={data.candidate.id}
            candidateId={data.candidate.id}
          />
        </>
      ) : (
        <Empty title={t("m244")} href="/aday" action={t("m245")}>
          {t("m246")}
        </Empty>
      )}
    </>
  );
}
