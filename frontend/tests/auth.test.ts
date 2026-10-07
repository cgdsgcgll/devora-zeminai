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
        LanguageSwitch: () =>
          React.createElement(
            "div",
            { className: "language-switch" },
            "TR / EN",
          ),
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

test("authenticated account stays inside header-inner for both roles", async () => {
  for (const role of ["candidate", "institution"]) {
    const a = await component("shell.tsx", {
      ready: true,
      user: { role, display_name: "Demo User" },
    });
    const html = renderToStaticMarkup(React.createElement(a.exports.AppHeader));
    assert.match(
      html,
      /class="header-inner">[\s\S]*<details class="account-tools">/,
    );
    assert.match(html, /<\/details><\/div><\/header>$/);
    assert.match(html, /<summary><span>Demo<\/span><svg/);
    assert.doesNotMatch(html, /Demo User ·/);
    assert.match(
      html,
      /class="account-identity"><strong>Demo User<\/strong><span>/,
    );
    assert.match(html, /class="utility-chevron"/);
    assert.match(html, /Çıkış yap/);
  }
  const anonymous = await component("shell.tsx", { ready: true });
  assert.doesNotMatch(
    renderToStaticMarkup(React.createElement(anonymous.exports.AppHeader)),
    /account-tools/,
  );
});

test("header retains busy-aware session logout and Escape returns focus to summary", async () => {
  const source = await readFile(
    new URL("../src/components/shell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /disabled=\{!!busy\}/);
  assert.match(source, /onClick=\{\(\) => void act\(t\("m404"\), logout\)\}/);
  assert.match(source, /accountRef.current.open = false/);
  assert.match(source, /querySelector\("summary"\)\?\.focus\(\)/);
});

test("story grid has three desktop columns, one mobile column and popup is out of flow", async () => {
  const css = await readFile(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.evidence-story\s*\{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)\s*\{\s*\.evidence-story\s*\{\s*grid-template-columns: 1fr/,
  );
  assert.match(css, /\.utility-panel\s*\{\s*position: absolute/);
});

test("header and landing visible punctuation is not mojibake", async () => {
  for (const file of [
    "components/shell.tsx",
    "app/page.tsx",
    "i18n/tr.ts",
    "i18n/en.ts",
  ]) {
    const source = await readFile(
      new URL("../src/" + file, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /Â·|â†’|â€|Ã¼|Ã¶/);
  }
});

test("header utility presentation keeps marker-free triggers, quiet hover and reduced motion", async () => {
  const css = await readFile(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /summary::marker[\s\S]*content: ""/);
  assert.match(css, /summary::-webkit-details-marker[\s\S]*display: none/);
  assert.match(css, /summary:hover[\s\S]*background: transparent/);
  assert.match(
    css,
    /\[open\] > summary \.utility-chevron\s*\{\s*transform: rotate\(180deg\)/,
  );
  assert.match(css, /@keyframes utility-reveal/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.utility-chevron/,
  );
  assert.match(css, /content-visibility 200ms allow-discrete/);
});
