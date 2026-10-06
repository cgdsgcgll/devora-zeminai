"use client";
import { t } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { validateGithub, validateName } from "@/lib/presentation";
import { useSession } from "@/components/session";
import { EvidenceCard, Notes, PageHeader, Empty } from "@/components/ui";
import { ProcessingState, ButtonProgress } from "@/components/feedback";
import { ProfilePanel } from "@/components/profile-panel";

export default function CandidatePage() {
  useLocale();

  const s = useSession();
  const { candidate, project, run, evidence } = s.data;
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [validation, setValidation] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const disabled = !s.ready || !!s.busy;
  function candidateSubmit(e: FormEvent) {
    e.preventDefault();
    const error = validateName(name, t("m000"));
    setValidation(error || "");
    if (error) return;
    void s.act(t("m001"), async () =>
      s.saveCandidate(await api.createCandidate({ name: name.trim() })),
    );
  }
  function projectSubmit(e: FormEvent) {
    e.preventDefault();
    const error =
      validateName(projectName, t("m002")) || validateGithub(url.trim());
    setValidation(error || "");
    if (error || !candidate) return;
    void s.act(t("m003"), async () =>
      s.saveProject(
        await api.createProject(candidate.id, {
          name: projectName.trim(),
          description: description.trim(),
          source_url: url.trim(),
          source_type: "github",
        }),
      ),
    );
  }
  return (
    <div className="candidate-flow">
      <PageHeader
        step={t("m004")}
        title={candidate ? t("newEvidence") : t("m005")}
      >
        {t("m006")}
      </PageHeader>
      <nav className="journey-nav" aria-label={t("m007")}>
        <p className="small">{t("m008")}</p>
        <ol>
          {[
            ["basics", t("m009")],
            ["projects", t("m010")],
            ["technical", t("m011")],
            ["experiences", t("m012")],
          ].map(([id, label], index) => (
            <li key={id}>
              <a href={`#${id}`}>
                <span>0{index + 1}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {candidate && (
        <nav className="action-bar" aria-label={t("m013")}>
          <a className="button" href="#experiences">
            {t("m014")}
          </a>
          <Link className="button secondary" href="/profil">
            {t("m015")}
          </Link>
          <span className="small">{t("m016")}</span>
        </nav>
      )}

      {validation && (
        <p id="form-error" className="error" role="alert">
          {validation}
        </p>
      )}
      <section
        className="candidate-section"
        id="basics"
        aria-labelledby="basics-title"
      >
        <div className="section-heading">
          <p className="eyebrow">{t("m017")}</p>
          <h2 id="basics-title">{t("m018")}</h2>
          <p className="muted">{t("m019")}</p>
        </div>
        {candidate ? (
          <p className="saved-name">{candidate.name}</p>
        ) : (
          <form onSubmit={candidateSubmit} noValidate>
            <label htmlFor="candidate-name">
              {t("m000")}
              <span className="required">*</span>
            </label>
            <input
              id="candidate-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              autoComplete="name"
              aria-invalid={!!validation && !!validateName(name, t("m000"))}
              aria-describedby={validation ? "form-error" : undefined}
            />
            <button className="button" disabled={disabled}>
              <ButtonProgress active={!!s.busy} />
              {s.busy === t("m001") ? t("m020") : t("m021")}
            </button>
          </form>
        )}
      </section>
      <section
        className="candidate-section"
        id="projects"
        aria-labelledby="projects-title"
      >
        <div className="section-heading">
          <p className="eyebrow">{t("m022")}</p>
          <h2 id="projects-title">{t("m023")}</h2>
          <p className="muted">{t("m024")}</p>
        </div>
        {project ? (
          <>
            <h3>{project.name}</h3>
            <p>{project.description}</p>
            <p className="meta break">{project.source_url}</p>
            <button
              className="button"
              disabled={disabled}
              onClick={() =>
                void s.act(t("m025"), async () => {
                  const result = await api.analyze(project.id);
                  s.saveAnalysis(result.run, result.evidence);
                })
              }
            >
              <ButtonProgress active={s.busy === t("analyzingProject")} />
              {s.busy === t("analyzingProject")
                ? t("m026")
                : run
                  ? t("analyzeAgain")
                  : t("analyzeProject")}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </>
        ) : !candidate ? (
          <p className="muted">{t("m027")}</p>
        ) : (
          <form onSubmit={projectSubmit} noValidate>
            <label htmlFor="project-name">
              {t("m002")}
              <span className="required">*</span>
            </label>
            <input
              id="project-name"
              value={projectName}
              aria-invalid={
                !!validation && !!validateName(projectName, t("m002"))
              }
              aria-describedby={validation ? "form-error" : undefined}
              onChange={(e) => setProjectName(e.target.value)}
              maxLength={200}
              required
            />
            <label htmlFor="project-description">
              {t("m028")}
              <span className="optional">{t("m029")}</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={20000}
              rows={3}
            />
            <label htmlFor="github-url">
              {t("m030")} <span className="required">*</span>
            </label>
            <input
              id="github-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/sahip/depo"
              maxLength={500}
              required
              aria-invalid={!!validation && !!validateGithub(url)}
              aria-describedby={
                validation ? "github-help form-error" : "github-help"
              }
            />
            <p id="github-help" className="field-help">
              {t("m031")}
            </p>
            <button className="button" disabled={disabled}>
              <ButtonProgress active={!!s.busy} />
              {s.busy === t("m003") ? t("m032") : t("saveProject")}
            </button>
          </form>
        )}
      </section>
      <section
        className="candidate-section"
        id="technical"
        aria-labelledby="technical-title"
      >
        <div className="section-heading">
          <p className="eyebrow">{t("m033")}</p>
          <h2 id="technical-title">{t("m034")}</h2>
          <p className="muted">{t("m035")}</p>
        </div>
        {s.busy === t("analyzingProject") && <ProcessingState kind="project" />}
        <p className="method-note">{t("m036")}</p>
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
                        evidence.map((e) => [e.skill_key, e.skill_label]),
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
                      (item) => !skillFilter || item.skill_key === skillFilter,
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
            <Notes title={t("uncertainties")} items={run.uncertainties} />
          </>
        ) : (
          <p className="muted">{t("m044")}</p>
        )}
      </section>
      {candidate ? (
        <ProfilePanel key={candidate.id} candidateId={candidate.id} />
      ) : (
        <section className="candidate-section" id="experiences">
          <div className="section-heading">
            <p className="eyebrow">{t("m045")}</p>
            <h2>{t("m046")}</h2>
            <p className="muted">{t("m047")}</p>
          </div>
          <a className="button secondary" href="#basics">
            {t("m048")}
          </a>
        </section>
      )}
    </div>
  );
}
