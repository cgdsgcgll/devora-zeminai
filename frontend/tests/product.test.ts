import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as i18n from "../src/i18n/index.ts";
import { tr } from "../src/i18n/tr.ts";
import { en } from "../src/i18n/en.ts";
import {
  api,
  userError,
  subscribeUnauthorized,
} from "../src/lib/api/client.ts";
import { profileHighlights } from "../src/lib/visual-summary.ts";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../src/", import.meta.url));
function load(
  relative: string,
): Record<string, React.ComponentType<Record<string, unknown>>> {
  const file = path.resolve(root, relative);
  const source = readFileSync(file, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  const dependencies = (id: string): unknown => {
    if (id.includes("i18n/index")) return i18n;
    if (id === "next/link")
      return {
        __esModule: true,
        default: ({
          children,
          ...props
        }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
          React.createElement("a", props, children),
      };
    if (id.startsWith("@/") || id.startsWith(".")) {
      const base = id.startsWith("@/")
        ? path.join(root, id.slice(2))
        : path.resolve(path.dirname(file), id);
      const resolved = [base, base + ".ts", base + ".tsx"].find(existsSync)!;
      return resolved.endsWith(".tsx")
        ? load(path.relative(root, resolved))
        : require(resolved);
    }
    return require(id);
  };
  new Function("require", "module", "exports", code)(
    dependencies,
    mod,
    mod.exports,
  );
  return mod.exports;
}

test("typed dictionaries cover the same nonempty messages, default and persisted locale", () => {
  assert.equal(i18n.getLocale(), "tr");
  assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort());
  assert.ok(Object.values(en).every((v) => v.trim()));
  assert.equal(i18n.restoreLocale({ getItem: () => null }), "tr");
  assert.equal(i18n.restoreLocale({ getItem: () => "en" }), "en");
  assert.equal(i18n.restoreLocale({ getItem: () => "unknown" }), "tr");
  assert.equal(
    i18n.restoreLocale({
      getItem: () => {
        throw Error("disabled");
      },
    }),
    "tr",
  );
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const values = new Map();
  const document = { documentElement: { lang: "tr" } };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: { setItem: (k: string, v: string) => values.set(k, v) },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  try {
    i18n.setLocale("en");
    assert.equal(document.documentElement.lang, "en");
    assert.equal(values.get("zeminai.locale"), "en");
  } finally {
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    i18n.setLocale("tr");
  }
});

test("locale changes labels but never backend profile counts", () => {
  const summary = [
    { label: "Proje", count: 2 },
    { label: "Gözlemlenen teknik kanıt", count: 4 },
    { label: "Eğitim", count: 1 },
  ];
  try {
    const before = profileHighlights(summary).map((x) => x.count);
    i18n.setLocale("en");
    assert.deepEqual(
      profileHighlights(summary).map((x) => x.count),
      before,
    );
    assert.equal(profileHighlights(summary)[0].label, "Project");
  } finally {
    i18n.setLocale("tr");
  }
});

test("error codes translate safely and non-401 errors do not invalidate session", async () => {
  let invalidated = 0;
  const unsubscribe = subscribeUnauthorized(() => invalidated++);
  const original = globalThis.fetch;
  try {
    for (const locale of ["tr", "en"] as const) {
      i18n.setLocale(locale);
      for (const status of [403, 404, 409, 422, 429, 503]) {
        globalThis.fetch = async () =>
          Response.json(
            {
              error: {
                code: "UNKNOWN_CODE",
                message: "raw private server detail",
              },
            },
            { status },
          );
        await assert.rejects(api.proofRequests(), (e) => {
          assert.ok(userError(e));
          assert.ok(!userError(e).includes("raw private"));
          return true;
        });
      }
    }
    assert.equal(invalidated, 0);
  } finally {
    globalThis.fetch = original;
    unsubscribe();
    i18n.setLocale("tr");
  }
});

test("actual trace is localized while source text stays original and hostile text escaped", () => {
  const { MatchResult } = load("components/match-result.tsx");
  const result = {
    id: "match",
    score: 0,
    required_coverage: 0,
    preferred_coverage: 0,
    matched_criteria: [],
    unmatched_criteria: [
      {
        criterion_id: "criterion",
        skill_label: "OSPF",
        priority: "required",
        matched: false,
        trace_available: true,
        trace_items: [
          {
            family: "readme",
            status: "declared_only",
            strength: "weak",
            summary: "Özgün Türkçe kaynak",
            excerpt: "<script>source</script>",
            source_url: "https://github.com/test/repo",
            source_label: "README.md",
          },
        ],
      },
    ],
  };
  try {
    for (const locale of ["tr", "en"] as const) {
      i18n.setLocale(locale);
      const html = renderToStaticMarkup(
        React.createElement(MatchResult, { result }),
      );
      assert.ok(html.includes(locale === "tr" ? "Beyan" : "Declared"));
      assert.ok(html.includes("Özgün Türkçe kaynak"));
      assert.ok(html.includes("&lt;script&gt;"));
      assert.ok(!html.includes("<script>"));
      assert.ok(
        html.includes(locale === "tr" ? "Kanıt iste" : "Request evidence"),
      );
    }
  } finally {
    i18n.setLocale("tr");
  }
});

test("client sends explicit blind flag, team sizes and proof lifecycle payloads", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ id: "result", need_id: "need", criteria: [] });
  };
  try {
    await api.match("m");
    await api.match("m", false);
    assert.equal(calls[0].url, "/api/matches/m?anonymous=true");
    assert.equal(calls[1].url, "/api/matches/m?anonymous=false");
    for (const ids of [
      ["a", "b"],
      ["a", "b", "c"],
      ["a", "b", "c", "d"],
      ["a", "c"],
    ]) {
      await api.team("need", ids, true);
      assert.deepEqual(
        JSON.parse(calls.at(-1)!.options!.body as string).candidate_ids,
        ids,
      );
    }
    await api.createProof({
      match_id: "m",
      criterion_id: "c",
      title: "OSPF",
      instructions: "Show work",
    });
    await api.submitProof("p", {
      source_url: "https://example.org/work",
      note: "",
    });
    await api.reviewProof("p", "closed");
    assert.equal(calls.at(-1)?.options?.method, "PATCH");
  } finally {
    globalThis.fetch = original;
  }
});
