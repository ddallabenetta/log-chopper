"use client";

import * as React from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import PWAInstaller from "@/components/PWAInstaller";
import LanguageSelect from "@/components/LanguageSelect";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function Header() {
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
            Made with 🤖 by @ddallabenetta
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