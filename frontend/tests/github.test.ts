import { test } from "node:test";
import assert from "node:assert/strict";
import { validGitHub } from "../src/lib/api/github.ts";
import { api, userError } from "../src/lib/api/client.ts";
import { tr } from "../src/i18n/tr.ts";
import { en } from "../src/i18n/en.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as React from "react";
import * as i18n from "../src/i18n/index.ts";

const uuid = "00000000-0000-4000-8000-000000000001";
const date = "2026-10-07T10:00:00Z";
const connection = {
  id: uuid,
  github_user_id: "9007199254740993",
  github_login: "candidate",
  created_at: date,
  revoked_at: null,
};
const repository = {
  id: "9007199254740993",
  full_name: "candidate/demo",
  html_url: "https://github.com/candidate/demo",
  owner_id: "123",
  owner_login: "candidate",
  owner_type: "User",
  permissions: { pull: true },
};

test("GitHub contracts preserve string IDs and reject malformed or hostile metadata", () => {
  assert.ok(validGitHub("/github/connection", { connection }));
  assert.ok(validGitHub("/github/connection", { connection: null }));
  assert.ok(
    validGitHub("/github/connection", {
      connection: { ...connection, revoked_at: date },
    }),
  );
  assert.ok(
    !validGitHub("/github/connection", {
      connection: { ...connection, github_user_id: 9007199254740993 },
    }),
  );
  for (const bad of [
    { html_url: "javascript:alert(1)" },
    { owner_type: "Bot" },
    { permissions: { pull: "yes" } },
    { id: "1e10" },
  ])
    assert.ok(
      !validGitHub("/github/installations/42/repositories", [
        { ...repository, ...bad },
      ]),
    );
  assert.ok(validGitHub("/github/installations/42/repositories", [repository]));
  assert.ok(
    !validGitHub(
      "/github/installations/42/repositories",
      Array(501).fill(repository),
    ),
  );
  const link = {
    ...repository,
    id: uuid,
    project_id: uuid,
    github_repository_id: repository.id,
    installation_id: "42",
    relationship: "account_access",
    updated_at: date,
    revoked_at: null,
  };
  assert.ok(
    validGitHub("/projects/" + uuid + "/github-relationship", { link }),
  );
  assert.ok(
    !validGitHub("/projects/" + uuid + "/github-relationship", {
      link: { ...link, relationship: "authored" },
    }),
  );
  assert.ok(!validGitHub("/projects/wrong/github-relationship", { link }));
});

test("authorization destinations require GitHub, PKCE and opaque state", () => {
  const url =
    "https://github.com/login/oauth/authorize?state=" +
    "a".repeat(43) +
    "&code_challenge=" +
    "b".repeat(43) +
    "&code_challenge_method=S256";
  assert.ok(validGitHub("/github/connect", { authorization_url: url }));
  for (const bad of [
    url.replace("github.com", "github.com.evil.test"),
    url.replace("S256", "plain"),
    "javascript:alert(1)",
  ])
    assert.ok(!validGitHub("/github/connect", { authorization_url: bad }));
});

test("GitHub client retains credentialed requests, relationship IDs and DELETE semantics", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options?.method === "DELETE")
      return new Response(null, { status: 204 });
    return Response.json({ connection });
  };
  try {
    await api.githubConnection();
    await api.githubDisconnect();
    await api.githubUnlink(uuid);
    assert.equal(calls[0].options?.credentials, "include");
    assert.equal(calls[1].options?.method, "DELETE");
    assert.equal(
      calls[2].url,
      "/api/projects/" + uuid + "/github-relationship",
    );
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await assert.rejects(api.githubConnection());
  } finally {
    globalThis.fetch = original;
  }
});

function harness(onImported = () => {}) {
  const values: unknown[] = [];
  let cursor = 0;
  const effects: (() => void)[] = [];
  const cleanups: ((() => void) | void)[] = [];
  const dependencies: unknown[][] = [];
  const req = createRequire(import.meta.url);
  const source = readFileSync(
    new URL("../src/components/github-connection.tsx", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const mod = {
    exports: {} as {
      GitHubConnectionPanel: (props: {
        candidateId: string;
        onImported?: () => void;
      }) => React.ReactElement;
    },
  };
  new Function("require", "module", "exports", code)(
    (id: string) => {
      if (id === "react")
        return {
          ...React,
          useState: (initial: unknown) => {
            const n = cursor++;
            if (!(n in values)) values[n] = initial;
            return [
              values[n],
              (v: unknown) => {
                values[n] = typeof v === "function" ? v(values[n]) : v;
              },
            ];
          },
          useRef: (initial: unknown) => {
            const n = cursor++;
            return (values[n] ||= { current: initial });
          },
          useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
            const n = cursor++;
            if (
              !dependencies[n] ||
              deps.some((d, i) => d !== dependencies[n][i])
            ) {
              dependencies[n] = deps;
              effects.push(() => {
                cleanups[n]?.();
                cleanups[n] = effect();
              });
            }
          },
        };
      if (id.includes("i18n/index")) return i18n;
      if (id.includes("i18n/react"))
        return { useLocale: () => i18n.getLocale() };
      if (id === "@/lib/api/client") return { api, userError };
      return req(id);
    },
    mod,
    mod.exports,
  );
  return {
    dispose: () => cleanups.forEach((fn) => fn?.()),
    render: () => {
      cursor = 0;
      const tree = mod.exports.GitHubConnectionPanel({
        candidateId: uuid,
        onImported,
      });
      effects.splice(0).forEach((f) => f());
      return tree;
    },
  };
}
function nodes(tree: unknown): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}

test("GitHub private panel is candidate-gated and every new string has TR/EN copy", () => {
  const source = readFileSync(
    new URL("../src/app/aday/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /s\.user\?\.role === "candidate"/);
  assert.ok(source.includes("key={`github-${candidate.id}`}"));
  for (const key of Object.keys(tr).filter((k) => k.startsWith("github"))) {
    assert.ok(en[key as keyof typeof en]);
    assert.ok(
      !/verified developer|verified talent/i.test(en[key as keyof typeof en]),
    );
  }
});

test("installation destinations only accept the fixed GitHub App path", () => {
  const url = "https://github.com/apps/zeminai-test/installations/new";
  assert.ok(validGitHub("/github/installation-url", { installation_url: url }));
  for (const bad of [
    url + "?redirect=evil",
    url + "#evil",
    url + "/extra",
    url.replace("github.com", "github.com.evil.test"),
    url.replace("github.com", "user@github.com"),
    url.replace("https:", "http:"),
    url.replace("zeminai-test", "../evil"),
    url.replace("zeminai-test", "app%2fother"),
    "javascript:alert(1)",
  ]) {
    assert.ok(
      !validGitHub("/github/installation-url", { installation_url: bad }),
    );
  }
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function visibleNodes(
  tree: unknown,
): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(visibleNodes);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  if (tree.type === "details" && !tree.props.open) {
    return [
      tree,
      ...React.Children.toArray(tree.props.children as React.ReactNode)
        .filter(
          (child) => React.isValidElement(child) && child.type === "summary",
        )
        .flatMap(visibleNodes),
    ];
  }
  return [tree, ...visibleNodes(tree.props.children)];
}
async function click(
  h: ReturnType<typeof harness>,
  label: string,
  secondary = false,
) {
  const button = (secondary ? nodes : visibleNodes)(h.render()).find(
    (n) => n.type === "button" && n.props.children === label,
  );
  assert.ok(button, label);
  assert.ok(!button.props.disabled, label);
  (button.props.onClick as () => void)();
  await tick();
}
const installation = {
  id: "42",
  account_id: "123",
  account_login: "candidate",
  account_type: "User",
};

test("disconnected source has exactly one primary action and no installation/project selectors", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ connection: null });
  };
  const h = harness();
  try {
    h.render();
    await tick();
    const visible = visibleNodes(h.render());
    assert.deepEqual(
      visible.filter((n) => n.type === "button").map((n) => n.props.children),
      [tr.sourceGitHubConnect],
    );
    assert.equal(visible.filter((n) => n.type === "select").length, 0);
    assert.equal(calls.length, 1);
    i18n.setLocale("en");
    assert.ok(
      visibleNodes(h.render()).some(
        (n) => n.props.children === en.sourceGitHubConnect,
      ),
    );
  } finally {
    h.dispose();
    globalThis.fetch = original;
    i18n.setLocale("tr");
  }
});

test("connected source without access exposes grant action; returning from installation automatically refreshes without OAuth", async () => {
  const original = globalThis.fetch;
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const handlers = new Map<string, () => void>();
  let installed = false,
    destination = "";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (name: string, fn: () => void) =>
        handlers.set(name, fn),
      removeEventListener: (name: string) => handlers.delete(name),
      location: {
        assign: (url: string) => {
          destination = url;
        },
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      visibilityState: "visible",
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    const path = String(url);
    calls.push(path);
    if (path.endsWith("/connection")) return Response.json({ connection });
    if (path.endsWith("/installations"))
      return Response.json(installed ? [installation] : []);
    if (path.endsWith("/installation-url"))
      return Response.json({
        installation_url:
          "https://github.com/apps/zeminai-test/installations/new",
      });
    throw Error(path);
  };
  const h = harness();
  try {
    h.render();
    await tick();
    assert.deepEqual(
      visibleNodes(h.render())
        .filter((n) => n.type === "button")
        .map((n) => n.props.children),
      [tr.sourceGitHubAccess],
    );
    await click(h, tr.sourceGitHubAccess);
    assert.equal(
      destination,
      "https://github.com/apps/zeminai-test/installations/new",
    );
    installed = true;
    handlers.get("focus")!();
    await tick();
    assert.deepEqual(
      visibleNodes(h.render())
        .filter((n) => n.type === "button")
        .map((n) => n.props.children),
      [tr.sourceGitHubImport],
    );
    assert.equal(calls.filter((p) => p.endsWith("/installations")).length, 2);
    assert.ok(!calls.some((p) => p.endsWith("/connect")));
    const reloaded = harness();
    reloaded.render();
    await tick();
    assert.ok(
      visibleNodes(reloaded.render()).some(
        (n) => n.props.children === tr.sourceGitHubImport,
      ),
    );
    reloaded.dispose();
  } finally {
    h.dispose();
    globalThis.fetch = original;
    if (windowDescriptor)
      Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (documentDescriptor)
      Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("one installation opens three-repository multi-select directly, imports once and collapses without manual verification/analysis", async () => {
  const original = globalThis.fetch;
  const ids = [repository.id, "102", "103"];
  const calls: { path: string; body?: string }[] = [];
  let imported = 0;
  const h = harness(() => {
    imported++;
  });
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    calls.push({ path, body: options?.body as string });
    if (path.endsWith("/connection")) return Response.json({ connection });
    if (path.endsWith("/installations")) return Response.json([installation]);
    if (path.endsWith("/repositories"))
      return Response.json(
        ids.map((id) => ({
          ...repository,
          id,
          private: false,
          imported_project_id: null,
        })),
      );
    if (path.endsWith("/import-batch"))
      return Response.json({
        items: ids.map((id) => ({
          repository_id: id,
          status: "imported",
          result: {
            project: { id: uuid, name: "demo", repository_private: false },
            created: true,
            analysis: { state: "queued" },
          },
        })),
      });
    throw Error(path);
  };
  try {
    h.render();
    await tick();
    await click(h, tr.sourceGitHubImport);
    assert.equal(
      visibleNodes(h.render()).filter((n) => n.type === "select").length,
      0,
    );
    for (let i = 0; i < 3; i++) {
      const checkbox = visibleNodes(h.render()).filter(
        (n) => n.type === "input" && n.props.type === "checkbox",
      )[i];
      assert.ok(checkbox);
      (checkbox.props.onChange as (event: unknown) => void)({
        target: { checked: true },
      });
    }
    const button = visibleNodes(h.render()).find(
      (n) =>
        n.type === "button" &&
        n.props.children === tr.sourceImportCount.replace("{count}", "3"),
    )!;
    (button.props.onClick as () => void)();
    (button.props.onClick as () => void)();
    await tick();
    assert.equal(imported, 1);
    const imports = calls.filter((c) => c.path.endsWith("/import-batch"));
    assert.equal(imports.length, 1);
    assert.deepEqual(JSON.parse(imports[0].body!), {
      installation_id: "42",
      repository_ids: ids,
    });
    assert.equal(
      visibleNodes(h.render()).filter((n) => n.type === "input").length,
      0,
    );
    assert.ok(
      visibleNodes(h.render()).some(
        (n) => n.props.children === tr.sourceGitHubImport,
      ),
    );
    assert.ok(
      !calls.some((c) =>
        /github-relationship|analysis-jobs|\/analyze$/.test(c.path),
      ),
    );
    assert.ok(!calls.some((c) => c.path.endsWith("/projects")));
  } finally {
    h.dispose();
    globalThis.fetch = original;
  }
});

test("multiple installations ask only for account source and preserve local per-item import failures", async () => {
  const original = globalThis.fetch;
  let imported = 0;
  const h = harness(() => {
    imported++;
  });
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/connection")) return Response.json({ connection });
    if (path.endsWith("/installations"))
      return Response.json([
        installation,
        { ...installation, id: "43", account_login: "organization" },
      ]);
    if (path.endsWith("/repositories"))
      return Response.json([{ ...repository, private: false }]);
    if (path.endsWith("/import-batch"))
      return Response.json({
        items: [
          {
            repository_id: repository.id,
            status: "failed",
            error_code: "GITHUB_REPOSITORY_NOT_ACCESSIBLE",
          },
        ],
      });
    throw Error(path);
  };
  try {
    h.render();
    await tick();
    await click(h, tr.sourceGitHubImport);
    const selects = visibleNodes(h.render()).filter((n) => n.type === "select");
    assert.equal(selects.length, 1);
    (selects[0].props.onChange as (e: unknown) => void)({
      target: { value: "43" },
    });
    await tick();
    const checkbox = visibleNodes(h.render()).find((n) => n.type === "input")!;
    (checkbox.props.onChange as (e: unknown) => void)({
      target: { checked: true },
    });
    await click(h, tr.sourceImportCount.replace("{count}", "1"));
    assert.equal(imported, 0);
    assert.ok(
      visibleNodes(h.render()).some(
        (n) =>
          n.props.role === "alert" &&
          String(n.props.children).includes("GITHUB_REPOSITORY_NOT_ACCESSIBLE"),
      ),
    );
    assert.ok(JSON.stringify(h.render()).includes(tr.sourceConnected));
    await click(h, tr.sourceClose);
    await click(h, tr.sourceGitHubImport);
    assert.ok(!visibleNodes(h.render()).some((n) => n.props.role === "alert"));
  } finally {
    h.dispose();
    globalThis.fetch = original;
  }
});

test("disconnect remains secondary and does not delete projects", async () => {
  const original = globalThis.fetch;
  let disconnected = false;
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    calls.push(path);
    if (options?.method === "DELETE") {
      disconnected = true;
      return new Response(null, { status: 204 });
    }
    if (path.endsWith("/installations")) return Response.json([installation]);
    return Response.json({ connection: disconnected ? null : connection });
  };
  const h = harness();
  try {
    h.render();
    await tick();
    assert.ok(
      !visibleNodes(h.render()).some(
        (n) => n.props.children === tr.githubDisconnect,
      ),
    );
    await click(h, tr.githubDisconnect, true);
    assert.ok(disconnected);
    assert.ok(
      visibleNodes(h.render()).some(
        (n) => n.props.children === tr.sourceGitHubConnect,
      ),
    );
    assert.ok(!calls.some((path) => path.includes("/projects")));
  } finally {
    h.dispose();
    globalThis.fetch = original;
  }
});
