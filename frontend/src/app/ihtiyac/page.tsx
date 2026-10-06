"use client";
import { t, tx } from "../../i18n/index.ts";
import { useLocale } from "../../i18n/react";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { validateNeed } from "@/lib/presentation";
import { useSession } from "@/components/session";
import { PageHeader, CriterionCard, Notes, Empty } from "@/components/ui";
import { ProcessingState, ButtonProgress } from "@/components/feedback";
export default function NeedPage() {
  useLocale();

  const s = useSession();
  const [description, setDescription] = useState("");
  const [role, setRole] = useState(s.data.need?.target_role || "");
  const [output, setOutput] = useState(s.data.need?.expected_output || "");
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const message = validateNeed(description);
    setError(message || "");
    if (message) return;
    void s.act(t("m064"), async () =>
      s.saveNeed(
        await api.createNeed({
          description: description.trim(),
          target_role: role.trim() || null,
          expected_output: output.trim() || null,
        }),
      ),
    );
  }
  return (
    <div className="need-page">
      <PageHeader step={t("m065")} title={t("m066")}>
        {t("m067")}
      </PageHeader>
      <div className="need-workspace">
        <section className="panel">
          <div className="section-title">
            <h2>{t("m068")}</h2>
            <button
              type="button"
              className="text-button"
              disabled={!!s.busy}
              onClick={() => {
                setDescription(t("needExample"));
                setRole(t("m069"));
                setOutput(t("m070"));
              }}
            >
              {t("m071")}
            </button>
          </div>
          <p className="field-help">{t("m072")}</p>
          <form onSubmit={submit} noValidate>
            {error && (
              <p id="need-error" className="error" role="alert">
                {tx(error)}
              </p>
            )}
            <label htmlFor="need-description">
              {t("m073")}
              <span className="required">*</span>
            </label>
            <textarea
              id="need-description"
              rows={7}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={20000}
              required
              aria-describedby={error ? "need-error" : undefined}
              aria-invalid={!!error}
              placeholder={t("needPlaceholder")}
            />
            <details className="form-details">
              <summary>
                {t("m074")} <span className="optional">{t("m029")}</span>
              </summary>
              <label htmlFor="role">
                {t("m075")}
                <span className="optional">{t("m029")}</span>
              </label>
              <input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                maxLength={200}
              />
              <label htmlFor="output">
                {t("m076")}
                <span className="optional">{t("m029")}</span>
              </label>
              <textarea
                id="output"
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </details>
            <button className="button" disabled={!s.ready || !!s.busy}>
              <ButtonProgress active={!!s.busy} />
              {s.busy ? t("m077") : t("m078")} <span aria-hidden="true">↗</span>
            </button>
          </form>
          {s.data.need && (
            <button
              type="button"
              className="text-button"
              disabled={!!s.busy}
              onClick={() =>
                void s.act(t("m079"), async () =>
                  s.saveNeed(
                    await api.updateNeed(s.data.need!.id, {
                      target_role: role.trim() || null,
                      expected_output: output.trim() || null,
                    }),
                  ),
                )
              }
            >
              {t("m080")}
            </button>
          )}
        </section>
      </div>
      {s.busy === t("m064") && <ProcessingState kind="need" />}
      {s.data.need && (
        <section className="result-section content-enter">
          <div className="section-heading horizontal">
            <div>
              <p className="eyebrow">{t("m081")}</p>
              <h2>{t("m082")}</h2>
              <p className="muted">{s.data.need.target_role || t("m083")}</p>
            </div>
            <Link href="/kesif" className="button secondary">
              {t("m084")}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          {s.data.need.criteria.length ? (
            <div className="criteria-grid">
              {(["required", "preferred"] as const).map((priority) => (
                <section key={priority}>
                  <h3>
                    {priority === "required"
                      ? t("requiredCriteria")
                      : t("preferredCriteria")}
                  </h3>
                  {s.data
                    .need!.criteria.filter((c) => c.priority === priority)
                    .map((c) => (
                      <CriterionCard key={c.id} item={c} />
                    ))}
                  {!s.data.need!.criteria.some(
                    (c) => c.priority === priority,
                  ) && <p className="muted">{t("m085")}</p>}
                </section>
              ))}
            </div>
          ) : (
            <Empty title={t("m086")}>{t("m087")}</Empty>
          )}
          <Notes title={t("uncertainties")} items={s.data.need.uncertainties} />
        </section>
      )}
    </div>
  );
}
