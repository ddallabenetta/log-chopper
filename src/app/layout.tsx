import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full min-h-0 flex flex-col`}
      >
        <ThemeProvider>
          <header className="w-full border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <div className="w-full px-4 py-3 flex items-center justify-between">
              <h1 className="text-base sm:text-lg md:text-xl font-semibold flex items-center gap-2">
                <span role="img" aria-label="tronco">🪵</span>
                Log Chopper
              </h1>
              <ThemeToggle />
            </div>
          </header>
          <div className="flex-1 min-h-0 flex flex-col">
            {children}
          </div>
          <SonnerToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}