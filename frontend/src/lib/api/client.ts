"use client";
import { t } from "../../i18n/index.ts";
import { validComplements } from "./team-complements.ts";
import { validGitHub } from "./github.ts";
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
  status?: number;
  code: string;
  retryable: boolean;
  constructor(
    code: string,
    message: string,
    retryable = false,
    status?: number,
  ) {
    super(message);
    this.status = status;
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
        status,
      );
    }
  }
  return new ApiError(
    "HTTP_ERROR",
    `Servis isteği tamamlayamadı (HTTP ${status}).`,
    status >= 500,
    status,
  );
}
export function userError(error: unknown): string {
  if (!(error instanceof ApiError)) return t("m416");
  const codes: Record<string, string> = {
    PROFILE_IMPORT_FORMAT: t("professionalFormat"),
    IMPORT_LIMIT_EXCEEDED: t("professionalFormat"),
    PRIVATE_ANALYSIS_UNSUPPORTED: t("privateAnalysisUnsupported"),
    ANALYSIS_IN_PROGRESS: t("projectAnalyzing"),
    GITHUB_APP_NOT_CONFIGURED: t("githubNotConfigured"),
    GITHUB_CONNECTION_REQUIRED: t("githubDisconnected"),
    GITHUB_CONNECTION_REVOKED: t("githubRevoked"),
    GITHUB_IDENTITY_ALREADY_LINKED: t("githubConflict"),
    GITHUB_REPOSITORY_MISMATCH: t("githubMismatch"),
    GITHUB_REPOSITORY_NOT_ACCESSIBLE: t("githubUnavailable"),
    GITHUB_POOL_LIMIT_EXCEEDED: t("githubLimit"),
    GITHUB_PROVIDER_ERROR: t("errorProvider"),
    UNAUTHENTICATED: t("errorUnauthorized"),
    UNAUTHORIZED: t("errorUnauthorized"),
    FORBIDDEN: t("errorForbidden"),
    CSRF_ORIGIN_REJECTED: t("errorForbidden"),
    NOT_FOUND: t("errorNotFound"),
    PROOF_CONFLICT: t("errorConflict"),
    EMAIL_ALREADY_EXISTS: t("errorConflict"),
    INVALID_CREDENTIALS: t("errorCredentials"),
    VALIDATION_ERROR: t("errorValidation"),
    DISCOVERY_POOL_LIMIT_EXCEEDED: t("errorValidation"),
    ANALYSIS_RATE_LIMITED: t("m413"),
    OPERATION_RATE_LIMITED: t("m414"),
    AUTH_RATE_LIMITED: t("m414"),
    RATE_LIMITED: t("m414"),
    DATABASE_ERROR: t("m415"),
    RATE_LIMIT_UNAVAILABLE: t("m415"),
    NETWORK_ERROR: t("m417"),
    INSUFFICIENT_PROJECT_DATA: t("m042"),
    INVALID_RESPONSE: t("m418"),
  };
  if (codes[error.code]) return codes[error.code];
  const status: Record<number, string> = {
    401: t("errorUnauthorized"),
    403: t("errorForbidden"),
    404: t("errorNotFound"),
    409: t("errorConflict"),
    422: t("errorValidation"),
    429: t("m414"),
    500: t("m416"),
    502: t("errorProvider"),
    503: t("m415"),
    504: t("errorProvider"),
  };
  return status[error.status || 0] || t("m416");
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
    throw new ApiError("NETWORK_ERROR", t("m417"), true);
  }
  if (response.ok && response.status === 204) {
    if (
      (path.startsWith("/github/") || path.endsWith("/github-relationship")) &&
      method !== "DELETE"
    )
      throw new ApiError("INVALID_RESPONSE", t("m423"));
    if (path.endsWith("/team-complements"))
      throw new ApiError("INVALID_RESPONSE", t("m423"));
    return undefined as T;
  }
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
  if (!data) throw new ApiError("INVALID_RESPONSE", t("m418"));
  const hasId = (v: unknown) =>
    !!v && typeof v === "object" && "id" in v && typeof v.id === "string";
  if (path.startsWith("/github/") || path.endsWith("/github-relationship")) {
    if (!validGitHub(path, data))
      throw new ApiError("INVALID_RESPONSE", t("m423"));
  } else if (path.endsWith("/analysis-jobs")) {
    if (
      typeof data !== "object" ||
      !("state" in data) ||
      !["not_started", "queued", "analyzing", "succeeded", "failed"].includes(
        String(data.state),
      )
    )
      throw new ApiError("INVALID_RESPONSE", t("m423"));
  } else if (path.endsWith("/activity")) {
    if (
      typeof data !== "object" ||
      !("project" in data) ||
      !hasId(data.project) ||
      !("evidence" in data) ||
      !Array.isArray(data.evidence) ||
      !("analysis" in data) ||
      !data.analysis ||
      typeof data.analysis !== "object" ||
      !("state" in data.analysis) ||
      !["not_started", "queued", "analyzing", "succeeded", "failed"].includes(
        String(data.analysis.state),
      )
    )
      throw new ApiError("INVALID_RESPONSE", t("m423"));
  } else if (path.endsWith("/professional-preview")) {
    if (
      typeof data !== "object" ||
      !("records" in data) ||
      !Array.isArray(data.records)
    )
      throw new ApiError("INVALID_RESPONSE", t("m423"));
  } else if (path.endsWith("/team-complements")) {
    if (
      !validComplements(
        data,
        path.split("/")[2],
        (body as { anonymous: boolean }).anonymous,
      )
    )
      throw new ApiError("INVALID_RESPONSE", t("m423"));
  } else if (path.startsWith("/auth/")) {
    if (typeof data !== "object" || !("user" in data) || !hasId(data.user))
      throw new ApiError("INVALID_RESPONSE", t("m419"));
  } else if (Array.isArray(data)) {
    if (!data.every(hasId)) throw new ApiError("INVALID_RESPONSE", t("m420"));
  } else if (path.endsWith("/analyze")) {
    if (
      typeof data !== "object" ||
      !("evidence" in data) ||
      !Array.isArray(data.evidence) ||
      !data.evidence.every(hasId)
    )
      throw new ApiError("INVALID_RESPONSE", t("m421"));
  } else if (path.endsWith("/profile-evidence") && body === undefined) {
    if (!Array.isArray(data) || !data.every(hasId))
      throw new ApiError("INVALID_RESPONSE", t("m422"));
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
      throw new ApiError("INVALID_RESPONSE", t("m423"));
  } else if (!hasId(data)) throw new ApiError("INVALID_RESPONSE", t("m424"));
  return data as T;
}
export const api = {
  githubImportBatch: (data: Model<"GitHubBatchInput">) =>
    request<Model<"GitHubBatchResult">>("/github/import-batch", data),
  queueAnalysis: (id: string) =>
    request<Model<"AnalysisState">>(`/projects/${id}/analysis-jobs`, {}),
  githubImport: (data: Model<"GitHubLinkInput">) =>
    request<Model<"GitHubImportResult">>("/github/import", data),
  projectActivity: (id: string) =>
    request<
      Omit<Model<"ProjectActivity">, "project" | "evidence"> & {
        project: Project;
        evidence: Evidence[];
      }
    >(`/projects/${id}/activity`),
  updateProject: (id: string, data: Model<"ProjectPatch">) =>
    request<Project>(`/projects/${id}`, data, "PATCH"),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, undefined, "DELETE"),
  professionalPreview: (id: string, data: Model<"ProfessionalInput">) =>
    request<Model<"ProfessionalPreview">>(
      `/candidates/${id}/professional-preview`,
      data,
    ),
  professionalImport: (id: string, data: Model<"ProfessionalConfirm">) =>
    request<ProfileEvidence[]>(`/candidates/${id}/professional-import`, data),
  githubConnection: () =>
    request<Model<"GitHubConnectionStatus">>("/github/connection"),
  githubConnect: () =>
    request<Model<"GitHubConnectURL">>("/github/connect", {}),
  githubDisconnect: () =>
    request<void>("/github/connection", undefined, "DELETE"),
  githubInstallationURL: () =>
    request<Model<"GitHubInstallationURL">>("/github/installation-url"),
  githubInstallations: () =>
    request<Model<"GitHubInstallation">[]>("/github/installations"),
  githubRepositories: (id: string) =>
    request<Model<"GitHubRepository">[]>(
      `/github/installations/${id}/repositories`,
    ),
  githubRelationship: (id: string) =>
    request<Model<"GitHubRelationshipStatus">>(
      `/projects/${id}/github-relationship`,
    ),
  githubLink: (id: string, data: Model<"GitHubLinkInput">) =>
    request<Model<"GitHubRelationshipStatus">>(
      `/projects/${id}/github-relationship`,
      data,
    ),
  githubUnlink: (id: string) =>
    request<void>(`/projects/${id}/github-relationship`, undefined, "DELETE"),
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
  teamComplements: (id: string, candidate_ids: string[], anonymous = true) =>
    request<Model<"TeamComplements">>(`/needs/${id}/team-complements`, {
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
  createMatch: (data: Model<"MatchCreate">, anonymous = true) =>
    request<Match>(`/matches?anonymous=${anonymous}`, data),
  match: (id: string, anonymous = true) =>
    request<Match>(`/matches/${id}?anonymous=${anonymous}`),
  proofRequests: (offset = 0) =>
    request<Model<"ProofItem">[]>(`/proof-requests?offset=${offset}&limit=20`),
  createProof: (data: Model<"ProofCreate">) =>
    request<Model<"ProofItem">>("/proof-requests", data),
  submitProof: (id: string, data: Model<"ProofSubmit">) =>
    request<Model<"ProofItem">>(`/proof-requests/${id}/submit`, data),
  reviewProof: (id: string, status: Model<"ProofReview">["status"]) =>
    request<Model<"ProofItem">>(`/proof-requests/${id}`, { status }, "PATCH"),
};
