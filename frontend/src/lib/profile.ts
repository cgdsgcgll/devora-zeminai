import { localized } from "../i18n/index.ts";
export const categoryLabels = localized({
  portfolio: "m281",
  education: "m271",
  certification: "m273",
  hackathon: "m275",
  event: "m277",
  community: "m279",
} as const);
export const familyLabels = localized({
  technical_skill: "m467",
  project_experience: "m468",
  ...categoryLabels,
} as const);
export const verificationLabels = localized({
  declared_only: "m434",
  linked: "m469",
  verified: "m470",
} as const);
export const participationLabels = localized({
  participant: "m471",
  organizer: "m472",
  speaker: "m473",
  mentor: "m474",
  volunteer: "m475",
  member: "m476",
  leader: "m477",
} as const);
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

export const outputLabels = localized({
  web_app: "m478",
  demo: "m479",
  package: "m480",
  article: "m481",
  service: "m482",
} as const);
export const provenanceLabels: Record<string, string> = localized({
  ...verificationLabels,
  observed: "m433",
  not_found: "m133",
});
export const sourceLabels: Record<string, string> = localized({
  ...familyLabels,
  project: "m216",
  source_file: "m439",
  dependency_file: "m440",
  repository_language: "Repo dili",
  readme: "m438",
  project_description: "m381",
  user_claim: "m442",
});
