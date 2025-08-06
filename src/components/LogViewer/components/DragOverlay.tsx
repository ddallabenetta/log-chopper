"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function DragOverlay() {
  const { t } = useI18n();
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/70">
      <div className="rounded-lg border bg-card px-6 py-3 text-sm">
        {t("drop_files_here")}
      </div>
    </div>
  );
}