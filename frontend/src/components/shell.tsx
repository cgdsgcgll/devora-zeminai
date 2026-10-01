"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSession } from "./session";

const links = [
  ["/", "Ana sayfa"],
  ["/aday", "Aday & Proje"],
  ["/ihtiyac", "Kurum İhtiyacı"],
  ["/eslesme", "Eşleşme"],
];
export function AppHeader() {
  const path = usePathname();
  const { busy, ready, reset } = useSession();
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
          onClick={() => {
            if (
              window.confirm(
                "Bu tarayıcıdaki demo seçimi temizlensin mi? Backend kayıtları silinmez.",
              )
            )
              reset();
          }}
        >
          Demoyu sıfırla
        </button>
      </div>
    </header>
  );
}
export function SessionStatus() {
  const { ready, busy, error, restore, storageWarning } = useSession();
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <>
      {(!ready || busy) && (
        <div className="loading" role="status">
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
      {links.slice(1).map(([href, label], i) => (
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
