"use client";
import { useState, useRef, useEffect } from "react";
import { api, userError, type Model } from "@/lib/api/client";
import { t } from "../i18n/index";
import { useLocale } from "../i18n/react";

export function ProfessionalImport({
  candidateId,
  changed,
}: {
  candidateId: string;
  changed: () => void;
}) {
  useLocale();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [records, setRecords] = useState<Model<"ProfileEvidenceCreate">[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  async function act(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await task();
    } catch (e) {
      setError(userError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function reset() {
    setRecords([]);
    setSelected([]);
    setSaved(false);
    setError("");
  }
  return (
    <section className="candidate-section professional-import" aria-busy={busy}>
      <h2 ref={heading} tabIndex={-1}>
        {t("professionalHeading")}
      </h2>
      <p>{t("professionalNote")}</p>
      {error && (
        <p id="professional-error" role="alert" className="error">
          {error}
        </p>
      )}
      {saved && <p role="status">{t("professionalSaved")}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            setRecords([]);
            setSelected([]);
            const result = await api.professionalPreview(candidateId, {
              source_url: url,
              text,
            });
            setRecords(result.records);
            setSelected(result.records.map((_, i) => i));
          });
        }}
      >
        <label>
          {t("professionalUrl")}
          <input
            aria-describedby={error ? "professional-error" : undefined}
            type="url"
            required
            value={url}
            disabled={busy}
            maxLength={2000}
            placeholder="https://www.linkedin.com/in/your-profile"
            onChange={(e) => {
              setUrl(e.target.value);
              reset();
            }}
          />
        </label>
        <label>
          {t("professionalText")}
          <textarea
            value={text}
            disabled={busy}
            maxLength={20000}
            rows={7}
            onChange={(e) => {
              setText(e.target.value);
              reset();
            }}
          />
        </label>
        <p className="small">{t("professionalFormat")}</p>
        <button className="button secondary" disabled={busy}>
          {t("professionalPreview")}
        </button>
      </form>
      {records.length > 0 && (
        <div>
          <h3>{t("professionalConfirm")}</h3>
          {records.map((r, i) => (
            <article key={i}>
              <label className="source-choice">
                <input
                  type="checkbox"
                  checked={selected.includes(i)}
                  disabled={busy}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, i]
                        : selected.filter((n) => n !== i),
                    )
                  }
                />
                {r.title}
              </label>
              <p>
                {r.organization} {r.role} {r.started_at} {r.ended_at}
              </p>
              <p className="break">{r.description}</p>
              <p>{t(text ? "declaredLabel" : "linkedReference")}</p>
            </article>
          ))}
          <button
            className="button"
            disabled={busy || !selected.length}
            onClick={() =>
              void act(async () => {
                await api.professionalImport(candidateId, {
                  source_url: url,
                  text,
                  selected,
                  confirmed: true,
                });
                setRecords([]);
                setSelected([]);
                setText("");
                setSaved(true);
                changed();
              })
            }
          >
            {t("professionalSave")}
          </button>
        </div>
      )}
    </section>
  );
}
