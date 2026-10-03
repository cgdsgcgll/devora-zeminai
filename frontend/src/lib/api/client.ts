import type { components } from "./schema";
export type Model<K extends keyof components["schemas"]> =
  components["schemas"][K];
// Pydantic defaulted IDs are optional in OpenAPI; persisted responses must carry them.
type Persisted<T> = T & { id: string };
export type Evidence = Persisted<Model<"SkillEvidence">>;
export type Candidate = Persisted<Model<"Candidate">>;
export type ProfileEvidence = Model<"ProfileEvidenceItem">;
export type Project = Persisted<Model<"Project">>;
export type Need = Persisted<Model<"OrganizationNeed">>;
export type Match = Persisted<Model<"MatchResult">>;
export type Analysis = Omit<Model<"AnalysisResponse">, "evidence"> & {
  evidence: Evidence[];
};

export class ApiError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}
export function parseApiError(body: unknown, status: number): ApiError {
  if (body && typeof body === "object" && "error" in body) {
    const error = body.error;
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof error.code === "string" &&
      typeof error.message === "string"
    ) {
      return new ApiError(
        error.code,
        error.message,
        "retryable" in error && error.retryable === true,
      );
    }
  }
  return new ApiError(
    "HTTP_ERROR",
    `Servis isteği tamamlayamadı (HTTP ${status}).`,
    status >= 500,
  );
}
export function userError(error: unknown): string {
  if (error instanceof ApiError && error.code === "DATABASE_ERROR")
    return "Veritabanı bağlantısı hazır değil. Yerel demo servislerini kontrol edin.";
  return error instanceof ApiError
    ? error.message
    : "Beklenmeyen bir sorun oluştu. İşlemi tekrar deneyebilirsiniz.";
}
export type Account = Model<"Account">;
let onUnauthorized: (() => void) | undefined;
export function subscribeUnauthorized(listener: () => void) {
  onUnauthorized = listener;
  return () => {
    if (onUnauthorized === listener) onUnauthorized = undefined;
  };
}
async function request<T>(
  path: string,
  body?: unknown,
  method?: "PATCH" | "DELETE",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Backend’e ulaşılamıyor. Servisin çalıştığını ve bağlantınızı kontrol edin.",
      true,
    );
  }
  if (response.ok && response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/register"
    )
      onUnauthorized?.();
    throw parseApiError(data, response.status);
  }
  if (!data)
    throw new ApiError(
      "INVALID_RESPONSE",
      "Servisten okunabilir bir yanıt alınamadı.",
    );
  const hasId = (v: unknown) =>
    !!v && typeof v === "object" && "id" in v && typeof v.id === "string";
  if (path.startsWith("/auth/")) {
    if (typeof data !== "object" || !("user" in data) || !hasId(data.user))
      throw new ApiError("INVALID_RESPONSE", "Hesap bilgisi okunamadı.");
  } else if (Array.isArray(data)) {
    if (!data.every(hasId))
      throw new ApiError("INVALID_RESPONSE", "Kayıtlar okunamadı.");
  } else if (path.endsWith("/analyze")) {
    if (
      typeof data !== "object" ||
      !("evidence" in data) ||
      !Array.isArray(data.evidence) ||
      !data.evidence.every(hasId)
    )
      throw new ApiError(
        "INVALID_RESPONSE",
        "Analiz kanıt kayıtları okunamadı.",
      );
  } else if (path.endsWith("/profile-evidence") && body === undefined) {
    if (!Array.isArray(data) || !data.every(hasId))
      throw new ApiError("INVALID_RESPONSE", "Profil kayıtları okunamadı.");
  } else if (
    /\/(living-profile|discovery|team-coverage|gaps)(\?|$)/.test(path)
  ) {
    const field = path.includes("/living-profile")
      ? "candidate_id"
      : path.endsWith("/gaps")
        ? "match_id"
        : "need_id";
    const collection = path.includes("/living-profile")
      ? "timeline"
      : path.includes("/discovery")
        ? "candidates"
        : path.endsWith("/gaps")
          ? "items"
          : "criteria";
    if (
      typeof data !== "object" ||
      !(field in data) ||
      typeof (data as Record<string, unknown>)[field] !== "string" ||
      !Array.isArray((data as Record<string, unknown>)[collection])
    )
      throw new ApiError("INVALID_RESPONSE", "Görünüm verileri okunamadı.");
  } else if (!hasId(data))
    throw new ApiError("INVALID_RESPONSE", "Servis kaydının kimliği eksik.");
  return data as T;
}
export const api = {
  updateNeed: (id: string, data: Model<"NeedDetailsPatch">) =>
    request<Need>(`/needs/${id}`, data, "PATCH"),
  me: () => request<Model<"AuthState">>("/auth/me"),
  login: (data: Model<"Login">) =>
    request<Model<"AuthState">>("/auth/login", data),
  register: (data: Model<"Register">) =>
    request<Model<"AuthState">>("/auth/register", data),
  logout: () => request<void>("/auth/logout", {}),
  projects: (id: string) => request<Project[]>(`/candidates/${id}/projects`),
  projectEvidence: (id: string) =>
    request<Evidence[]>(`/projects/${id}/evidence`),
  needs: () => request<Need[]>("/needs"),
  matchEvidence: (match: string, id: string) =>
    request<Evidence>(`/matches/${match}/evidence/${id}`),
  livingProfile: (id: string, since = "") =>
    request<Model<"LivingProfile">>(
      `/candidates/${id}/living-profile${since ? `?since=${encodeURIComponent(since)}` : ""}`,
    ),
  discovery: (id: string, anonymous = true, offset = 0) =>
    request<Model<"Discovery">>(
      `/needs/${id}/discovery?anonymous=${anonymous}&offset=${offset}&limit=20`,
    ),
  team: (id: string, candidate_ids: string[], anonymous = true) =>
    request<Model<"TeamCoverage">>(`/needs/${id}/team-coverage`, {
      candidate_ids,
      anonymous,
    }),
  gaps: (id: string) => request<Model<"GapSummary">>(`/matches/${id}/gaps`),
  profiles: (id: string) =>
    request<ProfileEvidence[]>(`/candidates/${id}/profile-evidence`),
  createProfile: (id: string, data: Model<"ProfileEvidenceCreate">) =>
    request<ProfileEvidence>(`/candidates/${id}/profile-evidence`, data),
  updateProfile: (id: string, data: Model<"ProfileEvidencePatch">) =>
    request<ProfileEvidence>(`/profile-evidence/${id}`, data, "PATCH"),
  deleteProfile: (id: string) =>
    request<void>(`/profile-evidence/${id}`, undefined, "DELETE"),
  createCandidate: (data: Model<"CandidateCreate">) =>
    request<Candidate>("/candidates", data),
  candidate: (id: string) => request<Candidate>(`/candidates/${id}`),
  createProject: (id: string, data: Model<"ProjectCreate">) =>
    request<Project>(`/candidates/${id}/projects`, data),
  project: (id: string) => request<Project>(`/projects/${id}`),
  analyze: (id: string) => request<Analysis>(`/projects/${id}/analyze`, {}),
  run: (id: string) => request<Model<"AnalysisRun">>(`/analysis-runs/${id}`),
  evidence: (id: string) => request<Evidence>(`/evidence/${id}`),
  createNeed: (data: Model<"NeedCreate">) => request<Need>("/needs", data),
  need: (id: string) => request<Need>(`/needs/${id}`),
  createMatch: (data: Model<"MatchCreate">) => request<Match>("/matches", data),
  match: (id: string) => request<Match>(`/matches/${id}`),
};
