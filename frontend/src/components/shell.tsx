"use client";
import { LanguageSwitch } from "../i18n/react";
import { t, tx } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { SuccessNotice } from "./feedback";

import { linksFor } from "@/lib/auth";
export function AppHeader() {
  useLocale();

  const path = usePathname();
  const { busy, ready, user, logout, act } = useSession();
  const links = linksFor(user?.role);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header
      className="app-header"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setMenuOpen(false);
          document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
        }
      }}
    >
      <div className="header-inner">
        <Link href="/" className="brand" aria-label={t("brandHome")}>
          {t("m399")}
          <span>{t("m400")}</span>
        </Link>
        <button
          className="menu-toggle text-button"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? t("m401") : t("m402")}{" "}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <nav
          id="main-navigation"
          className={menuOpen ? "nav-open" : ""}
          aria-label={t("mainNavigation")}
        >
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <LanguageSwitch />
        {ready && (
          <Link
            className="button header-cta"
            onClick={() => setMenuOpen(false)}
            href={
              !user
                ? "/giris"
                : user.role === "candidate"
                  ? "/aday#experiences"
                  : "/ihtiyac"
            }
          >
            {!user
              ? t("m263")
              : user.role === "candidate"
                ? t("addExperience")
                : t("m403")}
          </Link>
        )}
      </div>
      {ready && user && (
        <details className="account-tools">
          <summary>
            {user.display_name} ·{" "}
            {user.role === "candidate" ? t("m252") : t("m253")}
          </summary>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => void act(t("m404"), logout)}
          >
            {t("m405")}
          </button>
        </details>
      )}
    </header>
  );
}
export function SessionStatus() {
  useLocale();

  const { ready, busy, error, restore, success, dismissSuccess } = useSession();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <>
      {(!ready || busy) && (
        <div
          className="loading operation-status"
          role="status"
          aria-live="polite"
        >
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>{tx(busy) || t("m406")}</strong>
          </div>
        </div>
      )}
      {success && !busy && !error && (
        <div className="feedback-dock">
          <SuccessNotice message={success} onDismiss={dismissSuccess} />
        </div>
      )}
      {error && (
        <div className="error" role="alert" ref={errorRef} tabIndex={-1}>
          <strong>{t("m407")}</strong>
          <p>{tx(error)}</p>
          {error.startsWith(t("m114")) && (
            <button className="button secondary" onClick={() => void restore()}>
              {t("m051")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
