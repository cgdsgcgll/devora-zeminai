import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { actionSuccess } from "../src/lib/presentation.ts";

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
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const loading = renderToStaticMarkup(
    createElement(LoadingState, { label: "Profil yükleniyor…" }),
  );
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(loading, /tamamlandı/);
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
