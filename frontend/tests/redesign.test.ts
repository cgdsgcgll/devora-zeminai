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
  profileHighlights,
  discoveryPreview,
} from "../src/lib/visual-summary.ts";

async function component(name: string) {
  const source = await readFile(
    new URL(`../src/components/${name}.tsx`, import.meta.url),
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
    );
  return import(
    `data:text/javascript;base64,${Buffer.from(await resolveI18n(code)).toString("base64")}`
  );
}

test("profile highlights count experience records, never technical observations as experience", () => {
  const counts = [
    { label: "Proje", count: 2 },
    { label: "Gözlemlenen teknik kanıt", count: 12 },
    { label: "Eğitim", count: 1 },
    { label: "Hackathon", count: 3 },
    { label: "Portföy", count: 2 },
  ];
  assert.deepEqual(profileHighlights(counts), [
    { label: "Proje", count: 2 },
    { label: "Gözlemlenen teknik kanıt", count: 12 },
    { label: "Gelişim kaydı", count: 6 },
  ]);
  assert.deepEqual(
    profileHighlights([]).map((x) => x.count),
    [0, 0, 0],
  );
});

test("discovery preview caps signals without mutating or reordering server criteria", () => {
  const criteria = [
    { matched: false, label: "Docker" },
    ...["Python", "FastAPI", "SQL", "Git"].map((label) => ({
      matched: true,
      label,
    })),
  ];
  const original = structuredClone(criteria);
  assert.deepEqual(discoveryPreview(criteria), {
    signals: ["Python", "FastAPI", "SQL"],
    missing: 1,
  });
  assert.deepEqual(criteria, original);
  assert.deepEqual(discoveryPreview([]), { signals: [], missing: 0 });
});

test("experience starts with six labeled categories and forwards the chosen category", async () => {
  const { ExperienceChooser } = await component("experience-chooser");
  let selected = "";
  let element: ReturnType<typeof ExperienceChooser>;
  function Capture() {
    element = ExperienceChooser({
      disabled: false,
      onChoose: (value: string) => {
        selected = value;
      },
    });
    return element;
  }
  renderToStaticMarkup(createElement(Capture));
  const buttons = element!.props.children[1];
  assert.equal(buttons.length, 6);
  buttons
    .find((button: { key: string }) => button.key === "hackathon")
    .props.onClick();
  assert.equal(selected, "hackathon");
  const html = renderToStaticMarkup(
    createElement(ExperienceChooser, { disabled: true, onChoose: () => {} }),
  );
  assert.match(html, /<fieldset[^>]*disabled/);
  for (const title of [
    "Eğitim",
    "Sertifika",
    "Hackathon",
    "Etkinlik",
    "Topluluk",
    "Portföy",
  ])
    assert.ok(html.includes(title));
  assert.equal((html.match(/<svg/g) || []).length, 6);
  assert.doesNotMatch(html, /<form|<input/);
});

test("processing state describes actual operation without claiming progress or completion", async () => {
  const { ProcessingState, ButtonProgress } = await component("feedback");
  for (const kind of ["project", "need", "match"]) {
    const html = renderToStaticMarkup(createElement(ProcessingState, { kind }));
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.doesNotMatch(html, /%|progressbar|tamamlandı[.!< ]|setTimeout/);
  }
  assert.equal(
    renderToStaticMarkup(createElement(ButtonProgress, { active: false })),
    "",
  );
  assert.match(
    renderToStaticMarkup(createElement(ButtonProgress, { active: true })),
    /aria-hidden="true"/,
  );
});
