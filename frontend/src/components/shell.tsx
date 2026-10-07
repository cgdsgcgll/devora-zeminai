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
  const accountRef = useRef<HTMLDetailsElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    header
      ?.querySelectorAll("details[open]")
      .forEach((node) => node.removeAttribute("open"));
    const dismiss = (event: PointerEvent) => {
      header?.querySelectorAll("details[open]").forEach((node) => {
        if (!node.contains(event.target as Node)) node.removeAttribute("open");
      });
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [path]);
  return (
    <header
      className="app-header"
      ref={headerRef}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (accountRef.current?.open) {
            accountRef.current.open = false;
            accountRef.current.querySelector("summary")?.focus();
            return;
          }
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
        <LanguageSwitch />
        {ready && user && (
          <details className="account-tools" ref={accountRef}>
            <summary>
              <span>
                {user.display_name?.trim().split(/\s+/)[0] ||
                  (user.role === "candidate" ? t("m252") : t("m253"))}
              </span>
              <svg
                className="utility-chevron"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                aria-hidden="true"
              >
                <path d="m3 4.5 3 3 3-3" />
              </svg>
            </summary>
            <div className="utility-panel account-panel">
              <div className="account-identity">
                <strong>
                  {user.display_name ||
                    (user.role === "candidate" ? t("m252") : t("m253"))}
                </strong>
                <span>{user.role === "candidate" ? t("m252") : t("m253")}</span>
              </div>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => void act(t("m404"), logout)}
              >
                {t("m405")}
              </button>
            </div>
          </details>
        )}
      </div>
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
