export const categoryLabels = {
  portfolio: "Portföy",
  education: "Eğitim",
  certification: "Sertifika",
  hackathon: "Hackathon",
  event: "Etkinlik",
  community: "Topluluk",
} as const;
export const familyLabels = {
  technical_skill: "GitHub / teknik kanıt",
  project_experience: "GitHub / proje kanıtı",
  ...categoryLabels,
} as const;
export const verificationLabels = {
  declared_only: "Yalnızca beyan",
  linked: "Kaynak bağlantısı mevcut",
  verified: "Doğrulanmış",
} as const;
export const participationLabels = {
  participant: "Katılımcı",
  organizer: "Organizatör",
  speaker: "Konuşmacı",
  mentor: "Mentor",
  volunteer: "Gönüllü",
  member: "Üye",
  leader: "Topluluk sorumlusu",
} as const;
export function safeProfileSource(value?: string | null): string | undefined {
  if (!value || /[\s\\]/.test(value)) return;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !url.hostname.includes(".") ||
      /(?:\.localhost|\.local|\.internal)$/.test(url.hostname) ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":")
    )
      return;
    return value;
  } catch {
    return;
  }
}

export const outputLabels = {
  web_app: "Canlı web uygulaması",
  demo: "Ürün demosu",
  package: "Paket",
  article: "Teknik makale",
  service: "Yayınlanmış servis",
} as const;
export const provenanceLabels: Record<string, string> = {
  ...verificationLabels,
  observed: "Gözlemlenen kullanım",
  not_found: "Kanıt bulunamadı",
};
export const sourceLabels: Record<string, string> = {
  ...familyLabels,
  project: "Proje",
  source_file: "Kaynak dosya",
  dependency_file: "Bağımlılık dosyası",
  repository_language: "Repo dili",
  readme: "README",
  project_description: "Proje açıklaması",
  user_claim: "Kullanıcı beyanı",
};
