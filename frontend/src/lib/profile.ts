export const categoryLabels = {
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
  declared_only: "Beyan",
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
