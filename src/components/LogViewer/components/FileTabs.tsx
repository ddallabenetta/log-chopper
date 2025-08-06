"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ALL_TAB_ID } from "../hooks/useLogState";

type Tab = { id: string; label: string; count: number };

type Props = {
  tabs: Tab[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};

export default function FileTabs({ tabs, selected, onSelect, onClose }: Props) {
  return (
    <div className="px-3 pb-2 border-b">
      <div className="flex items-center gap-1 overflow-auto">
        {tabs.map((t) => {
          const active = t.id === selected;
          const isAll = t.id === ALL_TAB_ID;
          return (
            <div key={t.id} className="flex items-center">
              <button
                onClick={() => onSelect(t.id)}
                className={[
                  "px-3 py-1.5 rounded-t-md border-b-2 text-sm whitespace-nowrap",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
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
    </div>
  );
}