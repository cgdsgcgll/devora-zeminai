import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as React from "react";
import ts from "typescript";
import * as i18n from "../src/i18n/index.ts";
import { tr } from "../src/i18n/tr.ts";

type Node = React.ReactElement<Record<string, unknown>>;
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement<Record<string, unknown>>(tree)
    ? [tree, ...nodes(tree.props.children)]
    : [];
}
function harness(remove: () => Promise<void>, onSaved: () => void) {
  let cursor = 0;
  const state: unknown[] = [];
  const effects: (() => void)[] = [];
  const deps: unknown[][] = [];
  const req = createRequire(import.meta.url);
  const code = ts.transpileModule(
    readFileSync(
      new URL("../src/components/profile-panel.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const mod = { exports: {} as { ProfilePanel: (props: unknown) => Node } };
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
              (v: unknown) => {
                state[i] = typeof v === "function" ? v(state[i]) : v;
              },
            ];
          },
          useRef: (initial: unknown) => {
            const i = cursor++;
            return (state[i] ||= { current: initial });
          },
          useEffect: (fn: () => void, values: unknown[]) => {
            const i = cursor++;
            if (!deps[i] || values.some((v, j) => v !== deps[i][j])) {
              deps[i] = values;
              effects.push(fn);
            }
          },
        };
      if (id.includes("i18n/index")) return i18n;
      if (id.includes("i18n/react")) return { useLocale: i18n.getLocale };
      if (id === "./session")
        return {
          useSession: () => ({
            ready: true,
            busy: "",
            act: () => assert.fail("profile errors must stay local"),
          }),
        };
      if (id === "@/lib/api/client")
        return {
          api: {
            profiles: async () => [
              {
                id: "record",
                title: "QA",
                category: "project",
                metadata_json: {},
              },
            ],
            deleteProfile: remove,
          },
          userError: () => "Local deletion failure",
        };
      if (id === "@/lib/profile")
        return {
          categoryLabels: {},
          outputLabels: {},
          participationLabels: {},
          safeProfileSource: () => true,
        };
      if (id === "./use-content-motion")
        return {
          useContentMotion: () => ({
            ref: { current: null },
            transition: async (fn: () => void) => fn(),
          }),
        };
      if (id === "next/link") return { default: () => null };
      if (id.startsWith("./")) return new Proxy({}, { get: () => () => null });
      return req(id);
    },
    mod,
    mod.exports,
  );
  return () => {
    cursor = 0;
    const tree = mod.exports.ProfilePanel({
      candidateId: "candidate",
      compact: true,
      onSaved,
    });
    effects.splice(0).forEach((fn) => fn());
    return tree;
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
for (const fails of [false, true])
  test(`profile deletion ${fails ? "keeps errors local and preserves the record" : "refreshes the parent summary once"}`, async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      value: { location: { hash: "" } },
      configurable: true,
    });
    let notifications = 0;
    let calls = 0;
    try {
      const render = harness(
        async () => {
          calls++;
          if (fails) throw Error("failure");
        },
        () => notifications++,
      );
      render();
      await tick();
      const remove = nodes(render()).find(
        (n) => n.type === "button" && n.props.className === "button danger",
      )!;
      (remove.props.onClick as () => void)();
      const confirm = nodes(render()).find(
        (n) => n.type === "button" && n.props.children === tr.confirmDelete,
      )!;
      assert.ok(confirm);
      (confirm.props.onClick as () => void)();
      (confirm.props.onClick as () => void)();
      await tick();
      assert.equal(calls, 1);
      assert.equal(notifications, fails ? 0 : 1);
      const tree = render();
      assert.equal(
        nodes(tree).filter((n) => n.props.className === "profile-entry").length,
        fails ? 1 : 0,
      );
      assert.equal(
        JSON.stringify(tree).includes("Local deletion failure"),
        fails,
      );
    } finally {
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
