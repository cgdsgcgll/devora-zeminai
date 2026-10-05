import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { motionMilliseconds } from "../src/lib/content-motion.ts";

test("form entrances keep the same node, cancel on replacement and honor reduced motion", async () => {
  const source = await readFile(
    new URL("../src/components/use-entrance-motion.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const animations: { cancelled: boolean; duration: number }[] = [];
  const listeners = new Set<() => void>();
  const preference = {
    matches: false,
    addEventListener: (_: string, f: () => void) => listeners.add(f),
    removeEventListener: (_: string, f: () => void) => listeners.delete(f),
  };
  const node = {
    animate: (_: unknown, options: { duration: number }) => {
      const record = { cancelled: false, duration: options.duration };
      animations.push(record);
      return {
        cancel: () => {
          record.cancelled = true;
        },
      };
    },
  };
  const ref = { current: node };
  let cleanup: (() => void) | undefined;
  const dependencies = (name: string) =>
    name === "react"
      ? {
          useRef: () => ref,
          useLayoutEffect: (effect: () => (() => void) | undefined) => {
            cleanup?.();
            cleanup = effect();
          },
        }
      : { motionMilliseconds };
  const mod = {
    exports: {} as { useEntranceMotion: (key: string) => typeof ref },
  };
  new Function(
    "require",
    "module",
    "exports",
    "window",
    "getComputedStyle",
    compiled,
  )(dependencies, mod, mod.exports, { matchMedia: () => preference }, () => ({
    getPropertyValue: (name: string) =>
      name === "--duration-normal" ? ".26s" : "ease-out",
  }));
  assert.equal(mod.exports.useEntranceMotion("candidate"), ref);
  assert.equal(animations[0].duration, 260);
  assert.equal(mod.exports.useEntranceMotion("institution"), ref);
  assert.equal(animations[0].cancelled, true);
  assert.equal(animations[1].cancelled, false);
  assert.equal(listeners.size, 1);
  preference.matches = true;
  listeners.forEach((f) => f());
  assert.equal(animations[1].cancelled, true);
  mod.exports.useEntranceMotion("candidate");
  assert.equal(animations.length, 2);
  assert.equal(listeners.size, 0);
  cleanup?.();
});
