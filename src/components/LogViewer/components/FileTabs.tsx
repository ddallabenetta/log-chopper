"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ALL_TAB_ID } from "../hooks/useLogState";
import { Plus, X } from "lucide-react";

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
  const [hoveringCloseFor, setHoveringCloseFor] = React.useState<string | null>(null);

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
        <div
          ref={scrollRef}
          className={`flex items-center gap-2 overflow-x-auto ${overflow ? "pr-24" : ""}`}
        >
          <div className="flex items-center gap-1">
            {tabs.map((t) => {
              const active = t.id === selected;
              const isAll = t.id === ALL_TAB_ID;
              const isHoverClosing = hoveringCloseFor === t.id;

              return (
                <div
                  key={t.id}
                  className={[
                    "group flex items-center rounded-t-md",
                    isHoverClosing ? "bg-accent/40" : active ? "bg-background" : ""
                  ].join(" ")}
                >
                  <button
                    onClick={() => onSelect(t.id)}
                    className={[
                      "px-3 py-1.5 rounded-t-md border-b-2 text-sm whitespace-nowrap transition-colors",
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    ].join(" ")}
                    title={t.label}
                  >
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({t.count})</span>
                  </button>

                  {!isAll && (
                    <Button
                      // Tab attiva: alta visibilità
                      variant={active ? "destructive" : "outline"}
                      size="icon"
                      className={[
                        "ml-1 h-7 w-7 rounded-b-none rounded-md transition-colors",
                        active
                          ? "hover:opacity-90"
                          : "hover:bg-accent"
                      ].join(" ")}
                      title={`Chiudi: ${t.label}`}
                      onMouseEnter={() => setHoveringCloseFor(t.id)}
                      onMouseLeave={() => setHoveringCloseFor((cur) => (cur === t.id ? null : cur))}
                      onClick={() => onClose(t.id)}
                    >
                      <X className={`h-3.5 w-3.5 ${active ? "text-white" : ""}`} />
                    </Button>
                  )}
                </div>
              );
            })}

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