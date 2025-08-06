"use client";

import * as React from "react";
import { Bot, PanelRightClose, PanelRightOpen, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  open: boolean;
  onToggleOpen: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
};

export default function ChatHeader({ open, onToggleOpen, showSettings, onToggleSettings }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between px-2 py-2 border-b shrink-0">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4" />
        {open && <span className="text-sm font-medium">{t("chat_title")}</span>}
      </div>
      <div className="flex items-center gap-1">
        {open && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onToggleSettings}
            title={showSettings ? "Nascondi impostazioni" : "Mostra impostazioni"}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleOpen}
          title={open ? "Chiudi" : "Apri"}
        >
          {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}