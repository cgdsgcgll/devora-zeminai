import { resolveI18n } from "./i18n-loader.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { api } from "../src/lib/api/client.ts";
import { safeProfileSource, verificationLabels } from "../src/lib/profile.ts";

test("profile links are HTTPS only and never imply verification", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///test",
    "vbscript:x",
    "https://u:p@example.org",
    "https://localhost",
    "https://127.0.0.1",
    "https://example.org:8080",
    "https://example.org\\@evil.org",
  ])
    assert.equal(safeProfileSource(url), undefined);
  assert.equal(
    safeProfileSource("https://example.org/evidence"),
    "https://example.org/evidence",
  );
  assert.equal(verificationLabels.linked, "Kaynak bağlantısı mevcut");
});

test("profile card renders hostile text as text, with honest source status", async () => {
  // Compile the actual component with the existing TypeScript dependency; no test-only view copy.
  const source = await readFile(
    new URL("../src/components/profile-card.tsx", import.meta.url),
    "utf8",
  );
  const require = createRequire(import.meta.url);
  const code = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll(
      '"react/jsx-runtime"',
      JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href),
    )
    .replaceAll(
      '"../lib/profile"',
      JSON.stringify(new URL("../src/lib/profile.ts", import.meta.url).href),
    );
  const { ProfileCard } = await import(
    `data:text/javascript;base64,${Buffer.from(await resolveI18n(code)).toString("base64")}`
  );
  const item = {
    category: "hackathon",
    title: '<img src=x onerror="alert(1)">',
    description: "<script>alert(1)</script>",
    verification_status: "linked",
    source_url: "https://example.org/evidence",
    metadata_json: { result: "participant" },
  };
  const html = renderToStaticMarkup(createElement(ProfileCard, { item }));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("Kaynak bağlantısı mevcut"));
  assert.ok(html.includes("bağımsız doğrulanmadı"));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes("Katıldı"));
  const unsafe = renderToStaticMarkup(
    createElement(ProfileCard, {
      item: { ...item, source_url: "javascript:alert(1)" },
    }),
  );
  assert.ok(!unsafe.includes("href="));
});

test("profile API handles lists, PATCH and 204 DELETE", async () => {
  const original = globalThis.fetch;
  const calls: (string | undefined)[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init?.method);
    return init?.method === "DELETE"
      ? new Response(null, { status: 204 })
      : Response.json(init?.method === "GET" ? [] : { id: "saved" });
  };
  try {
    assert.deepEqual(await api.profiles("candidate"), []);
    assert.equal(
      (await api.updateProfile("saved", { title: "Changed" })).id,
      "saved",
    );
    assert.equal(await api.deleteProfile("saved"), undefined);
    assert.deepEqual(calls, ["GET", "PATCH", "DELETE"]);
  } finally {
    globalThis.fetch = original;
  }
});
