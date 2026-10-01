import type { ProfileEvidence } from "../lib/api/client";
import {
  categoryLabels,
  outputLabels,
  participationLabels,
  safeProfileSource,
  verificationLabels,
} from "../lib/profile";

export function ProfileCard({ item }: { item: ProfileEvidence }) {
  const source = safeProfileSource(item.source_url);
  const meta = item.metadata_json;
  return (
    <article className="evidence-card profile-card">
      <p className="eyebrow">{categoryLabels[item.category]}</p>
      <div className="card-heading">
        <h3>{item.title}</h3>
        <span
          className={`badge ${item.verification_status === "verified" ? "observed" : "declared_only"}`}
        >
          {verificationLabels[item.verification_status]}
        </span>
      </div>
      {item.organization && (
        <p className="profile-organization">{item.organization}</p>
      )}
      {item.role && <p className="meta">Rol: {item.role}</p>}
      {(item.started_at || item.ended_at) && (
        <p className="meta">
          {item.started_at || "Başlangıç belirtilmedi"} →{" "}
          {item.ended_at ||
            (meta?.status === "ongoing"
              ? "Devam ediyor"
              : "Bitiş belirtilmedi")}
        </p>
      )}
      {meta?.output_type && <p>{outputLabels[meta.output_type]}</p>}
      {meta?.program && <p>{meta.program}</p>}
      {meta?.focus && (
        <p className="meta">
          Alan: {meta.focus === "technology" ? "Teknoloji" : "Diğer"}
        </p>
      )}
      {meta?.education_type && (
        <p className="meta">
          {
            {
              degree: "Diploma programı",
              course: "Kurs",
              bootcamp: "Bootcamp",
              other: "Diğer",
            }[meta.education_type]
          }
        </p>
      )}
      {meta?.status && (
        <p className="meta">
          {
            {
              ongoing: "Devam ediyor",
              completed: "Tamamlandı",
              left: "Ayrıldı",
            }[meta.status]
          }
          {meta.student_year ? ` · ${meta.student_year}. sınıf` : ""}
        </p>
      )}
      {meta?.credential_id && (
        <p className="meta break">Credential ID: {meta.credential_id}</p>
      )}
      {meta?.issued_at && (
        <p className="meta">
          Veriliş: {meta.issued_at}
          {meta.expires_at ? ` · Geçerlilik sonu: ${meta.expires_at}` : ""}
        </p>
      )}
      {meta?.project_name && <p>Proje: {meta.project_name}</p>}
      {meta?.result && (
        <p className="meta">
          {
            { participant: "Katıldı", finalist: "Finalist", winner: "Kazandı" }[
              meta.result
            ]
          }
        </p>
      )}
      {meta?.participation_type && (
        <p className="meta">
          Katılım: {participationLabels[meta.participation_type]}
        </p>
      )}
      {meta?.responsibility && <p>{meta.responsibility}</p>}
      {item.description && (
        <p className="profile-description">{item.description}</p>
      )}
      <div className="source">
        {source ? (
          <a href={source} target="_blank" rel="noopener noreferrer">
            {item.source_label || "Kaynak bağlantısı"} ↗
            <span className="sr-only"> (yeni sekmede)</span>
          </a>
        ) : (
          <span>Kaynak bağlantısı yok</span>
        )}
      </div>
      <p className="small">
        {item.verification_status === "linked"
          ? "Bağlantı kullanıcı tarafından eklendi; içeriği bağımsız doğrulanmadı."
          : item.verification_status === "declared_only"
            ? "Kullanıcı beyanı. Bağımsız doğrulama bulunmuyor."
            : "Provider tarafından doğrulanmış kayıt."}
      </p>
    </article>
  );
}
