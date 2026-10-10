import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import ts from "typescript";
import * as i18n from "../src/i18n/index.ts";
import { tr } from "../src/i18n/tr.ts";
import { en } from "../src/i18n/en.ts";
import * as visualSummary from "../src/lib/visual-summary.ts";
type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement<Record<string, unknown>>(tree)
    ? [tree, ...nodes(tree.props.children)]
    : [];
}
function page(
  livingProfile = async () => ({
    summary: [
      { label: "Proje", count: 3 },
      { label: "Gözlemlenen teknik kanıt", count: 1 },
    ],
  }),
) {
  let cursor = 0;
  const state: unknown[] = [];
  const dependencies: unknown[][] = [];
  const effects: (() => void)[] = [];
  const req = createRequire(import.meta.url);
  const code = ts.transpileModule(
    readFileSync(new URL("../src/app/aday/page.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const mod = { exports: {} as { default: () => Node } };
  const components = new Map<string, () => null>();
  new Function("require", "module", "exports", code)(
    (id: string) => {
      if (id === "react")
        return {
          ...React,
          useState: (initial: unknown) => {
            const i = cursor++;
            if (!(i in state)) state[i] = initial;
            return [
              state[i],
              (value: unknown) => {
                state[i] =
                  typeof value === "function" ? value(state[i]) : value;
              },
            ];
          },
          useEffect: (fn: () => void, deps: unknown[]) => {
            const i = cursor++;
            if (
              !dependencies[i] ||
              deps.some((v, j) => v !== dependencies[i][j])
            ) {
              dependencies[i] = deps;
              effects.push(fn);
            }
          },
        };
      if (id.includes("i18n/index")) return i18n;
      if (id.includes("i18n/react")) return { useLocale: i18n.getLocale };
      if (id === "@/components/session")
        return {
          useSession: () => ({
            ready: true,
            user: { role: "candidate" },
            data: {
              candidate: { id: "candidate", name: "Candidate" },
              evidence: [],
            },
          }),
        };
      if (id === "@/lib/api/client")
        return { api: { profiles: async () => [], livingProfile } };
      if (id === "@/lib/visual-summary") return visualSummary;
      if (id === "@/lib/presentation") return { validateName: () => null };
      if (id === "next/link") return { default: () => null };
      if (id.startsWith("@/components/"))
        return new Proxy(
          {},
          {
            get: (_target, name: string) => {
              if (!components.has(name)) components.set(name, () => null);
              return components.get(name);
            },
          },
        );
      return req(id);
    },
    mod,
    mod.exports,
  );
  return {
    render() {
      cursor = 0;
      const tree = mod.exports.default();
      effects.splice(0).forEach((fn) => fn());
      return tree;
    },
    components,
  };
}
test("candidate has three top-level areas and opens only the selected source flow", async () => {
  const h = page();
  let tree = h.render();
  await new Promise((resolve) => setImmediate(resolve));
  tree = h.render();
  assert.deepEqual(
    nodes(tree)
      .filter((n) => n.type === "h2")
      .map((n) => n.props.children),
    [tr.candidateSummary, tr.candidateSources, tr.candidateProjectsExperience],
  );
  assert.ok(
    !nodes(tree).some((n) => n.type === h.components.get("ProfessionalImport")),
  );
  let profile = nodes(tree).find(
    (n) => n.type === h.components.get("ProfilePanel"),
  )!;
  assert.equal(profile.props.compact, true);
  assert.equal(profile.props.entryCategory, undefined);
  const professional = nodes(tree).find(
    (n) => n.type === "button" && n.props.children === tr.sourceAddProfile,
  )!;
  (professional.props.onClick as () => void)();
  assert.ok(
    nodes(h.render()).some(
      (n) => n.type === h.components.get("ProfessionalImport"),
    ),
  );
  const education = nodes(h.render()).find(
    (n) =>
      n.type === "article" &&
      nodes(n).some((child) => child.props.children === tr.sourceEducation),
  )!;
  (
    nodes(education).find((n) => n.type === "button")!.props
      .onClick as () => void
  )();
  tree = h.render();
  assert.ok(
    !nodes(tree).some((n) => n.type === h.components.get("ProfessionalImport")),
  );
  profile = nodes(tree).find(
    (n) => n.type === h.components.get("ProfilePanel"),
  )!;
  assert.equal(profile.props.entryCategory, "education");
  (profile.props.onSaved as () => void)();
  assert.equal(
    nodes(h.render()).find((n) => n.type === h.components.get("ProfilePanel"))!
      .props.entryCategory,
    undefined,
  );
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
function summaryFacts(tree: unknown) {
  return nodes(tree)
    .filter((n) => n.props.className === "candidate-summary-fact")
    .map((n) => ({
      count: nodes(n).find((child) => child.type === "strong")!.props.children,
      label: (n.props.children as unknown[]).at(-1),
    }));
}
test("candidate summary uses current Living Profile facts and reconstructs on reload", async () => {
  for (let reload = 0; reload < 2; reload++) {
    const h = page();
    h.render();
    await settle();
    assert.deepEqual(summaryFacts(h.render()), [
      { count: 3, label: tr.m216 },
      { count: 1, label: tr.m217 },
      { count: 0, label: tr.m218 },
    ]);
    const card = nodes(h.render()).find((n) => n.props.id === "basics")!;
    assert.equal(
      nodes(card).filter((n) => n.props.className === "candidate-summary-fact")
        .length,
      3,
    );
    assert.doesNotMatch(
      JSON.stringify(card),
      /proficiency|expert|talent score|uzmanlık puanı/i,
    );
  }
});
test("terminal project reconciliation refreshes authoritative facts; failed and archived projects add no evidence", async () => {
  let count = 0,
    projects = 3,
    requests = 0;
  const h = page(async () => {
    requests++;
    return {
      summary: [
        { label: "Proje", count: projects },
        { label: "Gözlemlenen teknik kanıt", count },
      ],
    };
  });
  h.render();
  await settle();
  const reconcile = () => {
    const workspace = nodes(h.render()).find(
      (n) => n.type === h.components.get("ProjectWorkspace"),
    )!;
    (workspace.props.onSummaryChanged as () => void)();
    h.render();
  };
  count = 1;
  reconcile();
  await settle();
  assert.equal(
    summaryFacts(h.render()).find((f) => f.label === tr.m217)?.count,
    1,
  );
  // Sibling failed: server still returns only the existing successful evidence.
  reconcile();
  await settle();
  assert.equal(
    summaryFacts(h.render()).find((f) => f.label === tr.m217)?.count,
    1,
  );
  // Archive removes that project from the backend's current-material read model.
  count = 0;
  projects = 2;
  reconcile();
  await settle();
  assert.deepEqual(summaryFacts(h.render()).slice(0, 2), [
    { count: 2, label: tr.m216 },
    { count: 0, label: tr.m217 },
  ]);
  assert.equal(requests, 4);
});
test("compact source copy is localized without authorship claims; narrow-layout rules keep controls bounded", () => {
  for (const key of Object.keys(tr).filter(
    (key) => key.startsWith("source") || key.startsWith("candidate"),
  )) {
    assert.ok(en[key as keyof typeof en], key);
  }
  assert.doesNotMatch(en.sourcePersonal, /author|creator|expert/i);
  const css = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /source-details > summary:focus-visible/);
});
