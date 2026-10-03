"use client";
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

export function ProfilePanel({ candidateId }: { candidateId: string }) {
  const session = useSession();
  const [items, setItems] = useState<ProfileEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [retry, setRetry] = useState(0);
  const [stage, setStage] = useState<"choose" | "form">("choose");
  const chooserHeading = useRef<HTMLHeadingElement>(null);
  const [category, setCategory] = useState<Category>("education");
  const [editing, setEditing] = useState<ProfileEvidence>();
  const [formVersion, setFormVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [notice, setNotice] = useState("");
  const formHeading = useRef<HTMLHeadingElement>(null);
  const disabled = !!session.busy || !session.ready || loading;
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
    if (stage === "form") formHeading.current?.focus();
    else if (previousStage.current === "form") chooserHeading.current?.focus();
    previousStage.current = stage;
  }, [stage, category, editing]);
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
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    const source = value("source_url");
    if (!value("title") || (source && !safeProfileSource(source))) {
      setValidation(
        !value("title")
          ? "Başlık gerekli."
          : "Kaynak için kimlik bilgisi içermeyen, herkese açık bir HTTPS adresi kullanın.",
      );
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
    void session.act("Profil kaydı kaydediliyor…", async () => {
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
      resetForm();
      setStage("choose");
      chooserHeading.current?.focus();
      setNotice(
        "Profil kaydı kaydedildi. Güncel karşılaştırma için eşleşmeyi yeniden hesaplayın.",
      );
    });
  }
  const meta = editing?.metadata_json;
  return (
    <section
      className="result-section profile-section"
      id="experiences"
      aria-labelledby="profile-section-title"
    >
      <div className="section-heading">
        <p className="eyebrow">ÜRETİMİN ÖTESİNDEKİ DAYANAKLAR</p>
        <h2 id="profile-section-title">Gelişim ve Deneyim</h2>
        <p className="muted">
          Ne öğrendiniz, nerelerde katkı verdiniz? Eğitim, sertifika ve
          deneyimlerinizi kaynaklarıyla ekleyin. Bunlar teknik beceri kanıtının
          yerini almaz.
        </p>
      </div>
      {notice && (
        <div>
          <SuccessNotice message={notice} onDismiss={() => setNotice("")} />
          <Link className="button secondary" href="/profil">
            Güncel profilimi gör →
          </Link>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => {
              setLoading(true);
              setRetry((v) => v + 1);
            }}
          >
            Kayıtları yeniden yükle
          </button>
        </div>
      )}
      <div className="experience-studio">
        <section
          className="panel profile-form"
          id="experience-form"
          data-stage={stage}
          onKeyDown={(event) => {
            if (event.key === "Escape" && stage === "form" && !disabled) {
              resetForm();
              setStage("choose");
            }
          }}
        >
          <h3
            ref={chooserHeading}
            tabIndex={-1}
            className={stage === "choose" ? "studio-title" : "sr-only"}
          >
            Deneyim ekle
          </h3>
          {stage === "choose" ? (
            <>
              <p className="muted">
                Bir kategori seçin. Ayrıntıları bir sonraki adımda ekleyin.
              </p>
              <ExperienceChooser
                disabled={disabled}
                onChoose={(next) => {
                  resetForm();
                  setCategory(next);
                  setStage("form");
                  setNotice("");
                }}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                className="text-button back-link"
                disabled={disabled}
                onClick={() => {
                  resetForm();
                  setStage("choose");
                  chooserHeading.current?.focus();
                }}
              >
                ← Kategorilere dön
              </button>
              <h3 ref={formHeading} tabIndex={-1} className="studio-title">
                {editing
                  ? "Kaydı düzenle"
                  : `${categoryLabels[category]} deneyiminiz`}
              </h3>
              <p className="muted">
                Yıldızlı alan zorunlu. Diğer ayrıntıları isterseniz ekleyin.
              </p>
              {editing && (
                <p className="callout">
                  Mevcut kaydı düzenliyorsunuz. Kategori değişmez; yeni bir tür
                  eklemek için önce vazgeçin.
                </p>
              )}
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
                        ? "Eğitim başlığı"
                        : category === "certification"
                          ? "Sertifika adı"
                          : category === "hackathon"
                            ? "Hackathon adı"
                            : category === "portfolio"
                              ? "Portföy başlığı"
                              : "Etkinlik / topluluk adı"
                    }
                    value={editing?.title}
                    required
                  />
                  <Field
                    name="organization"
                    label={
                      category === "certification"
                        ? "Sağlayıcı"
                        : "Kurum / organizatör"
                    }
                    value={editing?.organization}
                  />
                  <details
                    className="form-details"
                    open={editing ? true : undefined}
                  >
                    <summary>
                      Deneyim ayrıntıları{" "}
                      <span className="optional">İsteğe bağlı</span>
                    </summary>
                    <p className="small">
                      Eğitim durumu, katılım, rol ve tarihler. İlgili
                      ihtiyaçlarla karşılaştırmada bu bilgiler kullanılabilir.
                    </p>
                    {category === "portfolio" && (
                      <div>
                        <label htmlFor="profile-output_type">
                          Üretim çıktısı türü
                        </label>
                        <select
                          id="profile-output_type"
                          name="output_type"
                          defaultValue={meta?.output_type || ""}
                        >
                          <option value="">Belirtilmedi</option>
                          {Object.entries(outputLabels).map(([key, label]) => (
                            <option value={key} key={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <p className="small">
                          Bağlantı olarak saklanır; dış sayfa indirilmez ve
                          gözlemlenmiş kanıt sayılmaz.
                        </p>
                      </div>
                    )}
                    {category === "education" && (
                      <>
                        <Field
                          name="program"
                          label="Program / bölüm"
                          value={meta?.program}
                        />
                        <label htmlFor="profile-education_type">
                          Eğitim türü
                        </label>
                        <select
                          id="profile-education_type"
                          name="education_type"
                          defaultValue={meta?.education_type || ""}
                        >
                          <option value="">Belirtilmedi</option>
                          <option value="degree">Diploma programı</option>
                          <option value="course">Kurs</option>
                          <option value="bootcamp">Bootcamp</option>
                          <option value="other">Diğer</option>
                        </select>
                        <label htmlFor="profile-status">Eğitim durumu</label>
                        <select
                          id="profile-status"
                          name="status"
                          defaultValue={meta?.status || ""}
                        >
                          <option value="">Belirtilmedi</option>
                          <option value="ongoing">Devam ediyor</option>
                          <option value="completed">Tamamlandı</option>
                          <option value="left">Ayrıldı</option>
                        </select>
                        <Field
                          name="student_year"
                          label="Sınıf (isteğe bağlı, 1–6)"
                          type="number"
                          value={meta?.student_year}
                        />
                        <p className="field-help">
                          Okul prestiji ve GPA puanlama faktörü değildir.
                        </p>
                      </>
                    )}
                    {category === "certification" && (
                      <>
                        <Field
                          name="issued_at"
                          label="Veriliş tarihi"
                          type="date"
                          value={meta?.issued_at}
                        />
                        <Field
                          name="expires_at"
                          label="Geçerlilik sonu (isteğe bağlı)"
                          type="date"
                          value={meta?.expires_at}
                        />
                        <Field
                          name="credential_id"
                          label="Belge numarası (isteğe bağlı)"
                          value={meta?.credential_id}
                        />
                      </>
                    )}
                    {category === "hackathon" && (
                      <>
                        <Field
                          name="project_name"
                          label="Proje adı"
                          value={meta?.project_name}
                        />
                        <label htmlFor="profile-result">Sonuç</label>
                        <select
                          id="profile-result"
                          name="result"
                          defaultValue={meta?.result || ""}
                        >
                          <option value="">Belirtilmedi</option>
                          <option value="participant">Katıldı</option>
                          <option value="finalist">Finalist</option>
                          <option value="winner">Kazandı</option>
                        </select>
                      </>
                    )}
                    {(category === "event" || category === "community") && (
                      <>
                        {category === "community" && (
                          <>
                            <label htmlFor="profile-focus">
                              Topluluk alanı
                            </label>
                            <select
                              id="profile-focus"
                              name="focus"
                              defaultValue={meta?.focus || ""}
                            >
                              <option value="">Belirtilmedi</option>
                              <option value="technology">Teknoloji</option>
                              <option value="other">Diğer</option>
                            </select>
                          </>
                        )}
                        <label htmlFor="profile-participation_type">
                          Katılım türü
                        </label>
                        <select
                          id="profile-participation_type"
                          name="participation_type"
                          defaultValue={meta?.participation_type || ""}
                        >
                          <option value="">Belirtilmedi</option>
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
                          label="Sorumluluk"
                          max={1000}
                          value={meta?.responsibility}
                        />
                      </>
                    )}
                    <Field
                      name="role"
                      label="Rol (isteğe bağlı)"
                      value={editing?.role}
                    />
                    <div className="profile-dates">
                      <Field
                        name="started_at"
                        label="Başlangıç / tarih"
                        type="date"
                        value={editing?.started_at}
                      />
                      <Field
                        name="ended_at"
                        label="Bitiş (isteğe bağlı)"
                        type="date"
                        value={editing?.ended_at}
                      />
                    </div>
                    <label htmlFor="profile-description">
                      {category === "hackathon"
                        ? "Proje açıklaması"
                        : "Açıklama"}
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
                    label="Kaynak bağlantısı (isteğe bağlı, HTTPS)"
                    type="url"
                    max={2000}
                    value={editing?.source_url}
                  />
                  <Field
                    name="source_label"
                    label="Kaynak etiketi (isteğe bağlı)"
                    value={editing?.source_label}
                  />
                  <p className="field-help">
                    Bağlantı eklemek doğrulama değildir. Linkler otomatik
                    ziyaret edilmez.
                  </p>
                  <div className="profile-actions">
                    <button className="button">
                      <ButtonProgress
                        active={session.busy === "Profil kaydı kaydediliyor…"}
                      />
                      {session.busy === "Profil kaydı kaydediliyor…"
                        ? "Kaydediliyor…"
                        : editing
                          ? "Değişiklikleri kaydet"
                          : "Deneyimi kaydet"}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => {
                          resetForm();
                          setStage("choose");
                          chooserHeading.current?.focus();
                        }}
                      >
                        Vazgeç
                      </button>
                    )}
                  </div>
                </fieldset>
              </form>
            </>
          )}
        </section>
        <section
          className="profile-timeline"
          aria-label="Kaydedilen deneyimler"
        >
          <h3>
            Profil kayıtları <span className="count">{items.length}</span>
          </h3>
          {loading ? (
            <LoadingState label="Profil kayıtları yükleniyor…" skeleton />
          ) : (
            !items.length && (
              <div className="empty">
                <h3>Deneyimlerinize yer açın.</h3>
                <p>
                  Eğitim, hackathon veya topluluk katkınızı ekleyin.
                  Kayıtlarınız yaşayan profilinizde bir araya gelsin.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => {
                    setStage("form");
                    setCategory("hackathon");
                    resetForm();
                    formHeading.current?.focus();
                  }}
                >
                  Hackathon ekle →
                </button>
              </div>
            )
          )}
          {items.map((item) => (
            <div key={item.id} className="profile-entry">
              <ProfileCard item={item} />
              <div className="profile-actions">
                <button
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => {
                    setStage("form");
                    setEditing(item);
                    setCategory(item.category);
                    setConfirmDelete("");
                    setError("");
                    setNotice("");
                    formHeading.current?.focus();
                  }}
                >
                  Düzenle<span className="sr-only">: {item.title}</span>
                </button>
                <button
                  className="button danger"
                  disabled={disabled}
                  onClick={() => setConfirmDelete(item.id)}
                >
                  Sil<span className="sr-only">: {item.title}</span>
                </button>
              </div>
              {confirmDelete === item.id && (
                <div className="callout">
                  <p>
                    “{item.title}” profilinizden silinsin mi? Önceki
                    eşleşmelerdeki kayıt kopyası korunur.
                  </p>
                  <div className="profile-actions">
                    <button
                      className="button danger"
                      disabled={disabled}
                      onClick={() =>
                        void session.act(
                          "Profil kaydı siliniyor…",
                          async () => {
                            await api.deleteProfile(item.id);
                            setItems((current) =>
                              current.filter((p) => p.id !== item.id),
                            );
                            setConfirmDelete("");
                            if (editing?.id === item.id) resetForm();
                            setNotice(
                              "Kayıt silindi. Güncel karşılaştırma için eşleşmeyi yeniden hesaplayın.",
                            );
                          },
                        )
                      }
                    >
                      {session.busy === "Profil kaydı siliniyor…"
                        ? "Siliniyor…"
                        : "Silmeyi onayla"}
                    </button>
                    <button
                      className="button secondary"
                      disabled={disabled}
                      onClick={() => setConfirmDelete("")}
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
