"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { validateGithub, validateName } from "@/lib/presentation";
import { useSession } from "@/components/session";
import { EvidenceCard, Notes, PageHeader, Empty } from "@/components/ui";
import { ProcessingState, ButtonProgress } from "@/components/feedback";
import { ProfilePanel } from "@/components/profile-panel";

export default function CandidatePage() {
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
    const error = validateName(name, "Aday adı");
    setValidation(error || "");
    if (error) return;
    void s.act("Aday oluşturuluyor…", async () =>
      s.saveCandidate(await api.createCandidate({ name: name.trim() })),
    );
  }
  function projectSubmit(e: FormEvent) {
    e.preventDefault();
    const error =
      validateName(projectName, "Proje adı") || validateGithub(url.trim());
    setValidation(error || "");
    if (error || !candidate) return;
    void s.act("Proje oluşturuluyor…", async () =>
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
    <>
      <PageHeader
        step="SİZİN HİKÂYENİZ"
        title={
          candidate
            ? "Profilinize yeni bir dayanak."
            : "Bir başlangıç. Sizinle."
        }
      >
        Projelerinizi, öğrendiklerinizi ve katkılarınızı dayanaklarıyla bir
        araya getirin.
      </PageHeader>
      <ol className="journey-steps" aria-label="Profil oluşturma adımları">
        {[
          ["Profil", !!candidate],
          ["Proje", !!project],
          ["Kanıtlar", !!run],
        ].map(([label, complete], i) => (
          <li key={String(label)} data-complete={complete}>
            <span>{complete ? "✓" : i + 1}</span>
            {label}
            <small>{complete ? "Kaydedildi" : "Bekliyor"}</small>
          </li>
        ))}
      </ol>
      {candidate && (
        <nav className="action-bar" aria-label="Profil işlemleri">
          <a className="button" href="#experiences">
            + Deneyim ekle
          </a>
          <Link className="button secondary" href="/profil">
            Yaşayan profili görüntüle →
          </Link>
          <span className="small">
            Hackathon, eğitim, sertifika ve daha fazlası
          </span>
        </nav>
      )}
      <div className="candidate-workspace">
        <div className="stack">
          {validation && (
            <p id="form-error" className="error" role="alert">
              {validation}
            </p>
          )}
          <section className="panel">
            <div className="section-title">
              <span className="mini-number">01</span>
              <h2>Profiliniz</h2>
              {candidate && <span className="badge observed">Kaydedildi</span>}
            </div>
            {candidate ? (
              <p className="saved-name">{candidate.name}</p>
            ) : (
              <form onSubmit={candidateSubmit} noValidate>
                <label htmlFor="candidate-name">
                  Aday adı <span className="required">*</span>
                </label>
                <input
                  id="candidate-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  required
                  autoComplete="name"
                  aria-invalid={
                    !!validation && !!validateName(name, "Aday adı")
                  }
                  aria-describedby={validation ? "form-error" : undefined}
                />
                <button className="button" disabled={disabled}>
                  <ButtonProgress active={!!s.busy} />
                  {s.busy === "Aday oluşturuluyor…"
                    ? "Oluşturuluyor…"
                    : "Profilimi oluştur"}
                </button>
              </form>
            )}
          </section>
          <section className="panel">
            <div className="section-title">
              <span className="mini-number">02</span>
              <h2>Projenizi ekleyin</h2>
              {project && <span className="badge observed">Kaydedildi</span>}
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
                    void s.act("Proje analiz ediliyor…", async () => {
                      const result = await api.analyze(project.id);
                      s.saveAnalysis(result.run, result.evidence);
                    })
                  }
                >
                  <ButtonProgress
                    active={s.busy === "Proje analiz ediliyor…"}
                  />
                  {s.busy === "Proje analiz ediliyor…"
                    ? "Analiz ediliyor…"
                    : run
                      ? "Projeyi yeniden analiz et"
                      : "Projeyi analiz et"}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
              </>
            ) : !candidate ? (
              <p className="muted">
                Proje eklemek için önce aday bilgisini kaydedin.
              </p>
            ) : (
              <form onSubmit={projectSubmit} noValidate>
                <label htmlFor="project-name">
                  Proje adı <span className="required">*</span>
                </label>
                <input
                  id="project-name"
                  value={projectName}
                  aria-invalid={
                    !!validation && !!validateName(projectName, "Proje adı")
                  }
                  aria-describedby={validation ? "form-error" : undefined}
                  onChange={(e) => setProjectName(e.target.value)}
                  maxLength={200}
                  required
                />
                <label htmlFor="project-description">
                  Kısa açıklama <span className="optional">İsteğe bağlı</span>
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={20000}
                  rows={3}
                />
                <label htmlFor="github-url">
                  Herkese açık GitHub deposunun adresi{" "}
                  <span className="required">*</span>
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
                  Yalnızca herkese açık GitHub depoları analiz edilebilir.
                </p>
                <button className="button" disabled={disabled}>
                  <ButtonProgress active={!!s.busy} />
                  {s.busy === "Proje oluşturuluyor…"
                    ? "Kaydediliyor…"
                    : "Projeyi kaydet"}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
      {s.busy === "Proje analiz ediliyor…" && (
        <ProcessingState kind="project" />
      )}
      <p className="method-note">
        README’de bir teknolojinin geçmesi, gözlemlenen kullanım değildir.
        Kaynak dosyalar, bağımlılıklar ve deponun dil bilgisi birlikte
        incelenir. Kanıt gücü, beceri seviyesi değildir.
      </p>
      {candidate && (
        <ProfilePanel key={candidate.id} candidateId={candidate.id} />
      )}
      {run && (
        <section className="result-section">
          <div className="section-heading horizontal">
            <div>
              <p className="eyebrow">ANALİZ SONUCU</p>
              <h2>Beceri sinyalleri ve kanıtlar</h2>
              <p className="muted">
                {evidence.length} kanıt kaydı · {run.provider || "Analiz"}{" "}
                {run.model && ` / ${run.model}`}
              </p>
            </div>
            <Link className="button secondary" href="/ihtiyac">
              Kurum ihtiyacına geç <span aria-hidden="true">→</span>
            </Link>
          </div>
          {evidence.length ? (
            <>
              <div className="evidence-filter">
                <label htmlFor="skill-filter">Beceriye göre incele</label>
                <select
                  id="skill-filter"
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                >
                  <option value="">Tüm kanıtlar ({evidence.length})</option>
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
              <div className="evidence-grid">
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
            <Empty title="Bu projede kanıt bulunamadı">
              Bu sonuç, adayın beceriye sahip olmadığı anlamına gelmez.
              İncelenen depo içeriği sınırlıdır.
            </Empty>
          )}
          <Notes title="Analiz sınırlamaları" items={run.limitations} />
          <Notes title="Belirsizlikler" items={run.uncertainties} />
        </section>
      )}
    </>
  );
}
