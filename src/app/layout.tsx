import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import PWAInstaller from "@/components/PWAInstaller";
import { I18nProvider, useI18n } from "@/components/i18n/I18nProvider";
import LanguageSelect from "@/components/LanguageSelect";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Log Chopper",
  description: "Lettura, filtro e analisi di file .log",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  applicationName: "Log Chopper",
};

function RegisterSW() {
  if (typeof window === "undefined") return null;
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
  return null;
}

function Header() {
  const { t } = useI18n();
  return (
    <header className="w-full border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="w-full px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base sm:text-lg md:text-xl font-semibold flex items-center gap-2 truncate">
            <span role="img" aria-label="tronco">🪵</span>
            <span className="truncate">{t("app_title")}</span>
          </h1>
          <span className="hidden sm:inline text-xs text-muted-foreground">•</span>
          <a
            href="https://github.com/ddallabenetta/log-chopper"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={t("github_title")}
          >
            {t("made_with")}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelect />
          <PWAInstaller />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased h-full min-h-0 flex flex-col`}>
        <I18nProvider>
          <ThemeProvider>
            <RegisterSW />
            <Header />
            <div className="flex-1 min_h-0 flex flex-col">
              {children}
            </div>
            <SonnerToaster />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}