import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as React from "react";
import * as i18n from "../src/i18n/index.ts";
import { api } from "../src/lib/api/client.ts";

// Execute the actual event handlers with a minimal hook store, no server/network or timing.
function harness() {
  const state: unknown[] = [];
  let cursor = 0;
  const req = createRequire(import.meta.url);
  const source = readFileSync(
    new URL("../src/components/team-complements.tsx", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const mod = {
    exports: {} as {
      TeamComplements: (p: Record<string, unknown>) => React.ReactElement;
    },
  };
  new Function("require", "module", "exports", compiled)(
    (id: string) => {
      if (id === "react")
        return {
          ...React,
          useState: (initial: unknown) => {
            const index = cursor++;
            if (!(index in state)) state[index] = initial;
            return [
              state[index],
              (v: unknown) => {
                state[index] = v;
              },
            ];
          },
          useRef: (initial: unknown) => {
            const index = cursor++;
            return (state[index] ||= { current: initial });
          },
        };
      if (id.includes("i18n/index")) return i18n;
      if (id.includes("i18n/react"))
        return { useLocale: () => i18n.getLocale() };
      if (id === "@/lib/api/client") return { api, userError: () => "error" };
      if (id === "./evidence-sources") return { Sources: () => null };
      return req(id);
    },
    mod,
    mod.exports,
  );
  return (props: Record<string, unknown>) => {
    cursor = 0;
    return mod.exports.TeamComplements(props);
  };
}
function nodes(tree: unknown): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
const team = {
  criteria: [{ supporters: [] }],
  required_coverage: 0.5,
  preferred_coverage: 0,
};

test("complement action exists only for 2–3 selections with gaps", () => {
  for (const count of [1, 2, 3, 4])
    for (const gap of [true, false]) {
      const render = harness();
      const tree = render({
        needId: "n",
        anonymous: true,
        selected: Array.from({ length: count }, (_, i) => String(i)),
        team: gap ? team : { ...team, criteria: [] },
        onAdd: () => {},
      });
      assert.equal(
        nodes(tree).some((n) => n.type === "button"),
        gap && count >= 2 && count <= 3,
      );
    }
});
test("complements fetch only on click, preserve anonymous labels and add explicit selection", async () => {
  for (const locale of ["tr", "en"] as const) {
    i18n.setLocale(locale);
    const render = harness();
    let calls = 0;
    const selected = ["a", "b"];
    const original = api.teamComplements;
    api.teamComplements = async () => {
      calls++;
      return {
        need_id: "n",
        anonymous: true,
        uncovered_criteria: [],
        ordering: "order",
        limitations: [],
        candidates: [
          {
            candidate_id: "c",
            label: "SECRET",
            closes_required_count: 1,
            closes_preferred_count: 0,
            closes: [
              {
                criterion_id: "g",
                label: "OSPF",
                priority: "required",
                sources: [],
              },
            ],
            resulting_required_coverage: 1,
            resulting_preferred_coverage: 0,
            resulting_matched_count: 1,
          },
        ],
      };
    };
    const props = {
      needId: "n",
      anonymous: true,
      selected,
      team,
      onAdd: (id: string) => selected.push(id),
    };
    try {
      let tree = render(props);
      assert.equal(calls, 0);
      await (
        nodes(tree).find((n) => n.type === "button")!.props
          .onClick as () => Promise<void>
      )();
      tree = render(props);
      assert.equal(calls, 1);
      const serialized = JSON.stringify(tree);
      assert.ok(!serialized.includes("SECRET"));
      assert.ok(serialized.includes("OSPF"));
      const add = nodes(tree).find(
        (n) => n.type === "button" && n.props.children === i18n.t("addToTeam"),
      )!;
      (add.props.onClick as () => void)();
      assert.deepEqual(selected, ["a", "b", "c"]);
      // Parent keys each instance by selection + context. A new selection discards previous results.
      assert.ok(!JSON.stringify(harness()(props)).includes("OSPF"));
    } finally {
      api.teamComplements = original;
    }
  }
  i18n.setLocale("tr");
  const source = readFileSync(
    new URL("../src/app/kesif/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("${needId}:${anonymous}:${selectionKey}:${retry}"));
});
