const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown) =>
  typeof v === "string" && /^[1-9][0-9]{0,19}$/.test(v);
const uuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const date = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const login = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(v);
const ownerType = (v: unknown) => v === "User" || v === "Organization";
const revoked = (v: unknown) => v === null || date(v);
const permissions = (v: unknown) =>
  object(v) &&
  Object.entries(v).every(
    ([key, value]) =>
      ["admin", "maintain", "push", "triage", "pull"].includes(key) &&
      typeof value === "boolean",
  );
const repo = (v: unknown): v is Record<string, unknown> =>
  object(v) &&
  typeof v.full_name === "string" &&
  /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]{1,100}$/.test(v.full_name) &&
  id(v.owner_id) &&
  login(v.owner_login) &&
  ownerType(v.owner_type) &&
  permissions(v.permissions);

export function validGitHub(path: string, data: unknown): boolean {
  if (path === "/github/import-batch") {
    return (
      object(data) &&
      Array.isArray(data.items) &&
      data.items.length <= 20 &&
      data.items.every(
        (v) =>
          object(v) &&
          id(v.repository_id) &&
          (v.status === "failed"
            ? typeof v.error_code === "string"
            : ["imported", "existing"].includes(String(v.status)) &&
              validGitHub("/github/import", v.result)),
      )
    );
  }
  if (path === "/github/import") {
    return (
      object(data) &&
      typeof data.created === "boolean" &&
      object(data.project) &&
      uuid(data.project.id) &&
      object(data.analysis) &&
      ["not_started", "queued", "analyzing", "succeeded", "failed"].includes(
        String(data.analysis.state),
      )
    );
  }
  if (path === "/github/installation-url") {
    return (
      object(data) &&
      typeof data.installation_url === "string" &&
      /^https:\/\/github\.com\/apps\/[a-z0-9]+(?:-[a-z0-9]+)*\/installations\/new$/.test(
        data.installation_url,
      )
    );
  }
  if (path === "/github/connect") {
    if (!object(data) || typeof data.authorization_url !== "string")
      return false;
    try {
      const url = new URL(data.authorization_url);
      return (
        url.origin === "https://github.com" &&
        url.pathname === "/login/oauth/authorize" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        url.searchParams.get("code_challenge_method") === "S256" &&
        /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("state") || "") &&
        /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("code_challenge") || "")
      );
    } catch {
      return false;
    }
  }
  if (path === "/github/connection") {
    if (!object(data)) return false;
    const v = data.connection;
    return (
      v === null ||
      (object(v) &&
        uuid(v.id) &&
        id(v.github_user_id) &&
        login(v.github_login) &&
        date(v.created_at) &&
        revoked(v.revoked_at))
    );
  }
  if (path === "/github/installations")
    return (
      Array.isArray(data) &&
      data.length <= 100 &&
      data.every(
        (v) =>
          object(v) &&
          id(v.id) &&
          id(v.account_id) &&
          login(v.account_login) &&
          ownerType(v.account_type),
      )
    );
  if (path.endsWith("/repositories"))
    return (
      Array.isArray(data) &&
      data.length <= 500 &&
      data.every(
        (v) =>
          repo(v) &&
          id(v.id) &&
          v.html_url === "https://github.com/" + v.full_name,
      )
    );
  if (path.endsWith("/github-relationship")) {
    if (!object(data)) return false;
    const v = data.link;
    return (
      v === null ||
      (repo(v) &&
        uuid(v.id) &&
        uuid(v.project_id) &&
        v.project_id === path.split("/")[2] &&
        id(v.github_repository_id) &&
        id(v.installation_id) &&
        ["personal_owner", "account_access"].includes(String(v.relationship)) &&
        date(v.updated_at) &&
        revoked(v.revoked_at))
    );
  }
  return false;
}
