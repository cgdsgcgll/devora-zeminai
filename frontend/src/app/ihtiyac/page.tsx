"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { validateNeed } from "@/lib/presentation";
import { useSession } from "@/components/session";
import { PageHeader, CriterionCard, Notes, Empty } from "@/components/ui";
import { ProcessingState, ButtonProgress } from "@/components/feedback";
export default function NeedPage() {
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
    void s.act("İhtiyaç kriterleri hazırlanıyor…", async () =>
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
      <PageHeader
        step="KURUM İHTİYACI"
        title="Nasıl bir ekip arkadaşı arıyorsunuz?"
      >
        İhtiyacı kendi cümlelerinizle anlatın. Gerekli beceriler ve
        tercihlerinizi açıkça ayırın.
      </PageHeader>
      <div className="need-workspace">
        <section className="panel">
          <div className="section-title">
            <h2>İhtiyacınız</h2>
            <button
              type="button"
              className="text-button"
              disabled={!!s.busy}
              onClick={() => {
                setDescription(
                  "Python ve FastAPI zorunlu; Docker tercih sebebidir.",
                );
                setRole("Backend geliştirici");
                setOutput("Belgelenmiş bir REST API");
              }}
            >
              Örnekle başla
            </button>
          </div>
          <p className="field-help">
            Örnek metni düzenleyebilirsiniz. Kriterler, gönderdiğiniz
            açıklamadan hazırlanır.
          </p>
          <form onSubmit={submit} noValidate>
            {error && (
              <p id="need-error" className="error" role="alert">
                {error}
              </p>
            )}
            <label htmlFor="need-description">
              İhtiyaç açıklaması <span className="required">*</span>
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
              placeholder="Hangi teknolojiler gerekli? Hangileri tercih sebebi?"
            />
            <details className="form-details">
              <summary>
                Rol ve beklenen çıktı{" "}
                <span className="optional">İsteğe bağlı</span>
              </summary>
              <label htmlFor="role">
                Hedef rol <span className="optional">İsteğe bağlı</span>
              </label>
              <input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                maxLength={200}
              />
              <label htmlFor="output">
                Beklenen çıktı <span className="optional">İsteğe bağlı</span>
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
              {s.busy
                ? "İhtiyaç yapılandırılıyor…"
                : "İhtiyacı yapılandır"}{" "}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          {s.data.need && (
            <button
              type="button"
              className="text-button"
              disabled={!!s.busy}
              onClick={() =>
                void s.act("İhtiyaç bilgileri güncelleniyor…", async () =>
                  s.saveNeed(
                    await api.updateNeed(s.data.need!.id, {
                      target_role: role.trim() || null,
                      expected_output: output.trim() || null,
                    }),
                  ),
                )
              }
            >
              Seçili ihtiyacın rol / çıktı bilgisini güncelle
            </button>
          )}
        </section>
      </div>
      {s.busy === "İhtiyaç kriterleri hazırlanıyor…" && (
        <ProcessingState kind="need" />
      )}
      {s.data.need && (
        <section className="result-section">
          <div className="section-heading horizontal">
            <div>
              <p className="eyebrow">YAPILANDIRILMIŞ İHTİYAÇ</p>
              <h2>Beklentiler netleşti.</h2>
              <p className="muted">
                {s.data.need.target_role || "Kurum ihtiyacı"}
              </p>
            </div>
            <Link href="/kesif" className="button secondary">
              Adayları keşfet <span aria-hidden="true">→</span>
            </Link>
          </div>
          {s.data.need.criteria.length ? (
            <div className="criteria-grid">
              {(["required", "preferred"] as const).map((priority) => (
                <section key={priority}>
                  <h3>
                    {priority === "required"
                      ? "Gerekli kriterler"
                      : "Tercih edilen kriterler"}
                  </h3>
                  {s.data
                    .need!.criteria.filter((c) => c.priority === priority)
                    .map((c) => (
                      <CriterionCard key={c.id} item={c} />
                    ))}
                  {!s.data.need!.criteria.some(
                    (c) => c.priority === priority,
                  ) && <p className="muted">Bu grupta kriter yok.</p>}
                </section>
              ))}
            </div>
          ) : (
            <Empty title="Teknik kriter çıkarılamadı">
              Açıklamada beceri ve teknoloji adlarını netleştirip yeniden
              deneyin. Boş kriterlerle eşleşme hesaplanamaz.
            </Empty>
          )}
          <Notes title="Belirsizlikler" items={s.data.need.uncertainties} />
        </section>
      )}
    </div>
  );
}
