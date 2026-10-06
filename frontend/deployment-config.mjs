/** Deployment inputs are server-only. Never put credentials in browser variables. */
export function deploymentConfig(env, productionBuild = false) {
  const environment = env.ZEMINAI_ENV || (productionBuild ? "" : "development");
  if (!["development", "test", "production"].includes(environment)) {
    throw new Error(
      "Set ZEMINAI_ENV explicitly before building (development demo or production).",
    );
  }
  const production = environment === "production";
  const backend =
    env.API_BACKEND_URL || (production ? "" : "http://127.0.0.1:8000");
  let target;
  try {
    target = new URL(backend);
  } catch {
    throw new Error("API_BACKEND_URL is required and must be an absolute URL.");
  }
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/"
  ) {
    throw new Error(
      "API_BACKEND_URL must be an HTTP(S) origin without credentials or a path.",
    );
  }
  if (production) {
    let origin;
    try {
      origin = new URL(env.FRONTEND_ORIGIN);
    } catch {
      throw new Error("FRONTEND_ORIGIN is required.");
    }
    if (
      target.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
      origin.protocol !== "https:" ||
      !origin.hostname.includes(".") ||
      ["127.0.0.1", "localhost"].includes(origin.hostname) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.origin === target.origin
    ) {
      throw new Error(
        "Production requires separate explicit HTTPS frontend/backend origins.",
      );
    }
    if (
      env.NEXT_PUBLIC_API_BASE_URL ||
      Object.keys(env).some(
        (key) =>
          key.startsWith("NEXT_PUBLIC_") &&
          /KEY|TOKEN|SECRET|PASSWORD|DATABASE/i.test(key) &&
          env[key],
      )
    ) {
      throw new Error(
        "Use the same-origin proxy; public API overrides and public secret variables are forbidden.",
      );
    }
  }
  return { backend: target.origin, production };
}
