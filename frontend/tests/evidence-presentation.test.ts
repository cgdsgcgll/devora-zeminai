import { resolveI18n } from "./i18n-loader.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  evidenceExplanation,
  criterionExplanation,
  statusLabels,
  technicalScoreExplanation,
} from "../src/lib/presentation.ts";
import { verificationLabels, provenanceLabels } from "../src/lib/profile.ts";

test("actual evidence and criterion cards show Turkish explanations and preserve source quotes", async () => {
  const source = await readFile(
    new URL("../src/components/ui.tsx", import.meta.url),
    "utf8",
  );
  const require = createRequire(import.meta.url);
  let code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const name of ["react/jsx-runtime", "next/link"]) {
    code = code.replaceAll(
      JSON.stringify(name),
      JSON.stringify(pathToFileURL(require.resolve(name)).href),
    );
  }
  for (const name of ["profile", "presentation"]) {
    code = code.replaceAll(
      JSON.stringify(`@/lib/${name}`),
      JSON.stringify(new URL(`../src/lib/${name}.ts`, import.meta.url).href),
    );
  }
  const { EvidenceCard, CriterionCard } = await import(
    `data:text/javascript;base64,${Buffer.from(await resolveI18n(code)).toString("base64")}`
  );
  const html = renderToStaticMarkup(
    createElement(EvidenceCard, {
      item: {
        skill_label: "OSPF",
        evidence_status: "declared_only",
        evidence_strength: "weak",
        evidence_type: "readme",
        source_url: "https://github.com/test/repo",
        path: "README.md",
        reason: "Cisco Packet Tracer is explicitly mentioned",
        excerpt: "Original OSPF source text",
        limitations: [],
      },
    }),
  );
  assert.match(
    html.split("<details>")[0],
    /Teknik eşleşme skoruna dahil edilmez/,
  );
  assert.match(html, /Beyan/);
  assert.match(html, /Original OSPF source text/);
  assert.doesNotMatch(html, /is explicitly mentioned/);
  const criterion = renderToStaticMarkup(
    createElement(CriterionCard, {
      item: {
        skill_label: "OSPF",
        priority: "required",
        kind: "technical_skill",
        reason: "The role specifically requires OSPF",
      },
    }),
  );
  assert.match(criterion, /İhtiyaç metninde gerekli/);
  assert.doesNotMatch(criterion, /The role specifically/);
});

test("technical declaration is visibly excluded while observed usage stays distinct", () => {
  assert.equal(statusLabels.declared_only, "Beyan");
  assert.equal(verificationLabels.declared_only, statusLabels.declared_only);
  assert.equal(provenanceLabels.observed, statusLabels.observed);
  assert.match(
    evidenceExplanation("declared_only"),
    /Teknik eşleşme skoruna dahil edilmez/,
  );
  assert.match(evidenceExplanation("observed"), /teknik kullanım gözlemlendi/);
  assert.doesNotMatch(evidenceExplanation("not_found"), /yalnızca beyan/);
  assert.match(technicalScoreExplanation, /README beyanları/);
});

test("criterion explanations use Turkish structured priority instead of model prose", () => {
  assert.equal(
    criterionExplanation("required"),
    "İhtiyaç metninde gerekli olarak belirtilen kriter.",
  );
  assert.equal(
    criterionExplanation("preferred"),
    "İhtiyaç metninde tercih edilen kriter.",
  );
  assert.equal(verificationLabels.linked, "Kaynak bağlantısı mevcut");
  assert.equal(verificationLabels.verified, "Doğrulanmış");
});
