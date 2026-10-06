import type { Metadata } from "next";
import { SessionProvider } from "@/components/session";
import { AppHeader, SessionStatus } from "@/components/shell";
import "./globals.css";
import { LocaleBridge, LocaleFrame, SkipLink, Footer } from "@/i18n/react";
import { AuthGuard } from "@/components/auth-guard";
export const metadata: Metadata = {
  title: "ZeminAI",
  description: "Doğrulanabilir Yetenek ve Akıllı Eşleşme Platformu",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('zeminai.locale')==='en'){document.documentElement.dataset.localePending='true'}}catch{}`,
          }}
        />
      </head>
      <body>
        <LocaleBridge />
        <LocaleFrame>
          <SkipLink />
          <SessionProvider>
            <AppHeader />
            <main id="main" className="container">
              <SessionStatus />
              <AuthGuard>{children}</AuthGuard>
            </main>
            <Footer />
          </SessionProvider>
        </LocaleFrame>
      </body>
    </html>
  );
}
