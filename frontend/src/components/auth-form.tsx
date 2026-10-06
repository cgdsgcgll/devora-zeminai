"use client";
import { t, tx } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, userError } from "@/lib/api/client";
import { authValidation, homeFor, type Role } from "@/lib/auth";
import { useSession } from "./session";
import { LoadingState } from "./feedback";
import { useEntranceMotion } from "./use-entrance-motion";
export function AuthForm({ register = false }: { register?: boolean }) {
  useLocale();

  const session = useSession();
  const router = useRouter();
  const [chosenRole, setRole] = useState<Role>();
  const params = useSearchParams();
  const value = params.get("role");
  const role =
    chosenRole ||
    (value === "candidate" || value === "institution" ? value : undefined);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formMotion = useEntranceMotion(
    `${session.ready}:${!!session.user}:${role || "login"}`,
  );
  useEffect(() => {
    if (session.ready && session.user)
      router.replace(homeFor(session.user.role));
  }, [session.ready, session.user, router]);

  if (!session.ready || session.user)
    return <LoadingState label={t("m247")} skeleton />;
  return (
    <section className="auth-page">
      <p className="eyebrow">{t("m248")}</p>
      <h1>{register ? t("m249") : t("m250")}</h1>
      {register && (
        <div
          className="auth-roles category-picker"
          role="group"
          aria-label={t("m251")}
        >
          {(["candidate", "institution"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="auth-role"
              aria-pressed={role === value}
              disabled={busy}
              onClick={() => setRole(value)}
            >
              <strong>{value === "candidate" ? t("m252") : t("m253")}</strong>
              <span>{value === "candidate" ? t("m254") : t("m255")}</span>
            </button>
          ))}
        </div>
      )}
      <div className="auth-form-slot" data-registration={register}>
        <div ref={formMotion}>
          {(!register || role) && (
            <form
              aria-busy={busy}
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const validation = authValidation(
                  email,
                  password,
                  register ? name : undefined,
                );
                if (validation) {
                  setError(validation);
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const state = register
                    ? await api.register({
                        email,
                        password,
                        display_name: name,
                        role: role!,
                      })
                    : await api.login({ email, password });
                  setPassword("");
                  await session.authenticate(state);
                  router.replace(homeFor(state.user.role));
                } catch (e) {
                  setError(userError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {register && (
                <label>
                  {role === "institution" ? t("m256") : t("m257")}
                  <input
                    autoComplete="name"
                    value={name}
                    required
                    maxLength={200}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                {t("m258")}
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                {t("m259")}
                <input
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {register && <p className="small">{t("m260")}</p>}
              <AuthFeedback message={tx(error)} />
              <button className="button" disabled={busy}>
                {busy ? t("m261") : register ? t("m262") : t("m263")}
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="auth-switch">
        {register ? (
          <Link href="/giris">{t("m264")}</Link>
        ) : (
          <Link href="/kayit">{t("m265")}</Link>
        )}
      </p>
    </section>
  );
}

/** Retain only the visual copy during collapse; assistive state updates immediately. */
export function AuthFeedback({ message }: { message: string }) {
  useLocale();

  const [previous, setPrevious] = useState(message);
  if (message && message !== previous) setPrevious(message);
  return (
    <>
      <div
        className="form-feedback"
        data-visible={!!message}
        aria-hidden="true"
      >
        <div>
          <p className="error">{message || previous}</p>
        </div>
      </div>
      <span className="sr-only" role="alert">
        {message}
      </span>
    </>
  );
}
