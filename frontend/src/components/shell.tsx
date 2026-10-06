"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { SuccessNotice } from "./feedback";

import { linksFor } from "@/lib/auth";
export function AppHeader() {
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
        <Link href="/" className="brand" aria-label="ZeminAI ana sayfa">
          Zemin<span>AI</span>
        </Link>
        <button
          className="menu-toggle text-button"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "Menüyü kapat" : "Menü"}{" "}
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
          aria-label="Ana navigasyon"
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
              ? "Giriş yap"
              : user.role === "candidate"
                ? "Deneyim ekle"
                : "Yeni ihtiyaç"}
          </Link>
        )}
      </div>
      {ready && user && (
        <details className="account-tools">
          <summary>
            {user.display_name} · {user.role === "candidate" ? "Aday" : "Kurum"}
          </summary>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => void act("Çıkış yapılıyor…", logout)}
          >
            Çıkış yap
          </button>
        </details>
      )}
    </header>
  );
}
export function SessionStatus() {
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
            <strong>{busy || "Hesabınız yükleniyor…"}</strong>
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
          <strong>İşlem tamamlanamadı</strong>
          <p>{error}</p>
          {error.startsWith("Önceki") && (
            <button className="button secondary" onClick={() => void restore()}>
              Yeniden dene
            </button>
          )}
        </div>
      )}
    </>
  );
}
