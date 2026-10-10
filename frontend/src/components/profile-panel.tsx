"use client";
import { t, tx } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  api,
  userError,
  type Model,
  type ProfileEvidence,
} from "@/lib/api/client";
import {
  categoryLabels,
  outputLabels,
  participationLabels,
  safeProfileSource,
} from "@/lib/profile";
import { useSession } from "./session";
import { ProfileCard } from "./profile-card";
import { useContentMotion } from "./use-content-motion";
import { ExperienceChooser } from "./experience-chooser";
import { LoadingState, SuccessNotice, ButtonProgress } from "./feedback";

type Category = ProfileEvidence["category"];
function Field({
  name,
  label,
  value,
  type = "text",
  max = 200,
  required = false,
}: {
  name: string;
  label: string;
  value?: string | number | null;
  type?: string;
  max?: number;
  required?: boolean;
}) {
  useLocale();

  return (
    <div>
      <label htmlFor={`profile-${name}`}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      <input
        id={`profile-${name}`}
        name={name}
        type={type}
        defaultValue={value || ""}
        maxLength={max}
        required={required}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 6 : undefined}
      />
    </div>
  );
}

export function ProfilePanel({
  candidateId,
  compact = false,
  entryCategory,
  onSaved,
  onCancel,
  onEntryOpen,
}: {
  candidateId: string;
  compact?: boolean;
  entryCategory?: Category | "choose";
  onSaved?: () => void;
  onCancel?: () => void;
  onEntryOpen?: () => void;
}) {
  useLocale();

  const session = useSession();
  const { ref: motionRef, transition } = useContentMotion();
  const [items, setItems] = useState<ProfileEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [retry, setRetry] = useState(0);
  const [stage, setStage] = useState<"choose" | "form">(
    entryCategory && entryCategory !== "choose" ? "form" : "choose",
  );
  const chooserHeading = useRef<HTMLHeadingElement>(null);
  const [category, setCategory] = useState<Category>(
    entryCategory && entryCategory !== "choose" ? entryCategory : "education",
  );
  const [editing, setEditing] = useState<ProfileEvidence>();
  const [formVersion, setFormVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [notice, setNotice] = useState("");
  const formHeading = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState("");
  const actionLock = useRef(false);
  async function act(label: string, task: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(userError(e));
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }
  const disabled = !!busy || !!session.busy || !session.ready || loading;
  useEffect(() => {
    let active = true;
    api
      .profiles(candidateId)
      .then((data) => {
        if (active) {
          setItems(data);
          setLoading(false);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(userError(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [candidateId, retry]);
  const previousStage = useRef(stage);
  useEffect(() => {
    if (stage === "form")
      formHeading.current?.focus({ preventScroll: !entryCategory });
    else if (previousStage.current === "form")
      chooserHeading.current?.focus({ preventScroll: true });
    previousStage.current = stage;
  }, [stage, category, editing, entryCategory]);
  useEffect(() => {
    if (window.location.hash === "#experiences") {
      document.getElementById("experiences")?.scrollIntoView();
      chooserHeading.current?.focus({ preventScroll: true });
    }
  }, []);
  function resetForm() {
    setEditing(undefined);
    setValidation("");
    setFormVersion((v) => v + 1);
  }
  function chooseCategory(next: Category, item?: ProfileEvidence) {
    const box = motionRef.current?.getBoundingClientRect();
    if (box && (box.bottom < 0 || box.top > window.innerHeight)) {
      motionRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
    if (!entryCategory) onEntryOpen?.();
    void transition(() => {
      resetForm();
      setCategory(next);
      setEditing(item);
      setStage("form");
      setConfirmDelete("");
      setError("");
      setNotice("");
    });
  }
  async function closeForm(notify = true) {
    await transition(() => {
      resetForm();
      setStage("choose");
    }, -1);
    if (notify) onCancel?.();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    const source = value("source_url");
    if (!value("title") || (source && !safeProfileSource(source))) {
      setValidation(!value("title") ? t("m338") : t("m339"));
      return;
    }
    const metadata: Record<string, string | number> = {};
    const keys =
      category === "portfolio"
        ? ["output_type"]
        : category === "education"
          ? ["program", "education_type", "status", "student_year"]
          : category === "certification"
            ? ["credential_id", "issued_at", "expires_at"]
            : category === "hackathon"
              ? ["project_name", "result"]
              : category === "community"
                ? ["participation_type", "responsibility", "focus"]
                : ["participation_type", "responsibility"];
    for (const key of keys)
      if (value(key))
        metadata[key] =
          key === "student_year" ? Number(value(key)) : value(key);
    const data: Model<"ProfileEvidenceCreate"> = {
      category,
      title: value("title"),
      organization: value("organization"),
      role: value("role"),
      description: value("description"),
      started_at: value("started_at") || null,
      ended_at: value("ended_at") || null,
      source_url: source || null,
      source_label: value("source_label"),
      metadata_json: metadata as Model<"ProfileMetadata">,
    };
    setError("");
    setValidation("");
    setNotice("");
    void act(t("m340"), async () => {
      const { category: _category, ...patch } = data;
      void _category;
      const saved = editing
        ? await api.updateProfile(editing.id, patch)
        : await api.createProfile(candidateId, data);
      setItems((current) =>
        editing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
      await closeForm(false);
      setNotice(t("m341"));
      onSaved?.();
    });
  }
  const meta = editing?.metadata_json;
  return (
    <section
      className="candidate-section profile-section"
      id={compact ? "profile-records" : "experiences"}
      aria-labelledby="profile-section-title"
    >
      <div className="section-heading">
        {!compact && <p className="eyebrow">{t("m045")}</p>}
        <h2 id="profile-section-title">{t("m046")}</h2>
        {!compact && <p className="muted">{t("m342")}</p>}
      </div>
      {notice && (
        <div>
          <SuccessNotice message={notice} onDismiss={() => setNotice("")} />
          <Link className="button secondary" href="/profil">
            {t("m343")}
          </Link>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{tx(error)}</p>
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => {
              setLoading(true);
              setRetry((v) => v + 1);
            }}
          >
            {t("m344")}
          </button>
        </div>
      )}
      <div className={compact ? "experience-compact" : "experience-studio"}>
        {(!compact || stage === "form" || entryCategory === "choose") && (
          <section
            className="panel profile-form"
            id="experience-form"
            data-stage={stage}
            onKeyDown={(event) => {
              if (event.key === "Escape" && stage === "form" && !disabled) {
                void closeForm();
              }
            }}
          >
            <div ref={motionRef} className="motion-viewport">
              <div className="motion-content experience-content">
                <h3
                  ref={chooserHeading}
                  tabIndex={-1}
                  className={stage === "choose" ? "studio-title" : "sr-only"}
                >
                  {t("m243")}
                </h3>
                {stage === "choose" ? (
                  <>
                    <p className="muted">{t("m345")}</p>
                    <ExperienceChooser
                      disabled={disabled}
                      onChoose={chooseCategory}
                    />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="text-button back-link"
                      disabled={disabled}
                      onClick={() => {
                        void closeForm();
                      }}
                    >
                      {t(compact ? "sourceClose" : "m346")}
                    </button>
                    <h3
                      ref={formHeading}
                      tabIndex={-1}
                      className="studio-title"
                    >
                      {editing
                        ? t("m347")
                        : `${categoryLabels[category]} deneyiminiz`}
                    </h3>
                    <p className="muted">{t("m348")}</p>
                    {editing && <p className="callout">{t("m349")}</p>}
                    <form
                      key={`${formVersion}-${editing?.id || "new"}-${category}`}
                      onSubmit={submit}
                    >
                      <fieldset disabled={disabled} className="profile-fields">
                        {validation && (
                          <p className="error" role="alert">
                            {validation}
                          </p>
                        )}
                        <Field
                          name="title"
                          label={
                            category === "education"
                              ? t("m350")
                              : category === "certification"
                                ? t("m351")
                                : category === "hackathon"
                                  ? t("m352")
                                  : category === "portfolio"
                                    ? t("m353")
                                    : t("m354")
                          }
                          value={editing?.title}
                          required
                        />
                        <Field
                          name="organization"
                          label={
                            category === "certification" ? t("m355") : t("m356")
                          }
                          value={editing?.organization}
                        />
                        <details
                          className="form-details"
                          open={editing ? true : undefined}
                        >
                          <summary>
                            {t("m357")}{" "}
                            <span className="optional">{t("m029")}</span>
                          </summary>
                          <p className="small">{t("m358")}</p>
                          {category === "portfolio" && (
                            <div>
                              <label htmlFor="profile-output_type">
                                {t("m359")}
                              </label>
                              <select
                                id="profile-output_type"
                                name="output_type"
                                defaultValue={meta?.output_type || ""}
                              >
                                <option value="">{t("m360")}</option>
                                {Object.entries(outputLabels).map(
                                  ([key, label]) => (
                                    <option value={key} key={key}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                              <p className="small">{t("m361")}</p>
                            </div>
                          )}
                          {category === "education" && (
                            <>
                              <Field
                                name="program"
                                label={t("m362")}
                                value={meta?.program}
                              />
                              <label htmlFor="profile-education_type">
                                {t("m363")}
                              </label>
                              <select
                                id="profile-education_type"
                                name="education_type"
                                defaultValue={meta?.education_type || ""}
                              >
                                <option value="">{t("m360")}</option>
                                <option value="degree">{t("m326")}</option>
                                <option value="course">{t("m364")}</option>
                                <option value="bootcamp">{t("m365")}</option>
                                <option value="other">{t("m325")}</option>
                              </select>
                              <label htmlFor="profile-status">
                                {t("m366")}
                              </label>
                              <select
                                id="profile-status"
                                name="status"
                                defaultValue={meta?.status || ""}
                              >
                                <option value="">{t("m360")}</option>
                                <option value="ongoing">{t("m367")}</option>
                                <option value="completed">{t("m327")}</option>
                                <option value="left">{t("m328")}</option>
                              </select>
                              <Field
                                name="student_year"
                                label={t("m368")}
                                type="number"
                                value={meta?.student_year}
                              />
                              <p className="field-help">{t("m369")}</p>
                            </>
                          )}
                          {category === "certification" && (
                            <>
                              <Field
                                name="issued_at"
                                label={t("m370")}
                                type="date"
                                value={meta?.issued_at}
                              />
                              <Field
                                name="expires_at"
                                label={t("m371")}
                                type="date"
                                value={meta?.expires_at}
                              />
                              <Field
                                name="credential_id"
                                label={t("m372")}
                                value={meta?.credential_id}
                              />
                            </>
                          )}
                          {category === "hackathon" && (
                            <>
                              <Field
                                name="project_name"
                                label={t("m002")}
                                value={meta?.project_name}
                              />
                              <label htmlFor="profile-result">
                                {t("m373")}
                              </label>
                              <select
                                id="profile-result"
                                name="result"
                                defaultValue={meta?.result || ""}
                              >
                                <option value="">{t("m360")}</option>
                                <option value="participant">{t("m332")}</option>
                                <option value="finalist">{t("m374")}</option>
                                <option value="winner">{t("m333")}</option>
                              </select>
                            </>
                          )}
                          {(category === "event" ||
                            category === "community") && (
                            <>
                              {category === "community" && (
                                <>
                                  <label htmlFor="profile-focus">
                                    {t("m375")}
                                  </label>
                                  <select
                                    id="profile-focus"
                                    name="focus"
                                    defaultValue={meta?.focus || ""}
                                  >
                                    <option value="">{t("m360")}</option>
                                    <option value="technology">
                                      {t("m376")}
                                    </option>
                                    <option value="other">{t("m325")}</option>
                                  </select>
                                </>
                              )}
                              <label htmlFor="profile-participation_type">
                                {t("m377")}
                              </label>
                              <select
                                id="profile-participation_type"
                                name="participation_type"
                                defaultValue={meta?.participation_type || ""}
                              >
                                <option value="">{t("m360")}</option>
                                {Object.entries(participationLabels).map(
                                  ([key, label]) => (
                                    <option key={key} value={key}>
                                      {label}
                                    </option>
                                  ),
                                )}
                              </select>
                              <Field
                                name="responsibility"
                                label={t("responsibility")}
                                max={1000}
                                value={meta?.responsibility}
                              />
                            </>
                          )}
                          <Field
                            name="role"
                            label={t("m378")}
                            value={editing?.role}
                          />
                          <div className="profile-dates">
                            <Field
                              name="started_at"
                              label={t("m379")}
                              type="date"
                              value={editing?.started_at}
                            />
                            <Field
                              name="ended_at"
                              label={t("m380")}
                              type="date"
                              value={editing?.ended_at}
                            />
                          </div>
                          <label htmlFor="profile-description">
                            {category === "hackathon" ? t("m381") : t("m382")}
                          </label>
                          <textarea
                            id="profile-description"
                            name="description"
                            defaultValue={editing?.description || ""}
                            maxLength={4000}
                            rows={3}
                          />
                        </details>
                        <Field
                          name="source_url"
                          label={t("m383")}
                          type="url"
                          max={2000}
                          value={editing?.source_url}
                        />
                        <Field
                          name="source_label"
                          label={t("m384")}
                          value={editing?.source_label}
                        />
                        <p className="field-help">{t("m385")}</p>
                        <div className="profile-actions">
                          <button className="button">
                            <ButtonProgress active={busy === t("m340")} />
                            {busy === t("m340")
                              ? t("m032")
                              : editing
                                ? t("m386")
                                : t("saveExperience")}
                          </button>
                          {editing && (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => {
                                void closeForm();
                              }}
                            >
                              {t("m387")}
                            </button>
                          )}
                        </div>
                      </fieldset>
                    </form>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
        <section className="profile-timeline" aria-label={t("savedExperience")}>
          <h3>
            {t("m388")}
            <span className="count">{items.length}</span>
          </h3>
          {loading ? (
            <LoadingState label={t("m389")} skeleton />
          ) : (
            !items.length && (
              <div className="empty">
                <h3>{t("m390")}</h3>
                <p>{t("m391")}</p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => {
                    chooseCategory("hackathon");
                  }}
                >
                  {t("m392")}
                </button>
              </div>
            )
          )}
          {items.map((item) => (
            <div key={item.id} className="profile-entry">
              <ProfileCard item={item} />
              <details className="source-details">
                <summary>{t("sourceDetails")}</summary>
                <div className="profile-actions">
                  <button
                    className="button secondary"
                    disabled={disabled}
                    onClick={() => {
                      chooseCategory(item.category, item);
                    }}
                  >
                    {t("m393")}
                    <span className="sr-only">: {item.title}</span>
                  </button>
                  <button
                    className="button danger"
                    disabled={disabled}
                    onClick={() => setConfirmDelete(item.id)}
                  >
                    {t("m394")}
                    <span className="sr-only">: {item.title}</span>
                  </button>
                </div>
                {confirmDelete === item.id && (
                  <div className="callout">
                    <p>
                      “{item.title}
                      {t("m395")}
                    </p>
                    <div className="profile-actions">
                      <button
                        className="button danger"
                        disabled={disabled}
                        onClick={() =>
                          void act(t("m396"), async () => {
                            await api.deleteProfile(item.id);
                            setItems((current) =>
                              current.filter((p) => p.id !== item.id),
                            );
                            setConfirmDelete("");
                            if (editing?.id === item.id) resetForm();
                            setNotice(t("m397"));
                            onSaved?.();
                          })
                        }
                      >
                        {busy === t("m396") ? t("m398") : t("confirmDelete")}
                      </button>
                      <button
                        className="button secondary"
                        disabled={disabled}
                        onClick={() => setConfirmDelete("")}
                      >
                        {t("m387")}
                      </button>
                    </div>
                  </div>
                )}
              </details>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
