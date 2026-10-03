import type { Metadata } from "next";
import { SessionProvider } from "@/components/session";
import { AppHeader, SessionStatus } from "@/components/shell";
import "./globals.css";
import { AuthGuard } from "@/components/auth-guard";
export const metadata: Metadata = {
  title: "ZeminAI",
  description: "Doğrulanabilir Yetenek ve Akıllı Eşleşme Platformu",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <a href="#main" className="skip">
          İçeriğe geç
        </a>
        <SessionProvider>
          <AppHeader />
          <main id="main" className="container">
            <SessionStatus />
            <AuthGuard>{children}</AuthGuard>
          </main>
          <footer className="footer">
            <span>
              ZeminAI <span aria-hidden="true">/</span> Projeden kanıta,
              kanıttan uyuma.
            </span>
            <span>Kanıt gücü, beceri seviyesi değildir.</span>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
