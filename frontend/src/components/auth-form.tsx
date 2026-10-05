"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, userError } from "@/lib/api/client";
import { authValidation, homeFor, type Role } from "@/lib/auth";
import { useSession } from "./session";
import { LoadingState } from "./feedback";
import { useEntranceMotion } from "./use-entrance-motion";
export function AuthForm({ register = false }: { register?: boolean }) {
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
    return <LoadingState label="Hesabınız kontrol ediliyor…" skeleton />;
  return (
    <section className="auth-page">
      <p className="eyebrow">ZEMİNAI HESABINIZ</p>
      <h1>
        {register ? "ZeminAI’yi nasıl kullanacaksınız?" : "Tekrar hoş geldiniz"}
      </h1>
      {register && (
        <div
          className="auth-roles category-picker"
          role="group"
          aria-label="Hesap türü"
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
              <strong>{value === "candidate" ? "Aday" : "Kurum"}</strong>
              <span>
                {value === "candidate"
                  ? "Ürettiklerimi ve gelişimimi görünür kılmak istiyorum."
                  : "İhtiyacıma uygun kanıtları olan adayları keşfetmek istiyorum."}
              </span>
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
                  {role === "institution" ? "Kurum adı" : "Adınız"}
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
                E-posta
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
                Parola
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
              {register && (
                <p className="small">
                  12–128 karakter. Uzun bir parola cümlesi kullanabilirsiniz.
                </p>
              )}
              <AuthFeedback message={error} />
              <button className="button" disabled={busy}>
                {busy
                  ? "İşlem sürüyor…"
                  : register
                    ? "Hesap oluştur"
                    : "Giriş yap"}
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="auth-switch">
        {register ? (
          <Link href="/giris">Hesabınız var mı? Giriş yapın</Link>
        ) : (
          <Link href="/kayit">Hesabınız yok mu? Kayıt olun</Link>
        )}
      </p>
    </section>
  );
}

/** Retain only the visual copy during collapse; assistive state updates immediately. */
export function AuthFeedback({ message }: { message: string }) {
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
