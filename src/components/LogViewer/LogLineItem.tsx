"use client";

import * as React from "react";
import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LogLine } from "./LogTypes";

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
    <div className="flex items-start gap-3 px-3 py-1.5 hover:bg-accent/50 rounded">
      <div
        className="shrink-0 basis-56 max-w-[50%] text-xs text-muted-foreground tabular-nums font-mono overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2"
        title={`${line.fileName}:${line.lineNumber}`}
      >
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${levelDotClass(line.level)}`} aria-hidden />
        <span className="text-foreground/80">{line.lineNumber}</span>
        <span className="text-muted-foreground">•</span>
        <span className="truncate">{line.fileName}:{line.lineNumber}</span>
      </div>

      <div className="flex-1 min-w-0 text-sm whitespace-pre-wrap break-words" aria-label={`log-${line.id}`}>
        {renderHighlighted(line.content)}
      </div>

      <div className="shrink-0">
        <Button
          size="icon"
          variant={isPinned ? "default" : "ghost"}
          onClick={() => onTogglePin(line.id)}
          title={isPinned ? "Rimuovi pin" : "Pin riga"}
        >
          {isPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}