"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { SuccessNotice } from "./feedback";

const links = [
  ["/", "Ana sayfa"],
  ["/aday", "Aday & Profil"],
  ["/ihtiyac", "Kurum İhtiyacı"],
  ["/eslesme", "Eşleşme"],
  ["/profil", "Yaşayan Profil"],
  ["/kesif", "Aday Keşfi"],
];
export function AppHeader() {
  const path = usePathname();
  const { busy, ready, reset } = useSession();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            z
          </span>
          Zemin<span>AI</span>
        </Link>
        <nav aria-label="Ana navigasyon">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button
          className="text-button reset"
          disabled={!!busy || !ready}
          onClick={() => setConfirmReset(true)}
        >
          Demoyu sıfırla
        </button>
      </div>
      {confirmReset && (
        <div
          className="reset-confirm callout"
          role="region"
          aria-label="Demo sıfırlama onayı"
        >
          <p>
            Bu tarayıcıdaki demo seçimi temizlensin mi? Backend kayıtları
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
            {busy.includes("analiz") && (
              <p>
                Proje analizi sürüyor. Bu işlem birkaç dakika sürebilir. Sayfayı
                yenilemeden bekleyin.
              </p>
            )}
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
export function Steps() {
  const path = usePathname();
  const { data } = useSession();
  if (path === "/") return null;
  return (
    <ol className="steps" aria-label="Demo adımları">
      {links.slice(1, 4).map(([href, label], i) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={path === href ? "step" : undefined}
            data-complete={Boolean(
              (i === 0 && data.run) ||
              (i === 1 && data.need) ||
              (i === 2 && data.match),
            )}
          >
            <span>
              {(i === 0 && data.run) ||
              (i === 1 && data.need) ||
              (i === 2 && data.match)
                ? "✓"
                : `0${i + 1}`}
            </span>
            {label}
          </Link>
        </li>
      ))}
    </ol>
  );
}
