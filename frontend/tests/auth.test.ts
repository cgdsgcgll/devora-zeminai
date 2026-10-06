import * as i18n from "../src/i18n/index.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authValidation,
  homeFor,
  linksFor,
  routeRole,
} from "../src/lib/auth.ts";
import { api, subscribeUnauthorized } from "../src/lib/api/client.ts";

test("registration accepts passphrases and validates role-specific names", () => {
  assert.equal(
    authValidation("name@example.test", "twelve words are okay", "Candidate"),
    "",
  );
  assert.equal(
    authValidation("org@example.test", "twelve words are okay", "Institution"),
    "",
  );
  assert.ok(authValidation("bad", "twelve words are okay", "Candidate"));
  assert.ok(authValidation("a@b.test", "short", "Candidate"));
  assert.ok(authValidation("a@b.test", "twelve words are okay", " "));
});
test("login validation accepts existing passwords without registration composition rules", () => {
  assert.equal(authValidation("a@b.test", "simple"), "");
  assert.ok(authValidation("a@b.test", ""));
});
test("candidate and institution navigation and protected destinations are distinct", () => {
  assert.deepEqual(
    linksFor("candidate").map((x) => x[0]),
    ["/profil", "/aday", "/kanit-istekleri"],
  );
  assert.deepEqual(
    linksFor("institution").map((x) => x[0]),
    ["/ihtiyac", "/kesif", "/eslesme", "/kanit-istekleri"],
  );
  assert.deepEqual(linksFor(), []);
  assert.equal(homeFor("candidate"), "/profil");
  assert.equal(homeFor("institution"), "/ihtiyac");
  assert.equal(routeRole("/profil"), "candidate");
  assert.equal(routeRole("/kesif"), "institution");
  assert.equal(routeRole("/kayit"), undefined);
});
test("cookie client bootstrap, login, logout and 401 invalidation", async () => {
  const original = globalThis.fetch;
  let invalidated = 0;
  const unsubscribe = subscribeUnauthorized(() => invalidated++);
  const calls: { url: string; options?: RequestInit }[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({
      user: { id: "user", role: "candidate" },
      candidate: null,
    });
  };
  try {
    await api.me();
    await api.login({ email: "a@b.test", password: "passphrase" });
    assert.equal(calls[0].url, "/api/auth/me");
    assert.equal(calls[0].options?.credentials, "include");
    assert.equal(calls[1].options?.method, "POST");
    globalThis.fetch = async () => new Response(null, { status: 204 });
    await api.logout();
    globalThis.fetch = async () =>
      Response.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Login",
            retryable: false,
          },
        },
        { status: 401 },
      );
    await assert.rejects(api.me());
    assert.equal(invalidated, 1);
    await assert.rejects(api.login({ email: "a@b.test", password: "bad" }));
    assert.equal(invalidated, 1);
    unsubscribe();
    await assert.rejects(api.me());
    assert.equal(invalidated, 1);
  } finally {
    globalThis.fetch = original;
    unsubscribe();
  }
});

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as authLogic from "../src/lib/auth.ts";

async function component(
  file: string,
  session: object,
  query = "",
  path = "/profil",
) {
  const source = await readFile(
    new URL("../src/components/" + file, import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const realRequire = createRequire(import.meta.url);
  const redirects: string[] = [];
  const dependencies = (id: string): unknown => {
    if (id === "../i18n/index.ts") return i18n;
    if (id === "../i18n/react")
      return {
        useLocale: () =>
          React.useSyncExternalStore(
            i18n.subscribeLocale,
            i18n.getLocale,
            i18n.getLocale,
          ),
      };
    if (id === "react")
      return { ...React, useEffect: (effect: () => void) => effect() };
    if (id === "next/navigation")
      return {
        useRouter: () => ({
          replace: (target: string) => redirects.push(target),
        }),
        usePathname: () => path,
        useSearchParams: () => new URLSearchParams(query),
      };
    if (id === "next/link")
      return {
        __esModule: true,
        default: ({
          children,
          ...props
        }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
          React.createElement("a", props, children),
      };
    if (id === "./use-entrance-motion")
      return { useEntranceMotion: () => ({ current: null }) };
    if (id === "./session") return { useSession: () => session };
    if (id === "@/lib/auth") return authLogic;
    if (id === "@/lib/api/client") return { api, userError: () => "" };
    if (id === "./feedback")
      return {
        LoadingState: ({ label }: { label: string }) =>
          React.createElement("p", { role: "status" }, label),
      };
    return realRequire(id);
  };
  const compiledModule = {
    exports: {} as Record<string, React.ComponentType<Record<string, unknown>>>,
  };
  new Function("require", "module", "exports", compiled)(
    dependencies,
    compiledModule,
    compiledModule.exports,
  );
  return { exports: compiledModule.exports, redirects };
}
test("actual registration component exposes both roles and the institution form", async () => {
  const a = await component("auth-form.tsx", { ready: true });
  const chooser = renderToStaticMarkup(
    React.createElement(a.exports.AuthForm, { register: true }),
  );
  assert.match(chooser, /Hesap türü/);
  assert.match(chooser, /Ürettiklerimi/);
  assert.match(chooser, /Kurum/);
  const b = await component(
    "auth-form.tsx",
    { ready: true },
    "role=institution",
  );
  const form = renderToStaticMarkup(
    React.createElement(b.exports.AuthForm, { register: true }),
  );
  assert.match(form, /Kurum adı/);
  assert.match(form, /new-password/);
  assert.match(form, /minLength="12"/);
});
test("actual auth form hides anonymous controls during bootstrap", async () => {
  const a = await component("auth-form.tsx", { ready: false });
  const html = renderToStaticMarkup(React.createElement(a.exports.AuthForm));
  assert.match(html, /Hesabınız kontrol ediliyor/);
  assert.doesNotMatch(html, /<form/);
});
test("actual route guard redirects anonymous and wrong-role users without rendering private children", async () => {
  for (const [session, expected] of [
    [{ ready: true }, "/giris"],
    [{ ready: true, user: { role: "institution" } }, "/ihtiyac"],
  ] as const) {
    const a = await component("auth-guard.tsx", session);
    const html = renderToStaticMarkup(
      React.createElement(a.exports.AuthGuard, null, "PRIVATE CONTENT"),
    );
    assert.deepEqual(a.redirects, [expected]);
    assert.doesNotMatch(html, /PRIVATE CONTENT/);
  }
  const b = await component("auth-guard.tsx", {
    ready: true,
    user: { role: "candidate" },
  });
  assert.match(
    renderToStaticMarkup(
      React.createElement(b.exports.AuthGuard, null, "MY PROFILE"),
    ),
    /MY PROFILE/,
  );
});

test("guards hide cached private content during bootstrap and reject candidate institution navigation", async () => {
  for (const session of [
    { ready: false },
    { ready: false, user: { role: "candidate" } },
    { ready: false, user: { role: "institution" } },
    { ready: true, user: { role: "candidate" } },
  ]) {
    const a = await component("auth-guard.tsx", session, "", "/kesif");
    const html = renderToStaticMarkup(
      React.createElement(a.exports.AuthGuard, null, "PRIVATE DISCOVERY"),
    );
    assert.doesNotMatch(html, /PRIVATE DISCOVERY/);
    assert.deepEqual(a.redirects, session.ready ? ["/profil"] : []);
  }
  const allowed = await component(
    "auth-guard.tsx",
    { ready: true, user: { role: "institution" } },
    "",
    "/kesif",
  );
  assert.match(
    renderToStaticMarkup(
      React.createElement(allowed.exports.AuthGuard, null, "OWN DISCOVERY"),
    ),
    /OWN DISCOVERY/,
  );
  assert.deepEqual(allowed.redirects, []);
});

test("auth feedback separates the fading visual copy from immediate accessible errors", async () => {
  const a = await component("auth-form.tsx", { ready: true });
  const html = renderToStaticMarkup(
    React.createElement(a.exports.AuthFeedback, { message: "Parola hatalı." }),
  );
  assert.match(html, /data-visible="true" aria-hidden="true"/);
  assert.match(html, /class="sr-only" role="alert">Parola hatalı\./);
  const empty = renderToStaticMarkup(
    React.createElement(a.exports.AuthFeedback, { message: "" }),
  );
  assert.match(empty, /data-visible="false"/);
  assert.match(empty, /role="alert"><\/span>/);
});
