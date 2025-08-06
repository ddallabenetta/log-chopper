"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  maxLines: number;
  onChangeMaxLines: (v: number) => void;
  hasLines: boolean;
};

export default function TopBar(_: Props) {
  const { t } = useI18n();

  // Il controllo max righe si sposta in LogControls come 'Righe per pagina'.
  // Manteniamo il componente per eventuali future info/testi.
  return (
    <div className="shrink-0 px-3 pb-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
      <div />
      <div className="flex-1" />
    </div>
  );
}