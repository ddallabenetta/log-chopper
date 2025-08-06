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
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = React.useState(false);
  const [showSticky, setShowSticky] = React.useState(false);

  const updateSticky = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setOverflow(false);
      setShowSticky(false);
      return;
    }
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setOverflow(hasOverflow);
    if (!hasOverflow) {
      setShowSticky(false);
      return;
    }
    const nearRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 20;
    setShowSticky(nearRight);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateSticky();
    const onScroll = () => updateSticky();
    const onResize = () => updateSticky();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [updateSticky]);

  React.useEffect(() => {
    const id = requestAnimationFrame(updateSticky);
    return () => cancelAnimationFrame(id);
  }, [tabs.length, updateSticky]);

  return (
    <div className="px-3 pt-2 pb-2 border-b bg-card/50">
      <div className="relative">
        {/* Area scrollabile delle tab con padding a destra solo se esiste sticky */}
        <div
          ref={scrollRef}
          className={`flex items-center gap-2 overflow-x-auto ${overflow ? "pr-24" : ""}`}
        >
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

            {/* Pulsante inline: visibile quando non c’è overflow, oppure c’è overflow ma non siamo a fine destra */}
            {onNewTab && (!overflow || (overflow && !showSticky)) && (
              <div className="pl-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={onNewTab}
                  title="Nuova tab"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Nuovo</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Sticky a destra: solo se overflow e utente è vicino al bordo destro */}
        {onNewTab && overflow && showSticky && (
          <div className="pointer-events-none absolute right-0 top-0 h-full w-28 flex items-center justify-end bg-gradient-to-l from-card via-card/70 to-transparent">
            <div className="pointer-events-auto pr-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1"
                onClick={onNewTab}
                title="Nuova tab"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Nuovo</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}