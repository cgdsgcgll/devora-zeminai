"use client";
import { t, tx } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";

import { useEffect, useState } from "react";
import {
  api,
  userError,
  type Model,
  type Project,
  type ProfileEvidence,
} from "@/lib/api/client";
import { useSession } from "@/components/session";
import { PageHeader } from "@/components/ui";
import { safeProfileSource, provenanceLabels } from "@/lib/profile";
function ProofCard({
  item,
  refresh,
  projects,
  profiles,
}: {
  item: Model<"ProofItem">;
  refresh: () => void;
  projects: Project[];
  profiles: ProfileEvidence[];
}) {
  useLocale();

  const { user } = useSession();
  const [kind, setKind] = useState("project");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = {
    open: t("m088"),
    submitted: t("m089"),
    closed: t("m090"),
    cancelled: t("m091"),
  };
  const submit = async (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await task();
      refresh();
    } catch (e) {
      setError(userError(e));
    } finally {
      setBusy(false);
    }
  };
  const attached = item.submission;
  const url = safeProfileSource(attached?.source_url);
  return (
    <article className="criterion proof-card">
      <div className="card-heading">
        <h2>{item.title}</h2>
        <span className="badge">{status[item.status]}</span>
      </div>
      <p>
        <strong>{item.criterion_label}</strong>
      </p>
      <p>{item.instructions}</p>
      {attached && (
        <section>
          <h3>{t("m092")}</h3>
          <p>{attached.title}</p>
          <p>{provenanceLabels[attached.status]}</p>
          <p>{attached.note}</p>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer">
              {t("m093")}
            </a>
          )}
          {attached.evidence?.map((e, i) => (
            <p key={i}>
              {provenanceLabels[e.status]} · {e.skill_label}: {e.summary}
            </p>
          ))}
          <p className="small">{t("m094")}</p>
        </section>
      )}
      {user?.role === "candidate" && item.status === "open" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(() =>
              api.submitProof(item.id, {
                note,
                ...(kind === "project"
                  ? { project_id: source }
                  : kind === "profile"
                    ? { profile_evidence_id: source }
                    : { source_url: source }),
              }),
            );
          }}
        >
          <label>
            {t("m095")}
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setSource("");
              }}
            >
              <option value="project">{t("m096")}</option>
              <option value="profile">{t("m097")}</option>
              <option value="link">{t("m098")}</option>
            </select>
          </label>
          {kind === "link" ? (
            <label>
              {t("m099")}
              <input
                required
                type="url"
                maxLength={2000}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </label>
          ) : (
            <label>
              {t("m100")}
              <select
                required
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">{t("m101")}</option>
                {(kind === "project" ? projects : profiles).map((p) => (
                  <option key={p.id} value={p.id}>
                    {"name" in p ? p.name : p.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t("m102")}
            <textarea
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="small">{t("m103")}</p>
          <button className="button" disabled={busy}>
            {busy ? t("m104") : t("m105")}
          </button>
        </form>
      )}
      {user?.role === "institution" && (
        <div className="profile-actions">
          {item.status === "submitted" && (
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void submit(() => api.reviewProof(item.id, "closed"))
                }
              >
                {t("m106")}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  void submit(() => api.reviewProof(item.id, "open"))
                }
              >
                {t("m107")}
              </button>
            </>
          )}
          {["open", "submitted"].includes(item.status) && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void submit(() => api.reviewProof(item.id, "cancelled"))
              }
            >
              {t("m108")}
            </button>
          )}
        </div>
      )}
      {error && <p role="alert">{tx(error)}</p>}
    </article>
  );
}
export default function ProofInbox() {
  useLocale();

  const { user, data, ready } = useSession();
  const [items, setItems] = useState<Model<"ProofItem">[]>();
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<ProfileEvidence[]>([]);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    if (ready && user)
      Promise.all([
        api.proofRequests(page * 20),
        ...(user.role === "candidate" && data.candidate
          ? [api.projects(data.candidate.id), api.profiles(data.candidate.id)]
          : []),
      ])
        .then(([requests, ps, es]) => {
          if (active) {
            setItems(requests as Model<"ProofItem">[]);
            setProjects((ps || []) as Project[]);
            setProfiles((es || []) as ProfileEvidence[]);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(userError(e));
        });
    return () => {
      active = false;
    };
  }, [ready, user, data.candidate, page, revision]);
  return (
    <div>
      <PageHeader step={t("m109")} title={t("m110")}>
        {t("m111")}
      </PageHeader>
      {error && <p role="alert">{tx(error)}</p>}
      {!items && !error && <p role="status">{t("m112")}</p>}
      {items?.length === 0 && <p>{t("m113")}</p>}
      {items?.map((item) => (
        <ProofCard
          key={item.id + item.updated_at}
          item={item}
          projects={projects}
          profiles={profiles}
          refresh={() => setRevision((v) => v + 1)}
        />
      ))}
      <div className="view-switch">
        <button
          className="button secondary"
          disabled={page === 0}
          onClick={() => {
            setItems(undefined);
            setPage((v) => v - 1);
          }}
        >
          {t("m114")}
        </button>
        <button
          className="button secondary"
          disabled={items?.length !== 20}
          onClick={() => {
            setItems(undefined);
            setPage((v) => v + 1);
          }}
        >
          {t("m115")}
        </button>
      </div>
    </div>
  );
}
