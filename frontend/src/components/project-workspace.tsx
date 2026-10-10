"use client";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { api, userError } from "@/lib/api/client";
import { t } from "../i18n/index";
import { useLocale } from "../i18n/react";
import { watchProjects, activeAnalysis } from "../lib/project-polling";
import { useSession } from "./session";
import { EvidenceCard } from "./ui";

export function ProjectWorkspace({
  candidateId,
  revision,
  changed,
  onViewEvidence,
  onSummaryChanged,
}: {
  candidateId: string;
  revision: number;
  changed: () => void;
  onViewEvidence?: () => void;
  onSummaryChanged?: () => void;
}) {
  useLocale();
  const session = useSession();
  const currentSession = useRef(session);
  const summaryCallback = useRef(onSummaryChanged);
  const summaryVersion = useRef("");
  useEffect(() => {
    summaryCallback.current = onSummaryChanged;
  }, [onSummaryChanged]);
  useEffect(() => {
    currentSession.current = session;
  }, [session]);
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.projectActivity>>[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [errorFor, setErrorFor] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [busy, setBusy] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState("");
  const [editing, setEditing] = useState("");
  const lock = useRef(false);
  const [reload, setReload] = useState(0);
  const [stateUnavailable, setStateUnavailable] = useState(false);
  async function load() {
    const projects = await api.projects(candidateId);
    return (
      await Promise.all(
        projects.map((p) =>
          api.projectActivity(p.id).catch((e) => {
            if (e?.code === "NOT_FOUND") return null;
            throw e;
          }),
        ),
      )
    ).filter(
      (row): row is Awaited<ReturnType<typeof api.projectActivity>> =>
        row !== null,
    );
  }
  useEffect(
    () =>
      watchProjects({
        load: async () => {
          const projects = await api.projects(candidateId);
          const rows = await Promise.all(
            projects.map((p) =>
              api.projectActivity(p.id).catch((e) => {
                if (e?.code === "NOT_FOUND") return null;
                throw e;
              }),
            ),
          );
          return rows.filter(
            (row): row is Awaited<ReturnType<typeof api.projectActivity>> =>
              row !== null,
          );
        },
        publish: (rows) => {
          setItems(rows);
          setLoaded(true);
          setStateUnavailable(false);
          // Refresh the server's current-profile read model only when material
          // membership or a terminal result changes, not on every polling tick.
          const version =
            candidateId +
            JSON.stringify(
              rows
                .map((row) => [
                  row.project.id,
                  row.run?.status === "completed" ? row.run.id : null,
                  row.analysis.state === "failed" ? "failed" : null,
                ])
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
            );
          if (summaryVersion.current !== version) {
            summaryVersion.current = version;
            summaryCallback.current?.();
          }
          const selected = currentSession.current;
          const row = rows.find(
            (item) => item.project.id === selected.data?.project?.id,
          );
          if (selected.data?.project && !row) {
            selected.clearProject();
          } else if (
            row &&
            selected.data?.run &&
            (!row.run ||
              row.run.status !== "completed" ||
              row.run.id !== selected.data.run.id)
          ) {
            selected.saveProject(row.project);
          }
          if (
            row?.analysis.state === "succeeded" &&
            row.run &&
            (selected.data.run?.id !== row.run.id ||
              selected.data.run?.status !== "completed")
          ) {
            selected.saveAnalysis(row.run, row.evidence);
          }
        },
        error: () => {
          setStateUnavailable(true);
        },
      }),
    [candidateId, revision, reload],
  );
  async function act(id: string, task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    setError("");
    setSuccess("");
    try {
      await task();
      setItems(await load());
      changed();
      setSuccess(t("projectSaved"));
      setDetailsId("");
    } catch (e) {
      setErrorFor(id);
      setError(userError(e));
      setItems(await load().catch(() => items));
    } finally {
      setReload((value) => value + 1);
      lock.current = false;
      setBusy("");
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void act("create", async () => {
      const p = await api.createProject(candidateId, {
        name: String(data.get("name")),
        description: String(data.get("description")),
        source_type: "github",
        source_url: String(data.get("url")),
      });
      session.saveProject(p);
      form.reset();
      const disclosure = form.closest("details");
      if (disclosure) disclosure.open = false;
      try {
        await api.queueAnalysis(p.id);
      } catch (error) {
        setErrorFor(p.id);
        setError(userError(error));
      }
    });
  }
  return (
    <div className="project-workspace" aria-busy={!!busy}>
      {stateUnavailable && (
        <div role="alert">
          <p>{t("analysisStateUnavailable")}</p>
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => setReload((value) => value + 1)}
          >
            {t("refreshAnalysisState")}
          </button>
        </div>
      )}
      {success && <p role="status">{success}</p>}
      {!loaded && !stateUnavailable && (
        <p role="status">{t("candidateProjectsLoading")}</p>
      )}
      {loaded && !stateUnavailable && items.length === 0 && (
        <p>{t("noProjectsYet")}</p>
      )}
      {items.map(({ project: p, link, run, evidence, analysis }) => (
        <article className="candidate-section" key={p.id}>
          <h3>{p.name}</h3>
          {p.description && <p>{p.description}</p>}
          {error && errorFor === p.id && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p>
            {link && !link.revoked_at
              ? t(
                  link.relationship === "personal_owner"
                    ? "sourcePersonal"
                    : "sourceAccess",
                )
              : t("githubManual")}
          </p>
          <p role="status">
            {t("projectAnalysis")}:{" "}
            {stateUnavailable
              ? t("analysisStateUnavailable")
              : t(
                  analysis.state === "queued"
                    ? "analysisQueued"
                    : analysis.state === "analyzing"
                      ? "projectAnalyzing"
                      : analysis.state === "succeeded"
                        ? "projectAnalyzed"
                        : analysis.state === "failed"
                          ? "sourceAnalysisFailed"
                          : "projectNotAnalyzed",
                )}
          </p>
          {analysis.state === "failed" && (
            <p className="error" role="alert">
              {t(
                analysis.error_code === "LLM_RATE_LIMITED"
                  ? "analysisRateLimited"
                  : [
                        "LLM_CONFIGURATION_ERROR",
                        "LLM_NOT_CONFIGURED",
                        "LLM_REQUEST_REJECTED",
                      ].includes(analysis.error_code || "")
                    ? "analysisConfigurationError"
                    : [
                          "INSUFFICIENT_PROJECT_DATA",
                          "GITHUB_FETCH_FAILED",
                          "SOURCE_UNREACHABLE",
                        ].includes(analysis.error_code || "")
                      ? "analysisSourceError"
                      : ["GROUNDING_REJECTED", "INVALID_MODEL_OUTPUT"].includes(
                            analysis.error_code || "",
                          )
                        ? "analysisValidationError"
                        : "sourceAnalysisFailedNote",
              )}
            </p>
          )}
          {activeAnalysis(analysis.state) || stateUnavailable ? (
            <p>{t("analysisEvidencePending")}</p>
          ) : analysis.state === "not_started" ? (
            <p>{t("projectNotAnalyzed")}</p>
          ) : analysis.state === "failed" && evidence.length === 0 ? null : (
            <>
              {analysis.state === "failed" && (
                <p>{t("previousEvidenceNote")}</p>
              )}
              <p>
                {t("sourceObservedCount").replace(
                  "{count}",
                  String(
                    evidence.filter(
                      (item) => item.evidence_status === "observed",
                    ).length,
                  ),
                )}
              </p>
            </>
          )}
          {p.repository_private && <p>{t("privateAnalysisUnsupported")}</p>}
          {analysis.state === "failed" && analysis.retryable !== false && (
            <button
              className="button secondary"
              disabled={
                !!busy || p.repository_private === true || stateUnavailable
              }
              onClick={() =>
                void act(p.id, async () => {
                  await api.queueAnalysis(p.id);
                })
              }
            >
              {t("sourceRetry")}
            </button>
          )}
          <details
            className="source-details"
            open={detailsId === p.id}
            onToggle={(event) => {
              if (event.currentTarget.open) setDetailsId(p.id);
              else if (detailsId === p.id) setDetailsId("");
            }}
          >
            <summary>{t("sourceDetails")}</summary>{" "}
            <p className="break">
              {t("projectSource")}: {p.source_url}
            </p>
            {analysis.error_code && (
              <p className="small">{analysis.error_code}</p>
            )}
            <div className="project-evidence-preview">
              {[
                ...new Map(
                  evidence
                    .filter((item) => item.evidence_status === "observed")
                    .map((item) => [item.id, item]),
                ).values(),
              ].map((item) => (
                <EvidenceCard key={item.id} item={item} />
              ))}
            </div>
            {(analysis.state === "succeeded" ||
              (analysis.state === "failed" && evidence.length > 0)) && (
              <>
                {" "}
                <p>
                  {t("projectEvidence")}: {t("observedLabel")}{" "}
                  {
                    evidence.filter((e) => e.evidence_status === "observed")
                      .length
                  }{" "}
                  ·{t("declaredLabel")}{" "}
                  {
                    evidence.filter(
                      (e) => e.evidence_status === "declared_only",
                    ).length
                  }{" "}
                  ·{t("notFoundLabel")}{" "}
                  {
                    evidence.filter((e) => e.evidence_status === "not_found")
                      .length
                  }
                </p>
              </>
            )}
            <div className="action-bar">
              {(analysis.state === "not_started" ||
                analysis.state === "succeeded") && (
                <button
                  className="button secondary"
                  disabled={
                    !!busy ||
                    p.repository_private === true ||
                    activeAnalysis(analysis.state) ||
                    stateUnavailable
                  }
                  onClick={() =>
                    void act(p.id, async () => {
                      await api.queueAnalysis(p.id);
                    })
                  }
                >
                  {t("analyzeProject")}
                </button>
              )}
              {run?.status === "completed" && (
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => {
                    session.saveProject(p);
                    if (run?.status === "completed")
                      session.saveAnalysis(run, evidence);
                    onViewEvidence?.();
                  }}
                >
                  {t("viewProjectEvidence")}
                </button>
              )}
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => setEditing(editing === p.id ? "" : p.id)}
              >
                {t("editProject")}
              </button>
              <button
                className="button danger"
                disabled={!!busy}
                onClick={() => setDeleting(p.id)}
              >
                {t("deleteProject")}
              </button>
            </div>
            {editing === p.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void act(p.id, async () => {
                    await api.updateProject(p.id, {
                      name: String(data.get("name")),
                      description: String(data.get("description")),
                    });
                    setEditing("");
                  });
                }}
              >
                <label>
                  {t("m002")}
                  <input
                    name="name"
                    defaultValue={p.name}
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  {t("m028")}
                  <textarea
                    name="description"
                    defaultValue={p.description}
                    maxLength={20000}
                  />
                </label>
                <button className="button" disabled={!!busy}>
                  {t("saveProject")}
                </button>
              </form>
            )}
            {deleting === p.id && (
              <div role="group" aria-label={t("deleteProject")}>
                <p>{t("deleteProjectConfirm")}</p>
                <button
                  className="button danger"
                  disabled={!!busy}
                  onClick={() =>
                    void act(p.id, async () => {
                      await api.deleteProject(p.id);
                      setDeleting("");
                      await session.restore();
                    })
                  }
                >
                  {t("confirmProjectDelete")}
                </button>
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={(event) => {
                    setDeleting("");
                    event.currentTarget
                      .closest("details")
                      ?.querySelector("summary")
                      ?.focus();
                  }}
                >
                  {t("cancelProjectDelete")}
                </button>
              </div>
            )}
          </details>
        </article>
      ))}
      <details className="candidate-section source-details">
        <summary>{t("sourceManualProject")}</summary>
        {error && errorFor === "create" && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={create}>
          <h3>{t("addAnotherProject")}</h3>
          <label>
            {t("m002")}
            <input name="name" required maxLength={200} />
          </label>
          <label>
            {t("m028")}
            <textarea name="description" maxLength={20000} />
          </label>
          <label>
            {t("m030")}
            <input
              name="url"
              type="url"
              required
              maxLength={500}
              placeholder="https://github.com/owner/repo"
            />
          </label>
          <button className="button" disabled={!!busy}>
            {t("saveProject")}
          </button>
        </form>
      </details>
    </div>
  );
}
