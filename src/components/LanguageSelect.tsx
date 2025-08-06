"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LanguageSelect() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <div className="inline-flex rounded-md border p-0.5">
        <Button
          size="sm"
          variant={locale === "it" ? "default" : "ghost"}
          onClick={() => setLocale("it")}
          className="h-8 px-3"
          title="Italiano"
        >
          IT
        </Button>
        <Button
          size="sm"
          variant={locale === "en" ? "default" : "ghost"}
          onClick={() => setLocale("en")}
          className="h-8 px-3"
          title="English"
        >
          EN
        </Button>
      </div>
    </div>
  );
}