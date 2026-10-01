import type { components } from "./schema";
export type Model<K extends keyof components["schemas"]> =
  components["schemas"][K];
// Pydantic defaulted IDs are optional in OpenAPI; persisted responses must carry them.
type Persisted<T> = T & { id: string };
export type Evidence = Persisted<Model<"SkillEvidence">>;
export type Candidate = Persisted<Model<"Candidate">>;
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
async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `${(process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      },
    );
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Backend’e ulaşılamıyor. Servisin çalıştığını ve bağlantınızı kontrol edin.",
      true,
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw parseApiError(data, response.status);
  if (!data)
    throw new ApiError(
      "INVALID_RESPONSE",
      "Servisten okunabilir bir yanıt alınamadı.",
    );
  const hasId = (v: unknown) =>
    !!v && typeof v === "object" && "id" in v && typeof v.id === "string";
  if (path.endsWith("/analyze")) {
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
  } else if (!hasId(data))
    throw new ApiError("INVALID_RESPONSE", "Servis kaydının kimliği eksik.");
  return data as T;
}
export const api = {
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
