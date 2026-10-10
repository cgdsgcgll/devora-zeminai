import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as React from "react";
import * as polling from "../src/lib/project-polling.ts";
import * as i18n from "../src/i18n/index.ts";
import { tr } from "../src/i18n/tr.ts";
import { en } from "../src/i18n/en.ts";

type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement<Record<string, unknown>>(tree)
    ? [tree, ...nodes(tree.props.children)]
    : [];
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function panel(
  file: string,
  name: string,
  api: Record<string, unknown>,
  props: Record<string, unknown>,
  session = {},
) {
  const state: unknown[] = [];
  const deps: unknown[][] = [];
  const effects: (() => void)[] = [];
  const cleanups: ((() => void) | void)[] = [];
  let cursor = 0;
  const req = createRequire(import.meta.url);
  const code = ts.transpileModule(
    readFileSync(new URL("../src/components/" + file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2017,
      },
    },
  ).outputText;
  const mod = {
    exports: {} as Record<string, (p: Record<string, unknown>) => Node>,
  };
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
          useRef: (initial: unknown) => {
            const i = cursor++;
            return (state[i] ??= { current: initial });
          },
          useEffect: (fn: () => void | (() => void), values: unknown[]) => {
            const i = cursor++;
            if (!deps[i] || values.some((v, j) => v !== deps[i][j])) {
              deps[i] = values;
              effects.push(() => {
                cleanups[i]?.();
                cleanups[i] = fn();
              });
            }
          },
        };
      if (id === "@/lib/api/client")
        return { api, userError: (e: Error) => e.message };
      if (id.includes("project-polling")) return polling;
      if (id.includes("i18n/index")) return i18n;
      if (id.includes("i18n/react")) return { useLocale: i18n.getLocale };
      if (id === "./session") return { useSession: () => session };
      if (id === "./ui") return { EvidenceCard: () => null };
      return req(id);
    },
    mod,
    mod.exports,
  );
  const render = () => {
    cursor = 0;
    const tree = mod.exports[name](props);
    effects.splice(0).forEach((f) => f());
    return tree;
  };
  return {
    dispose: () => cleanups.forEach((f) => f?.()),
    render,
    find: (type: string, text?: string) =>
      nodes(render()).find(
        (n) =>
          n.type === type && (text === undefined || n.props.children === text),
      ),
    click: async (text: string) => {
      const b = nodes(render()).find(
        (n) => n.type === "button" && n.props.children === text,
      );
      assert.ok(b, text);
      (b.props.onClick as (event: unknown) => void)({
        currentTarget: { closest: () => null },
      });
      await tick();
    },
  };
}

test("project workspace keeps create form, confirms deletion, refreshes remaining projects and permits another create", async () => {
  const activities = ["First", "Second"].map((name, i) => ({
    project: {
      id: String(i + 1),
      name,
      description: "",
      source_url: "https://github.com/test/repo",
    },
    link: null,
    analysis: { state: "not_started" },
    run: null,
    evidence: [],
  }));
  let deletes = 0,
    creates = 0,
    restores = 0;
  const api = {
    projects: async () => activities.map((a) => a.project),
    projectActivity: async (id: string) =>
      activities.find((a) => a.project.id === id),
    deleteProject: async (id: string) => {
      deletes++;
      activities.splice(
        activities.findIndex((a) => a.project.id === id),
        1,
      );
    },
    queueAnalysis: async () => ({ state: "queued" }),
    createProject: async () => {
      creates++;
      const a = {
        ...activities[0],
        project: { ...activities[0].project, id: "3", name: "Third" },
      };
      activities.push(a);
      return a.project;
    },
  };
  const h = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    api,
    { candidateId: "candidate", revision: 0, changed: () => {} },
    {
      restore: async () => {
        restores++;
      },
      saveProject: () => {},
    },
  );
  h.render();
  await tick();
  assert.equal(nodes(h.render()).filter((n) => n.type === "article").length, 2);
  assert.ok(h.find("form"));
  await h.click(tr.deleteProject);
  assert.equal(deletes, 0);
  await h.click(tr.confirmProjectDelete);
  assert.equal(deletes, 1);
  assert.equal(restores, 1);
  assert.equal(nodes(h.render()).filter((n) => n.type === "article").length, 1);
  const original = globalThis.FormData;
  try {
    Object.defineProperty(globalThis, "FormData", {
      configurable: true,
      value: class {
        get(k: string) {
          return (
            {
              name: "Third",
              description: "",
              url: "https://github.com/test/repo",
            } as Record<string, string>
          )[k];
        }
      },
    });
    (h.find("form")!.props.onSubmit as (e: unknown) => void)({
      preventDefault() {},
      currentTarget: {
        reset() {},
        closest() {
          return null;
        },
      },
    });
    await tick();
    assert.equal(creates, 1);
    assert.equal(
      nodes(h.render()).filter((n) => n.type === "article").length,
      2,
    );
  } finally {
    globalThis.FormData = original;
  }
});

test("source analysis failure does not hide a verified relationship", async () => {
  const activity = {
    project: {
      id: "1",
      name: "Project",
      source_url: "https://github.com/test/repo",
    },
    link: { relationship: "personal_owner", revoked_at: null },
    analysis: { state: "failed", error_code: "GITHUB_FETCH_FAILED" },
    run: { status: "failed", error_code: "GITHUB_FETCH_FAILED" },
    evidence: [],
  };
  const h = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    {
      projects: async () => [activity.project],
      projectActivity: async () => activity,
    },
    { candidateId: "candidate", revision: 0, changed: () => {} },
  );
  h.render();
  await tick();
  const flat = JSON.stringify(h.render());
  assert.ok(flat.includes(tr.sourcePersonal));
  assert.ok(flat.includes(tr.sourceAnalysisFailed));
});

test("professional preview requires explicit selection confirmation and edits invalidate preview", async () => {
  let saves = 0;
  let previewData: unknown;
  const api = {
    professionalPreview: async (_id: string, data: unknown) => {
      previewData = data;
      return {
        records: [
          {
            title: "User title",
            organization: "",
            role: "",
            description: "Python mention",
          },
        ],
      };
    },
    professionalImport: async (
      _id: string,
      data: { confirmed: boolean; selected: number[] },
    ) => {
      assert.equal(data.confirmed, true);
      assert.deepEqual(data.selected, [0]);
      saves++;
      return [];
    },
  };
  const h = panel("professional-import.tsx", "ProfessionalImport", api, {
    candidateId: "candidate",
    changed: () => {},
  });
  (h.find("input")!.props.onChange as (e: unknown) => void)({
    target: { value: "https://linkedin.com/in/test" },
  });
  (h.find("textarea")!.props.onChange as (e: unknown) => void)({
    target: { value: "Python mention" },
  });
  (h.find("form")!.props.onSubmit as (e: unknown) => void)({
    preventDefault() {},
  });
  await tick();
  assert.deepEqual(previewData, {
    source_url: "https://linkedin.com/in/test",
    text: "Python mention",
  });
  assert.equal(saves, 0);
  assert.ok(h.find("button", tr.professionalSave));
  (h.find("textarea")!.props.onChange as (e: unknown) => void)({
    target: { value: "Updated" },
  });
  assert.ok(!h.find("button", tr.professionalSave));
  (h.find("form")!.props.onSubmit as (e: unknown) => void)({
    preventDefault() {},
  });
  await tick();
  await h.click(tr.professionalSave);
  assert.equal(saves, 1);
  assert.ok(!h.find("button", tr.professionalSave));
});

test("new candidate lifecycle copy has TR/EN and preserved source boundaries", () => {
  for (const key of [
    "sourcesIntro",
    "professionalFormat",
    "deleteProjectConfirm",
    "privateAnalysisUnsupported",
    "githubImportNote",
  ] as const) {
    assert.ok(tr[key]);
    assert.ok(en[key]);
  }
  assert.match(en.privateAnalysisUnsupported, /not supported/);
  assert.match(en.professionalNote, /not employment verification/);
});

test("three imported projects appear immediately with independent states, disabled active analysis and project-only retry", async () => {
  const activities = ["A", "B", "C"].map((name, i) => ({
    project: {
      id: String(i),
      name,
      description: "",
      source_url: "https://github.com/test/" + name,
    },
    link: { relationship: "personal_owner", revoked_at: null },
    analysis: {
      state: i === 1 ? "analyzing" : "queued",
      error_code: null as string | null,
    },
    run: null,
    evidence: [] as { evidence_status: string }[],
  }));
  const retries: string[] = [];
  let release: (() => void) | undefined;
  const h = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    {
      projects: async () => activities.map((a) => a.project),
      projectActivity: async (id: string) =>
        activities.find((a) => a.project.id === id),
      queueAnalysis: async (id: string) => {
        retries.push(id);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        activities[1].analysis = { state: "queued", error_code: null };
      },
    },
    { candidateId: "candidate", revision: 0, changed() {} },
  );
  try {
    h.render();
    await tick();
    let articles = nodes(h.render()).filter((n) => n.type === "article");
    assert.equal(articles.length, 3);
    for (const article of articles) {
      assert.ok(JSON.stringify(article).includes(tr.sourcePersonal));
      assert.ok(JSON.stringify(article).includes(tr.analysisEvidencePending));
      const button = nodes(article).find(
        (n) => n.type === "button" && n.props.children === tr.projectAnalyzing,
      );
      assert.equal(button, undefined);
      assert.ok(
        !nodes(article).some(
          (n) => n.type === "button" && n.props.children === tr.analyzeProject,
        ),
      );
    }
    activities.forEach((a, i) => {
      a.analysis = {
        state: i === 1 ? "failed" : "succeeded",
        error_code: i === 1 ? "LLM_TIMEOUT" : null,
      };
      a.evidence = i === 1 ? [] : [{ evidence_status: "observed" }];
    });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    h.render();
    await tick();
    articles = nodes(h.render()).filter((n) => n.type === "article");
    assert.ok(JSON.stringify(articles[1]).includes(tr.sourceAnalysisFailed));
    assert.ok(JSON.stringify(articles[0]).includes(tr.projectAnalyzed));
    assert.ok(JSON.stringify(articles[2]).includes(tr.projectAnalyzed));
    await h.click(tr.sourceRetry);
    await h.click(tr.sourceRetry);
    assert.deepEqual(retries, ["1"]);
    release!();
    await tick();
    assert.equal(
      nodes(h.render()).filter((n) => n.type === "article").length,
      3,
    );
  } finally {
    h.dispose();
  }
});
function visible(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(visible);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  if (tree.type === "details" && !tree.props.open) {
    return [
      tree,
      ...React.Children.toArray(tree.props.children as React.ReactNode)
        .filter(
          (child) => React.isValidElement(child) && child.type === "summary",
        )
        .flatMap(visible),
    ];
  }
  return [tree, ...visible(tree.props.children)];
}

test("failed project has only retry in normal view; edit/delete stay secondary with explicit confirmation", async () => {
  let deletes = 0;
  const activity = {
    project: {
      id: "1",
      name: "Failed project",
      source_url: "https://github.com/test/repo",
    },
    link: { relationship: "personal_owner", revoked_at: null },
    analysis: { state: "failed", error_code: "LLM_TIMEOUT" },
    run: null,
    evidence: [],
  };
  const h = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    {
      projects: async () => [activity.project],
      projectActivity: async () => activity,
      deleteProject: async () => {
        deletes++;
      },
    },
    { candidateId: "candidate", revision: 0, changed() {} },
    { restore: async () => {} },
  );
  try {
    h.render();
    await tick();
    let card = nodes(h.render()).find((n) => n.type === "article")!;
    assert.deepEqual(
      visible(card)
        .filter((n) => n.type === "button")
        .map((n) => n.props.children),
      [tr.sourceRetry],
    );
    const details = nodes(card).find((n) => n.type === "details")!;
    (details.props.onToggle as (event: unknown) => void)({
      currentTarget: { open: true },
    });
    card = nodes(h.render()).find((n) => n.type === "article")!;
    assert.ok(
      visible(card).some(
        (n) => n.type === "button" && n.props.children === tr.editProject,
      ),
    );
    await h.click(tr.deleteProject);
    assert.equal(deletes, 0);
    assert.ok(
      visible(h.render()).some(
        (n) => n.props.children === tr.deleteProjectConfirm,
      ),
    );
    await h.click(tr.cancelProjectDelete);
    assert.equal(deletes, 0);
    await h.click(tr.deleteProject);
    await h.click(tr.confirmProjectDelete);
    assert.equal(deletes, 1);
  } finally {
    h.dispose();
  }
});
for (const [code, retryable, message] of [
  ["LLM_CONFIGURATION_ERROR", false, tr.analysisConfigurationError],
  ["LLM_RATE_LIMITED", true, tr.analysisRateLimited],
  ["GROUNDING_REJECTED", false, tr.analysisValidationError],
  ["INSUFFICIENT_PROJECT_DATA", false, tr.analysisSourceError],
] as const) {
  test(`analysis failure ${code} exposes only meaningful retry and retains provenance`, async () => {
    const activity = {
      project: {
        id: "1",
        name: "Repository",
        source_url: "https://github.com/test/repo",
      },
      link: { relationship: "personal_owner", revoked_at: null },
      analysis: { state: "failed", error_code: code, retryable },
      run: null,
      evidence: [],
    };
    const h = panel(
      "project-workspace.tsx",
      "ProjectWorkspace",
      {
        projects: async () => [activity.project],
        projectActivity: async () => activity,
      },
      { candidateId: "candidate", revision: 0, changed() {} },
      { restore: async () => {} },
    );
    try {
      h.render();
      await tick();
      const tree = h.render();
      assert.ok(JSON.stringify(tree).includes(message));
      assert.ok(JSON.stringify(tree).includes(tr.sourcePersonal));
      assert.equal(
        visible(tree).some(
          (n) => n.type === "button" && n.props.children === tr.sourceRetry,
        ),
        retryable,
      );
    } finally {
      h.dispose();
    }
  });
}
test("project polling notifies profile only on changed results and details expose observed source once", async () => {
  let notifications = 0;
  const evidence = {
    id: "e1",
    skill_label: "C++",
    evidence_status: "observed",
    evidence_type: "repository_language",
    path: null,
    source_url: "https://github.com/test/repo",
    excerpt: "C++",
  };
  const activity: {
    project: { id: string; name: string; source_url: string };
    analysis: { state: string };
    run: null | { id: string; status: string };
    evidence: (typeof evidence)[];
  } = {
    project: {
      id: "1",
      name: "Repository",
      source_url: "https://github.com/test/repo",
    },
    analysis: { state: "analyzing" },
    run: null,
    evidence: [],
  };
  const h = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    {
      projects: async () => [activity.project],
      projectActivity: async () => activity,
    },
    {
      candidateId: "candidate",
      revision: 0,
      changed() {},
      onSummaryChanged() {
        notifications++;
      },
    },
  );
  try {
    h.render();
    await tick();
    h.render();
    assert.equal(notifications, 1);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    h.render();
    assert.equal(notifications, 1);
    activity.analysis = { state: "succeeded" };
    activity.run = { id: "run1", status: "completed" };
    activity.evidence = [evidence, evidence];
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const tree = h.render();
    assert.equal(notifications, 2);
    const detail = nodes(nodes(tree).find((n) => n.type === "article")!).find(
      (n) => n.type === "details" && n.props.className === "source-details",
    )!;
    const cards = nodes(detail).filter((n) => n.props.item);
    assert.equal(cards.length, 1);
    assert.deepEqual(cards[0].props.item, evidence);
    // A repository-language observation is never relabelled as source-code proof.
    assert.equal(
      (cards[0].props.item as typeof evidence).evidence_type,
      "repository_language",
    );
  } finally {
    h.dispose();
  }
});

test("selected invalidated or archived project cannot retain session evidence", async () => {
  const project = {
    id: "p",
    name: "Current",
    source_url: "https://github.com/test/repo",
  };
  const session = {
    data: {
      project,
      run: { id: "old", status: "completed" },
      evidence: [{ id: "old" }],
    },
    saveProject() {
      this.data.run = undefined as never;
      this.data.evidence = [];
    },
    clearProject() {
      this.data.project = undefined as never;
      this.data.run = undefined as never;
      this.data.evidence = [];
    },
  };
  let rows = [
    {
      project,
      run: { id: "old", status: "failed" },
      evidence: [],
      analysis: { state: "failed", retryable: false },
    },
  ];
  const props = { candidateId: "c", revision: 0, changed() {} };
  const ui = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    {
      projects: async () => rows.map((r) => r.project),
      projectActivity: async () => rows[0],
    },
    props,
    session,
  );
  ui.render();
  await tick();
  ui.render();
  assert.equal(session.data.run, undefined);
  assert.deepEqual(session.data.evidence, []);
  assert.equal(ui.find("button", tr.sourceRetry), undefined);
  rows = [];
  props.revision++;
  ui.render();
  await tick();
  ui.render();
  assert.equal(session.data.project, undefined);
  ui.dispose();
});

test("project loading and empty results are distinct", async () => {
  let resolve!: (value: unknown[]) => void;
  const ui = panel(
    "project-workspace.tsx",
    "ProjectWorkspace",
    {
      projects: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
    { candidateId: "c", revision: 0, changed() {} },
  );
  ui.render();
  assert.equal(ui.find("p", tr.noProjectsYet), undefined);
  assert.ok(ui.find("p", tr.candidateProjectsLoading));
  resolve([]);
  await tick();
  assert.ok(ui.find("p", tr.noProjectsYet));
  ui.dispose();
});
