"use client";
import { t } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, type ProfileEvidence, type Model } from "@/lib/api/client";
import { profileHighlights } from "@/lib/visual-summary";
import { validateName } from "@/lib/presentation";
import { useSession } from "@/components/session";
import { EvidenceCard, Notes, PageHeader, Empty } from "@/components/ui";
import { ButtonProgress } from "@/components/feedback";
import { ProfilePanel } from "@/components/profile-panel";
import { ProjectWorkspace } from "@/components/project-workspace";
import { ProfessionalImport } from "@/components/professional-import";
import { GitHubConnectionPanel } from "@/components/github-connection";

export default function CandidatePage() {
  useLocale();
  const s = useSession();
  const { candidate, run, evidence } = s.data;
  const [name, setName] = useState("");
  const [validation, setValidation] = useState("");
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState("");
  const [records, setRecords] = useState<ProfileEvidence[] | null>(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [profile, setProfile] = useState<{
    candidateId: string;
    data?: Model<"LivingProfile">;
    unavailable?: boolean;
  }>();
  const candidateId = candidate?.id;
  useEffect(() => {
    if (!candidateId) return;
    let live = true;
    api
      .livingProfile(candidateId)
      .then((data) => {
        if (live) setProfile({ candidateId, data });
      })
      .catch(() => {
        if (live) setProfile({ candidateId, unavailable: true });
      });
    return () => {
      live = false;
    };
  }, [candidateId, revision, summaryRevision]);
  const currentProfile =
    profile?.candidateId === candidateId ? profile : undefined;
  const changed = () => setRevision((value) => value + 1);
  const completed = () => {
    changed();
    setSource((current) => (current === source ? "" : current));
    globalThis.document?.getElementById("source-" + source)?.focus();
  };
  const categories = [
    "education",
    "certification",
    "portfolio",
    "community",
    "choose",
  ] as const;
  const entry = categories.find((category) => category === source);
  useEffect(() => {
    let live = true;
    if (candidate)
      api
        .profiles(candidate.id)
        .then((items) => {
          if (live) setRecords(items);
        })
        .catch(() => {
          if (live) setRecords(null);
        });
    return () => {
      live = false;
    };
  }, [candidate, revision]);
  function candidateSubmit(event: FormEvent) {
    event.preventDefault();
    const error = validateName(name, t("m000"));
    setValidation(error || "");
    if (!error)
      void s.act(t("m001"), async () =>
        s.saveCandidate(await api.createCandidate({ name: name.trim() })),
      );
  }
  const options = [
    ["professional", "professionalHeading", "sourceProfessionalIntro"],
    ["education", "sourceEducation", "sourceEducationIntro"],
    ["certification", "sourceCertificates", "sourceCertificatesIntro"],
    ["portfolio", "sourcePortfolio", "sourcePortfolioIntro"],
    ["community", "sourceCommunity", "sourceCommunityIntro"],
    ["choose", "sourceOther", "sourceOtherIntro"],
  ] as const;
  return (
    <div className="candidate-flow candidate-compact">
      <PageHeader step={t("m004")} title={t("candidateWorkspace")}>
        {t("candidateWorkspaceIntro")}
      </PageHeader>
      <section
        className="candidate-section candidate-summary"
        id="basics"
        aria-labelledby="summary-heading"
      >
        <div className="section-heading">
          <h2 id="summary-heading">{t("candidateSummary")}</h2>
        </div>
        {candidate ? (
          <>
            <p className="saved-name">{candidate.name}</p>
            <div
              className="candidate-summary-facts"
              aria-label={t("m215")}
              aria-live="polite"
              aria-busy={!currentProfile}
            >
              {currentProfile?.data ? (
                profileHighlights(currentProfile.data.summary).map((fact) => (
                  <span className="candidate-summary-fact" key={fact.label}>
                    <strong>{fact.count}</strong> {fact.label}
                  </span>
                ))
              ) : (
                <p className="small muted">
                  {t(
                    currentProfile?.unavailable
                      ? "candidateSummaryUnavailable"
                      : "candidateSummaryLoading",
                  )}
                </p>
              )}
            </div>
            <div className="candidate-summary-footer">
              <p className="small muted">{t("candidateSummarySourceNote")}</p>
              <Link href="/profil">{t("m015")}</Link>
            </div>
          </>
        ) : (
          <form onSubmit={candidateSubmit}>
            <label htmlFor="candidate-name">{t("m000")}</label>
            <input
              id="candidate-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={200}
              autoComplete="name"
            />
            {validation && (
              <p role="alert" className="error">
                {validation}
              </p>
            )}
            <button className="button" disabled={!s.ready || !!s.busy}>
              <ButtonProgress active={!!s.busy} />
              {t("m021")}
            </button>
          </form>
        )}
      </section>
      <section id="experiences" aria-labelledby="sources-heading">
        <div className="section-heading">
          <h2 id="sources-heading">{t("candidateSources")}</h2>
          <p className="muted">{t("candidateSourcesIntro")}</p>
        </div>
        {candidate && s.user?.role === "candidate" ? (
          <>
            <div className="source-grid">
              <GitHubConnectionPanel
                key={`github-${candidate.id}`}
                candidateId={candidate.id}
                expanded={source === "github"}
                onExpandedChange={(value) => setSource(value ? "github" : "")}
                onImported={changed}
                refreshToken={revision}
              />
              {options.map(([key, title, intro]) => {
                const count = records?.filter((item) =>
                  key === "professional"
                    ? item.metadata_json?.source_type === "linkedin_profile"
                    : key === "choose"
                      ? ["hackathon", "event"].includes(item.category)
                      : item.category === key,
                ).length;
                return (
                  <article className="candidate-section source-card" key={key}>
                    <h3>{t(title)}</h3>
                    <p className="muted">{t(intro)}</p>
                    <p className="small">
                      {count === undefined
                        ? t("sourceStatusUnknown")
                        : count
                          ? t("sourceRecordCount").replace(
                              "{count}",
                              String(count),
                            )
                          : t("sourceNotAdded")}
                    </p>
                    <button
                      className="button secondary"
                      id={"source-" + key}
                      aria-expanded={source === key}
                      onClick={() => setSource(source === key ? "" : key)}
                    >
                      {t(
                        source === key
                          ? "sourceClose"
                          : key === "professional"
                            ? "sourceAddProfile"
                            : "sourceAddRecord",
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
            {source === "professional" && (
              <div
                className="source-flow"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setSource("");
                    document.getElementById("source-professional")?.focus();
                  }
                }}
              >
                <button
                  className="button secondary"
                  onClick={() => {
                    setSource("");
                    globalThis.document
                      ?.getElementById("source-professional")
                      ?.focus();
                  }}
                >
                  {t("sourceClose")}
                </button>
                <ProfessionalImport
                  candidateId={candidate.id}
                  changed={completed}
                />
              </div>
            )}
          </>
        ) : (
          <p>{t("m027")}</p>
        )}
      </section>
      <section id="projects" aria-labelledby="projects-heading">
        <div className="section-heading">
          <h2 id="projects-heading">{t("candidateProjectsExperience")}</h2>
        </div>
        {candidate && (
          <>
            <ProjectWorkspace
              key={candidate.id}
              candidateId={candidate.id}
              revision={revision}
              changed={changed}
              onSummaryChanged={() => setSummaryRevision((value) => value + 1)}
              onViewEvidence={() => {
                setTechnicalOpen(true);
                setSkillFilter("");
              }}
            />
            {run && (
              <details
                className="candidate-section source-details"
                id="technical"
                open={technicalOpen}
                onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
              >
                <summary>{t("viewProjectEvidence")}</summary>
                {run ? (
                  <>
                    <div className="section-heading horizontal">
                      <p className="muted">
                        {evidence.length}
                        {t("m037")}
                        {run.provider || t("analysis")}
                        {run.model && ` / ${run.model}`}
                      </p>
                      <Link className="button secondary" href="/ihtiyac">
                        {t("m038")}
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                    {evidence.length ? (
                      <>
                        <div className="evidence-filter">
                          <label htmlFor="skill-filter">{t("m039")}</label>
                          <select
                            id="skill-filter"
                            value={skillFilter}
                            onChange={(e) => setSkillFilter(e.target.value)}
                          >
                            <option value="">
                              {t("m040")}
                              {evidence.length})
                            </option>
                            {[
                              ...new Map(
                                evidence.map((e) => [
                                  e.skill_key,
                                  e.skill_label,
                                ]),
                              ).entries(),
                            ].map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="evidence-grid content-enter">
                          {evidence
                            .filter(
                              (item) =>
                                !skillFilter || item.skill_key === skillFilter,
                            )
                            .map((item) => (
                              <EvidenceCard key={item.id} item={item} />
                            ))}
                        </div>
                      </>
                    ) : (
                      <Empty title={t("m041")}>{t("m042")}</Empty>
                    )}
                    <Notes title={t("m043")} items={run.limitations} />
                    <Notes
                      title={t("uncertainties")}
                      items={run.uncertainties}
                    />
                  </>
                ) : (
                  <p className="muted">{t("m044")}</p>
                )}
              </details>
            )}
            <ProfilePanel
              key={String(entry || "records") + "-" + revision}
              candidateId={candidate.id}
              compact
              entryCategory={entry}
              onSaved={completed}
              onCancel={() => {
                setSource("");
                globalThis.document
                  ?.getElementById("source-" + source)
                  ?.focus();
              }}
              onEntryOpen={() => setSource("records")}
            />
          </>
        )}
      </section>
    </div>
  );
}
