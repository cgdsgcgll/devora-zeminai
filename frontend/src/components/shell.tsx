"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { SuccessNotice } from "./feedback";

const links = [
  ["/aday", "Profil oluştur"],
  ["/profil", "Profilim"],
  ["/ihtiyac", "İhtiyaç tanımla"],
  ["/eslesme", "Uyumu incele"],
  ["/kesif", "Aday keşfet"],
];
export function AppHeader() {
  const path = usePathname();
  const { busy, ready, reset } = useSession();
  const [confirmReset, setConfirmReset] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="ZeminAI ana sayfa">
          <span className="brand-mark" aria-hidden="true">
            z
          </span>
          Zemin<span>AI</span>
        </Link>
        <button
          className="menu-toggle text-button"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "Menüyü kapat" : "Menü"}{" "}
          <span aria-hidden="true">☰</span>
        </button>
        <nav
          id="main-navigation"
          className={menuOpen ? "nav-open" : ""}
          aria-label="Ana navigasyon"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setMenuOpen(false);
              document
                .querySelector<HTMLButtonElement>(".menu-toggle")
                ?.focus();
            }
          }}
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
            {busy.includes("analiz") && (
              <p>
                Erişilebilen proje kaynakları inceleniyor. Sonuçlar, kaynaklarla
                desteklenip desteklenmediği kontrol edilerek hazırlanır. Bu
                işlem birkaç dakika sürebilir; sayfayı açık tutabilirsiniz.
              </p>
            )}
            {busy.includes("kriter") && (
              <p>
                Gerekli ve tercih edilen kriterler, yalnızca verdiğiniz ihtiyaç
                metnine dayanarak hazırlanıyor.
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
  if (!["/aday", "/ihtiyac", "/eslesme"].includes(path)) return null;
  return (
    <ol className="steps" aria-label="Demo adımları">
      {[
        ["/aday", "Profil"],
        ["/ihtiyac", "İhtiyaç"],
        ["/eslesme", "Uyum"],
      ].map(([href, label], i) => (
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
