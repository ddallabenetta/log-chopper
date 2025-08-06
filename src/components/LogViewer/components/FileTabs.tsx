"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ALL_TAB_ID } from "../hooks/useLogState";
import { Plus } from "lucide-react";

export type Tab = { id: string; label: string; count: number };

type Props = {
  tabs: Tab[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab?: () => void;
};

export default function FileTabs({ tabs, selected, onSelect, onClose, onNewTab }: Props) {
  return (
    <div className="px-3 pt-2 pb-2 border-b bg-card/50">
      <div className="flex items-center gap-2 overflow-auto">
        <div className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = t.id === selected;
            const isAll = t.id === ALL_TAB_ID;
            return (
              <div key={t.id} className="flex items-center">
                <button
                  onClick={() => onSelect(t.id)}
                  className={[
                    "px-3 py-1.5 rounded-t-md border-b-2 text-sm whitespace-nowrap",
                    active
                      ? "border-primary text-foreground bg-background"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  ].join(" ")}
                  title={t.label}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({t.count})</span>
                </button>
                {!isAll && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-1 px-1.5 h-7 text-xs rounded-b-none rounded-md"
                    title={`Chiudi ${t.label}`}
                    onClick={() => onClose(t.id)}
                  >
                    ×
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {onNewTab && (
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7"
            onClick={onNewTab}
            title="Nuova tab"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}