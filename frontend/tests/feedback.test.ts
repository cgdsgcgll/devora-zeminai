import { resolveI18n } from "./i18n-loader.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { actionSuccess, presentationNote } from "../src/lib/presentation.ts";

test("known interface notes are Turkish while arbitrary source text is untouched", () => {
  assert.match(
    presentationNote(
      "Repository-level evidence; individual authorship not verified. Repo bağlantısı adayın kodu yazdığını doğrulamaz.",
    ),
    /Kanıtlar proje düzeyindedir/,
  );
  assert.equal(
    presentationNote("Original user or model excerpt."),
    "Original user or model excerpt.",
  );
});

test("operation feedback explains the next step without claiming verification", () => {
  assert.match(actionSuccess("Proje oluşturuluyor…"), /projeyi analiz edin/);
  assert.match(
    actionSuccess("Profil kaydı kaydediliyor…"),
    /yeniden hesaplayın/,
  );
  assert.match(
    actionSuccess("İhtiyaç kriterleri hazırlanıyor…"),
    /kriterleri inceleyebilirsiniz/,
  );
  assert.doesNotMatch(
    actionSuccess("Proje analiz ediliyor…"),
    /doğrulanmış|uzman/,
  );
});

test("feedback components announce status, escape text and provide a dismiss target", async () => {
  const source = await readFile(
    new URL("../src/components/feedback.tsx", import.meta.url),
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
  const { LoadingState, SuccessNotice } = await import(
    `data:text/javascript;base64,${Buffer.from(await resolveI18n(code)).toString("base64")}`
  );
  const loading = renderToStaticMarkup(
    createElement(LoadingState, { label: "Profil yükleniyor…" }),
  );
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(loading, /tamamlandı/);
  const skeleton = renderToStaticMarkup(
    createElement(LoadingState, {
      label: "Profil yükleniyor…",
      skeleton: true,
    }),
  );
  assert.match(skeleton, /class="skeleton-grid" aria-hidden="true"/);
  assert.doesNotMatch(skeleton, /%|progressbar|tamamlandı/);
  const success = renderToStaticMarkup(
    createElement(SuccessNotice, {
      message: "<script>unsafe</script>",
      onDismiss: () => {},
    }),
  );
  assert.match(success, /Bildirimi kapat/);
  assert.match(success, /&lt;script&gt;/);
  assert.doesNotMatch(success, /<script>/);
});
