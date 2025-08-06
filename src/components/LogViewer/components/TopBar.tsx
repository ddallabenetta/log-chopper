"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  maxLines: number;
  onChangeMaxLines: (v: number) => void;
  hasLines: boolean;
};

export default function TopBar({ maxLines, onChangeMaxLines }: Props) {
  const { t } = useI18n();

  return (
    <div className="shrink-0 px-3 pb-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
      <label className="flex items-center gap-2">
        {t("max_lines")}
        <Input
          type="number"
          min={1000}
          max={500000}
          step={1000}
          value={maxLines}
          onChange={(e) => onChangeMaxLines(Number(e.target.value))}
          className="h-8 w-28"
        />
      </label>
      <div className="flex-1" />
    </div>
  );
}