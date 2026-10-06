import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
export async function resolveI18n(code: string): Promise<string> {
  const source = await readFile(
    new URL("../src/i18n/react.tsx", import.meta.url),
    "utf8",
  );
  let runtime = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const name of ["react", "react/jsx-runtime"])
    runtime = runtime.replaceAll(
      JSON.stringify(name),
      JSON.stringify(pathToFileURL(require.resolve(name)).href),
    );
  runtime = runtime.replaceAll(
    '"./index"',
    JSON.stringify(new URL("../src/i18n/index.ts", import.meta.url).href),
  );
  const url = `data:text/javascript;base64,${Buffer.from(runtime).toString("base64")}`;
  return code
    .replaceAll(
      '"../i18n/index.ts"',
      JSON.stringify(new URL("../src/i18n/index.ts", import.meta.url).href),
    )
    .replaceAll('"../i18n/react"', JSON.stringify(url));
}
