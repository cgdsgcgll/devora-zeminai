"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { SuccessNotice } from "./feedback";

const links = [
  ["/profil", "Profil"],
  ["/ihtiyac", "İhtiyaç"],
  ["/kesif", "Keşif"],
];
export function AppHeader() {
  const path = usePathname();
  const { busy, ready, reset, data } = useSession();
  const [confirmReset, setConfirmReset] = useState(false);
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
              aria-current={
                path === href || (href === "/profil" && path === "/aday")
                  ? "page"
                  : undefined
              }
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link
          className="button header-cta"
          onClick={() => setMenuOpen(false)}
          href={
            path === "/ihtiyac" || path === "/kesif"
              ? "/eslesme"
              : data.candidate
                ? "/aday#experiences"
                : "/aday"
          }
        >
          {path === "/ihtiyac" || path === "/kesif"
            ? "Uyumu incele"
            : data.candidate
              ? "Deneyim ekle"
              : "Başlayın"}
        </Link>
      </div>
      <details className="demo-tools">
        <summary>Demo oturumu</summary>
        <button
          className="text-button"
          disabled={!!busy || !ready}
          onClick={() => setConfirmReset(true)}
        >
          Demoyu sıfırla
        </button>
      </details>
      {confirmReset && (
        <div
          className="reset-confirm callout"
          role="region"
          aria-label="Demo sıfırlama onayı"
        >
          <p>
            Bu tarayıcıdaki demo seçimi temizlensin mi? Kaydedilmiş veriler
            silinmez.
          </p>
          <div className="profile-actions">
            <button
              className="button"
              disabled={!!busy || !ready}
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Sıfırlamayı Onayla
            </button>
            <button
              className="button secondary"
              onClick={() => setConfirmReset(false)}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
export function SessionStatus() {
  const {
    ready,
    busy,
    error,
    restore,
    storageWarning,
    success,
    dismissSuccess,
  } = useSession();
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
            <strong>{busy || "Demo yükleniyor…"}</strong>
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
              Demoyu yeniden yükle
            </button>
          )}
        </div>
      )}
      {storageWarning && (
        <p className="callout">
          Tarayıcı depolamasına erişilemedi. Sayfa yenilenirse demo seçimi
          korunamayabilir.
        </p>
      )}
    </>
  );
}
