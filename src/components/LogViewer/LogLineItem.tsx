"use client";

import * as React from "react";
import { Pin, PinOff, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LogLine } from "./LogTypes";
import LogLineDetailDialog from "./LogLineDetailDialog";

type Props = {
  line: LogLine;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  highlightRanges: Array<{ start: number; end: number }>;
};

function levelDotClass(level: LogLine["level"]) {
  switch (level) {
    case "ERROR":
      return "bg-red-500";
    case "WARN":
      return "bg-yellow-500";
    case "INFO":
      return "bg-blue-500";
    case "DEBUG":
      return "bg-emerald-500";
    case "TRACE":
      return "bg-purple-500";
    default:
      return "bg-gray-400";
  }
}

export default function LogLineItem({
  line,
  isPinned,
  onTogglePin,
  highlightRanges,
}: Props) {
  const [detailOpen, setDetailOpen] = React.useState(false);

  const renderHighlighted = (text: string) => {
    if (highlightRanges.length === 0) return <span>{text}</span>;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    highlightRanges.forEach(({ start, end }, idx) => {
      if (start > lastIndex) {
        parts.push(<span key={`t-${idx}-${lastIndex}`}>{text.slice(lastIndex, start)}</span>);
      }
      parts.push(
        <span
          key={`h-${idx}-${start}`}
          className="bg-yellow-200 dark:bg-yellow-600/40 rounded-sm"
        >
          {text.slice(start, end)}
        </span>
      );
      lastIndex = end;
    });
    if (lastIndex < text.length) {
      parts.push(<span key={`t-end-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }
    return parts;
  };

  return (
    <>
      <div className="px-3 py-1.5">
        <div className="flex items-start gap-1.5">
          {/* Meta */}
          <div className="shrink-0 basis-32 max-w-[45%] text-xs text-muted-foreground tabular-nums font-mono overflow-hidden text-ellipsis">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${levelDotClass(line.level)}`} aria-hidden />
              <span className="text-foreground/80">#{line.lineNumber}</span>
            </div>
          </div>

          {/* Contenuto sempre visibile (multilinea) */}
          <div
            className="flex-1 min-w-0 text-sm whitespace-pre-wrap break-words"
            aria-label={`log-${line.id}`}
          >
            {renderHighlighted(line.content)}
          </div>

          {/* Azioni */}
          <div className="shrink-0 flex items-center gap-1">
            <Button
              size="icon"
              variant={isPinned ? "default" : "ghost"}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(line.id);
              }}
              title={isPinned ? "Rimuovi pin" : "Pin riga"}
            >
              {isPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              title="Dettaglio riga"
              onClick={(e) => {
                e.stopPropagation();
                setDetailOpen(true);
              }}
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <LogLineDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        line={detailOpen ? line : null}
      />
    </>
  );
}