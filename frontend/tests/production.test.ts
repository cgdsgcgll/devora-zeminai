import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentConfig } from "../deployment-config.mjs";
import {
  api,
  userError,
  subscribeUnauthorized,
} from "../src/lib/api/client.ts";

test("production frontend config rejects implicit demo builds and unsafe destinations", () => {
  assert.throws(() => deploymentConfig({}, true));
  assert.equal(
    deploymentConfig({ ZEMINAI_ENV: "development" }, true).production,
    false,
  );
  const env = {
    ZEMINAI_ENV: "production",
    API_BACKEND_URL: "https://api.example.com",
    FRONTEND_ORIGIN: "https://app.example.com",
  };
  assert.equal(deploymentConfig(env, true).backend, "https://api.example.com");
  for (const change of [
    { API_BACKEND_URL: "http://127.0.0.1:8000" },
    { API_BACKEND_URL: "" },
    { API_BACKEND_URL: "https://secret:password@api.example.com" },
    { API_BACKEND_URL: "https://api.example.com/path" },
    { FRONTEND_ORIGIN: "" },
    { NEXT_PUBLIC_GEMINI_API_KEY: "test-only" },
    { NEXT_PUBLIC_API_BASE_URL: "https://api.example.com" },
  ])
    assert.throws(() => deploymentConfig({ ...env, ...change }, true));
});

test("429 has actionable quota messaging and never clears the authenticated session", async () => {
  const original = globalThis.fetch;
  let cleared = 0;
  const unsubscribe = subscribeUnauthorized(() => cleared++);
  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: "ANALYSIS_RATE_LIMITED",
          message: "budget",
          retryable: true,
          details: { retry_after_seconds: 30 },
        },
      },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  try {
    await assert.rejects(
      api.createNeed({ description: "Python gerekli" }),
      (error) => {
        assert.equal(
          userError(error),
          "Analiz sınırına ulaştınız. Bir süre sonra tekrar deneyebilirsiniz.",
        );
        return true;
      },
    );
    assert.equal(cleared, 0);
  } finally {
    globalThis.fetch = original;
    unsubscribe();
  }
});
