"use client";
import { useEffect, useRef, useState } from "react";
import { api, userError, type Model, type Project } from "@/lib/api/client";
import { t } from "../i18n/index";
import { useLocale } from "../i18n/react";

export function GitHubConnectionPanel({
  candidateId,
  expanded,
  onExpandedChange,
  onImported,
  refreshToken,
}: {
  candidateId: string;
  currentProjectId?: string;
  refreshToken?: number;
  expanded?: boolean;
  onExpandedChange?: (value: boolean) => void;
  onImported?: () => void;
}) {
  useLocale();
  const [connection, setConnection] =
    useState<Model<"GitHubConnectionView"> | null>(null);
  const [installations, setInstallations] = useState<
    Model<"GitHubInstallation">[]
  >([]);
  const [installationId, setInstallationId] = useState("");
  const [repositories, setRepositories] = useState<Model<"GitHubRepository">[]>(
    [],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const [accessKnown, setAccessKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [panelError, setPanelError] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const locked = useRef(false);
  const selectedInstallation = useRef("");
  const panelWasOpen = useRef(false);
  const primary = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const open = expanded ?? opened;
  const active = !!connection && !connection.revoked_at;
  function toggle(value: boolean) {
    setOpened(value);
    onExpandedChange?.(value);
  }
  useEffect(() => {
    if (open) panelHeading.current?.focus();
    else if (panelWasOpen.current) primary.current?.focus();
    panelWasOpen.current = open;
  }, [open]);
  useEffect(() => {
    let live = true,
      refreshing = false;
    async function refresh() {
      if (refreshing || locked.current) return;
      refreshing = true;
      try {
        const status = await api.githubConnection();
        if (!live) return;
        setConnection(status.connection);
        if (status.connection && !status.connection.revoked_at) {
          const items = await api.githubInstallations();
          if (!live) return;
          setInstallations(items);
          const next = items.some(
            (item) => item.id === selectedInstallation.current,
          )
            ? selectedInstallation.current
            : items.length === 1
              ? items[0].id
              : "";
          if (next !== selectedInstallation.current) {
            setSelected([]);
            setRepositories([]);
            selectedInstallation.current = next;
            if (next && panelWasOpen.current) {
              const repos = await api.githubRepositories(next);
              if (!live) return;
              setRepositories(repos);
            }
          }
          setInstallationId(next);
        } else {
          setInstallations([]);
          setInstallationId("");
          selectedInstallation.current = "";
          setSelected([]);
          setRepositories([]);
        }
        setAccessKnown(true);
        setSourceError("");
      } catch (error) {
        if (live) {
          setAccessKnown(false);
          setSourceError(userError(error));
        }
      } finally {
        refreshing = false;
        if (live) setReady(true);
      }
    }
    void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    if (typeof window !== "undefined")
      window.addEventListener?.("focus", refresh);
    if (typeof window !== "undefined")
      window.addEventListener?.("pageshow", refresh);
    if (typeof document !== "undefined")
      document.addEventListener?.("visibilitychange", visible);
    return () => {
      live = false;
      if (typeof window !== "undefined")
        window.removeEventListener?.("focus", refresh);
      if (typeof window !== "undefined")
        window.removeEventListener?.("pageshow", refresh);
      if (typeof document !== "undefined")
        document.removeEventListener?.("visibilitychange", visible);
    };
  }, [candidateId]);
  useEffect(() => {
    let live = true;
    if (refreshToken !== undefined) {
      void api
        .projects(candidateId)
        .then((rows) => {
          if (!live) return;
          setProjects(rows);
          setProjectId((id) => (rows.some((row) => row.id === id) ? id : ""));
        })
        .catch((error) => {
          if (live) setSourceError(userError(error));
        });
      if (panelWasOpen.current && selectedInstallation.current) {
        void api
          .githubRepositories(selectedInstallation.current)
          .then((rows) => {
            if (!live) return;
            setRepositories(rows);
            setSelected((ids) =>
              ids.filter((id) =>
                rows.some((row) => row.id === id && !row.imported_project_id),
              ),
            );
          })
          .catch((error) => {
            if (live) setPanelError(userError(error));
          });
      }
    }
    return () => {
      live = false;
    };
  }, [candidateId, refreshToken]);
  async function refreshAccess() {
    const status = await api.githubConnection();
    setConnection(status.connection);
    const items =
      status.connection && !status.connection.revoked_at
        ? await api.githubInstallations()
        : [];
    setInstallations(items);
    const next = items.length === 1 ? items[0].id : "";
    selectedInstallation.current = next;
    setInstallationId(next);
    setSelected([]);
    setRepositories([]);
    if (next && panelWasOpen.current)
      setRepositories(await api.githubRepositories(next));
    setAccessKnown(true);
    setReady(true);
    setSourceError("");
  }
  async function act(
    task: () => Promise<void>,
    scope: "source" | "panel" = "panel",
  ) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    if (scope === "source") setSourceError("");
    else setPanelError("");
    try {
      await task();
    } catch (error) {
      (scope === "source" ? setSourceError : setPanelError)(userError(error));
      if ((error as { code?: string })?.code === "GITHUB_CONNECTION_REVOKED") {
        setConnection(
          (await api.githubConnection().catch(() => ({ connection: null })))
            .connection,
        );
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function loadRepositories(id: string) {
    setSelected([]);
    setRepositories([]);
    setRepositoryId("");
    setResults([]);
    setInstallationId(id);
    selectedInstallation.current = id;
    if (id) setRepositories(await api.githubRepositories(id));
  }
  async function beginImport() {
    toggle(true);
    setSummary("");
    setPanelError("");
    setResults([]);
    if (installations.length === 1) await loadRepositories(installations[0].id);
  }
  async function importSelected() {
    const batch = await api.githubImportBatch({
      installation_id: installationId,
      repository_ids: selected,
    });
    const failed = batch.items.filter((item) => item.status === "failed");
    const imported = batch.items.length - failed.length;
    setResults(
      failed.map((item) => {
        const name =
          repositories.find((repo) => repo.id === item.repository_id)
            ?.full_name || item.repository_id;
        return (
          name + ": " + t("githubImportFailed") + " (" + item.error_code + ")"
        );
      }),
    );
    setSelected([]);
    setRepositories((current) =>
      current.map((repo) => {
        const result = batch.items.find(
          (item) => item.repository_id === repo.id,
        )?.result;
        return result
          ? { ...repo, imported_project_id: result.project.id }
          : repo;
      }),
    );
    if (imported) {
      setSummary(
        t("sourceImportComplete").replace("{count}", String(imported)),
      );
      onImported?.();
    }
    if (!failed.length) toggle(false);
  }
  const primaryLabel =
    !ready || !accessKnown
      ? "sourceRefresh"
      : !active
        ? "sourceGitHubConnect"
        : installations.length
          ? "sourceGitHubImport"
          : "sourceGitHubAccess";
  return (
    <section
      className="candidate-section source-card github-connection"
      data-expanded={open}
      aria-labelledby="github-heading"
      aria-busy={busy || !ready}
    >
      <h3 id="github-heading">GitHub</h3>
      <p className="muted">
        {!active ? (
          t("sourceGitHubIntro")
        ) : (
          <>
            <bdi>{connection!.github_login}</bdi> ·{" "}
            {t(
              installations.length
                ? "sourceConnected"
                : "sourceAccountVerified",
            )}
          </>
        )}
      </p>
      {sourceError && (
        <p role="alert" className="error">
          {sourceError}
        </p>
      )}
      {summary && <p role="status">{summary}</p>}
      {!open && (
        <button
          ref={primary}
          className="button"
          disabled={busy || !ready}
          onClick={() =>
            void act(async () => {
              if (!accessKnown) await refreshAccess();
              else if (!active)
                window.location.assign(
                  (await api.githubConnect()).authorization_url,
                );
              else if (!installations.length)
                window.location.assign(
                  (await api.githubInstallationURL()).installation_url,
                );
              else await beginImport();
            }, "source")
          }
        >
          {busy ? t("githubWorking") : t(primaryLabel)}
        </button>
      )}
      {open && (
        <div
          className="source-flow"
          role="region"
          aria-labelledby="github-picker-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.stopPropagation();
              toggle(false);
            }
          }}
        >
          <div className="section-heading horizontal">
            <h4 id="github-picker-title" ref={panelHeading} tabIndex={-1}>
              {t("sourceChooseProjects")}
            </h4>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => toggle(false)}
            >
              {t("sourceClose")}
            </button>
          </div>
          {panelError && (
            <p className="error" role="alert">
              {panelError}
            </p>
          )}
          {results.map((result, i) => (
            <p role="alert" className="error" key={i}>
              {result}
            </p>
          ))}
          {installations.length > 1 && (
            <label>
              {t("sourceChooseAccount")}
              <select
                value={installationId}
                disabled={busy}
                onChange={(event) =>
                  void act(() => loadRepositories(event.target.value))
                }
              >
                <option value="">{t("githubChoose")}</option>
                {installations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.account_login}
                  </option>
                ))}
              </select>
            </label>
          )}
          {busy && <p role="status">{t("githubWorking")}</p>}
          {!!installationId &&
            !busy &&
            !panelError &&
            !sourceError &&
            !repositories.length && <p>{t("sourceNoRepositories")}</p>}
          {!!repositories.length && (
            <fieldset className="repository-picker">
              <legend>{t("sourceChooseProjects")}</legend>
              {repositories.map((repo) => (
                <label className="source-choice" key={repo.id}>
                  <input
                    type="checkbox"
                    disabled={busy || !!repo.imported_project_id}
                    checked={selected.includes(repo.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, repo.id]
                          : current.filter((id) => id !== repo.id),
                      )
                    }
                  />
                  <span>
                    <bdi>{repo.full_name}</bdi>
                    <span className="small">
                      {" "}
                      ·{" "}
                      {t(
                        repo.imported_project_id
                          ? "githubAlreadyImported"
                          : repo.private
                            ? "privateRepository"
                            : "publicRepository",
                      )}
                    </span>
                  </span>
                </label>
              ))}
              <button
                className="button"
                disabled={busy || selected.length === 0 || selected.length > 20}
                onClick={() => void act(importSelected)}
              >
                {busy
                  ? t("githubImporting")
                  : t("sourceImportCount").replace(
                      "{count}",
                      String(selected.length),
                    )}
              </button>
              <p className="small">{t("sourceImportHelp")}</p>
            </fieldset>
          )}
        </div>
      )}
      <details className="source-details">
        <summary>{t("sourceVerificationAbout")}</summary>
        <p className="small">{t("githubDisclaimer")}</p>
        {active && (
          <>
            <p className="small">{t("githubInstallSeparation")}</p>
            <div className="action-bar">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void act(refreshAccess, "source")}
              >
                {t("sourceRefresh")}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api.githubDisconnect();
                    await refreshAccess();
                    setRepositories([]);
                    toggle(false);
                  }, "source")
                }
              >
                {t("githubDisconnect")}
              </button>
            </div>
            <details
              onToggle={(event) => {
                if (event.currentTarget.open)
                  void act(
                    async () => setProjects(await api.projects(candidateId)),
                    "source",
                  );
              }}
            >
              <summary>{t("sourceExistingRelationship")}</summary>
              <p className="small">{t("githubScope")}</p>
              <label>
                {t("githubProject")}
                <select
                  value={projectId}
                  disabled={busy}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setLinkNote("");
                  }}
                >
                  <option value="">{t("githubChoose")}</option>
                  {projects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {installations.length > 1 && (
                <label>
                  {t("sourceChooseAccount")}
                  <select
                    value={installationId}
                    disabled={busy}
                    onChange={(event) =>
                      void act(
                        () => loadRepositories(event.target.value),
                        "source",
                      )
                    }
                  >
                    <option value="">{t("githubChoose")}</option>
                    {installations.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.account_login}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="button secondary"
                disabled={busy || !installationId}
                onClick={() =>
                  void act(() => loadRepositories(installationId), "source")
                }
              >
                {t("sourceChooseProjects")}
              </button>
              <label>
                {t("githubRepository")}
                <select
                  value={repositoryId}
                  disabled={busy}
                  onChange={(event) => setRepositoryId(event.target.value)}
                >
                  <option value="">{t("githubChoose")}</option>
                  {repositories.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="action-bar">
                <button
                  className="button secondary"
                  disabled={busy || !projectId || !repositoryId}
                  onClick={() =>
                    void act(async () => {
                      await api.githubLink(projectId, {
                        installation_id: installationId,
                        repository_id: repositoryId,
                      });
                      setLinkNote(t("sourceRelationshipSaved"));
                      onImported?.();
                    }, "source")
                  }
                >
                  {t("githubLink")}
                </button>
                <button
                  className="button secondary"
                  disabled={busy || !projectId}
                  onClick={() =>
                    void act(async () => {
                      await api.githubUnlink(projectId);
                      setLinkNote(t("githubManual"));
                      onImported?.();
                    }, "source")
                  }
                >
                  {t("githubUnlink")}
                </button>
              </div>
              {linkNote && <p role="status">{linkNote}</p>}
            </details>
          </>
        )}
      </details>
    </section>
  );
}
