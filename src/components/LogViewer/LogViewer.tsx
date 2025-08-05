"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import LogControls from "./LogControls";
import LogList from "./LogList";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "./LogTypes";

function detectLevel(text: string): LogLevel {
  const t = text.toUpperCase();
  if (/\bTRACE\b/.test(t)) return "TRACE";
  if (/\bDEBUG\b/.test(t)) return "DEBUG";
  if (/\bINFO\b/.test(t)) return "INFO";
  if (/\bWARN(ING)?\b/.test(t)) return "WARN";
  if (/\bERR(OR)?\b/.test(t)) return "ERROR";
  return "OTHER";
}

async function* streamLines(file: File): AsyncGenerator<string, void, unknown> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let { value, done } = await reader.read();
  let chunk = value ? decoder.decode(value, { stream: true }) : "";
  let buffer = "";
  while (!done) {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      yield line.replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
    }
    ({ value, done } = await reader.read());
    chunk = value ? decoder.decode(value, { stream: true }) : "";
  }
  const tail = decoder.decode();
  if (tail) buffer += tail;
  if (buffer.length > 0) {
    yield buffer.replace(/\r$/, "");
  }
}

type FileIngestStats = {
  fileName: string;
  totalLines: number;
  droppedLines: number;
};

export default function LogViewer() {
  const [files, setFiles] = React.useState<ParsedFile[]>([]);
  const [allLines, setAllLines] = React.useState<LogLine[]>([]);
  const [pinned, setPinned] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<FilterConfig>({
    query: "",
    mode: "text",
    caseSensitive: false,
    level: "ALL",
  });
  const [showOnlyPinned, setShowOnlyPinned] = React.useState(false);

  const [maxLines, setMaxLines] = React.useState<number>(50000);

  const [isDragging, setIsDragging] = React.useState(false);
  const [ingesting, setIngesting] = React.useState(false);
  const [ingestStats, setIngestStats] = React.useState<FileIngestStats[]>([]);

  // Gestione jump-to-id
  const [pendingJumpId, setPendingJumpId] = React.useState<string | null>(null);

  // Lazy buffer per caricamento verso l'alto
  const pendingOlderRef = React.useRef<LogLine[]>([]);

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setIngesting(true);
    const newStats: FileIngestStats[] = [];
    const newParsedFiles: ParsedFile[] = [];
    const newLinesAll: LogLine[] = [];

    for (const f of arr) {
      const fileName = f.name;
      let totalLines = 0;
      let dropped = 0;
      const linesForFile: LogLine[] = [];
      const batch: LogLine[] = [];
      for await (const rawLine of streamLines(f)) {
        totalLines++;
        const lineObj: LogLine = {
          id: `${fileName}:${totalLines}`,
          fileName,
          lineNumber: totalLines,
          content: rawLine,
          level: detectLevel(rawLine),
        };

        linesForFile.push(lineObj);
        batch.push(lineObj);
        newLinesAll.push(lineObj);

        if (newLinesAll.length > maxLines) {
          const removeCount = newLinesAll.length - maxLines;
          dropped += removeCount;
          newLinesAll.splice(0, removeCount);
        }

        // Pubblica a piccoli batch per non bloccare
        if (batch.length >= 2000) {
          const publish = batch.splice(0, batch.length);
          setAllLines((prev) => {
            const merged = [...prev, ...publish];
            if (merged.length > maxLines) {
              merged.splice(0, merged.length - maxLines);
            }
            return merged;
          });
          await new Promise((r) => setTimeout(r));
        }
      }

      // Pubblica eventuale batch residuo
      if (pendingOlderRef.current.length === 0) {
        // Prima importazione: mostriamo la coda (recenti) subito
        setAllLines((prev) => {
          const merged = [...prev, ...batch, ...[]];
          if (merged.length > maxLines) {
            merged.splice(0, merged.length - maxLines);
          }
          return merged;
        });
      } else {
        // Se ci sono già righe, accodiamo il batch residuo
        setAllLines((prev) => {
          const merged = [...prev, ...batch];
          if (merged.length > maxLines) {
            merged.splice(0, merged.length - maxLines);
          }
          return merged;
        });
      }

      // Mettiamo le righe più vecchie nel buffer per lazy load verso l'alto
      pendingOlderRef.current.unshift(...linesForFile); // più vecchie in testa
      newParsedFiles.push({
        fileName,
        lines: linesForFile.slice(-Math.min(linesForFile.length, maxLines)),
        totalLines,
      });

      newStats.push({
        fileName,
        totalLines,
        droppedLines: dropped,
      });
    }

    // Manteniamo solo le più recenti visibili, quelle iniziali restano nel buffer older
    if (pendingOlderRef.current.length > maxLines) {
      pendingOlderRef.current = pendingOlderRef.current.slice(
        Math.max(0, pendingOlderRef.current.length - maxLines - allLines.length)
      );
    }

    setFiles((prev) => [...prev, ...newParsedFiles]);
    setIngestStats((prev) => {
      const map = new Map<string, FileIngestStats>();
      [...prev, ...newStats].forEach((s) => map.set(s.fileName, s));
      return Array.from(map.values());
    });

    setIngesting(false);
    toast.success(`${arr.length} file caricati (stream)`);
  };

  const handleFilesSelected = async (list: FileList) => {
    await addFiles(list);
  };

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAll = () => {
    setFiles([]);
    setAllLines([]);
    setPinned(new Set());
    setFilter({ query: "", mode: "text", caseSensitive: false, level: "ALL" });
    setShowOnlyPinned(false);
    setIngestStats([]);
    pendingOlderRef.current = [];
    toast.message("Pulito");
  };

  const totalCount = allLines.length;

  const visibleCount = React.useMemo(() => {
    if (showOnlyPinned) return Array.from(pinned).length;
    const passesLevel = (lvl: LogLevel) =>
      filter.level === "ALL" ? true : lvl === filter.level;

    if (!filter.query) {
      return allLines.reduce((acc, l) => (passesLevel(l.level) || pinned.has(l.id) ? acc + 1 : acc), 0);
    }

    const flags = filter.caseSensitive ? "" : "i";
    try {
      if (filter.mode === "regex") {
        const re = new RegExp(filter.query, flags);
        return allLines.reduce(
          (acc, l) =>
            ((passesLevel(l.level) && re.test(l.content)) || pinned.has(l.id) ? acc + 1 : acc),
          0
        );
      }
      const needle = filter.caseSensitive ? filter.query : filter.query.toLowerCase();
      return allLines.reduce((acc, l) => {
        const hay = filter.caseSensitive ? l.content : l.content.toLowerCase();
        return ((passesLevel(l.level) && hay.includes(needle)) || pinned.has(l.id)) ? acc + 1 : acc;
      }, 0);
    } catch {
      return Array.from(pinned).length;
    }
  }, [allLines, filter, pinned, showOnlyPinned]);

  // Lazy load verso l'alto quando richiesto da LogList
  const handleLoadMoreTop = () => {
    if (pendingOlderRef.current.length === 0) return;
    const take = 2000;
    const slice = pendingOlderRef.current.splice(
      Math.max(0, pendingOlderRef.current.length - take),
      take
    );
    if (slice.length === 0) return;

    // Inseriamo all'inizio mantenendo le più recenti in coda
    setAllLines((prev) => {
      const merged = [...slice, ...prev];
      if (merged.length > maxLines) {
        merged.splice(0, merged.length - maxLines); // taglia le più vecchie
      }
      return merged;
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await addFiles(files);
    }
  };

  const onChangeMaxLines = (val: number) => {
    const v = Math.max(1000, Math.min(500000, Math.floor(val)));
    setMaxLines(v);
    setAllLines((prev) => {
      if (prev.length > v) {
        return prev.slice(-v);
      }
      return prev;
    });
    toast.message(`Max righe: ${v.toLocaleString()}`);
  };

  const pinnedIds = React.useMemo(() => Array.from(pinned), [pinned]);

  return (
    <Card className="w-full h-[100dvh] max-w-none rounded-none border-0 flex flex-col overflow-hidden">
      <CardHeader className="pb-4 px-4 sm:px-6">
        <CardTitle>Log Viewer</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden px-4 sm:px-6">
        <LogControls
          filter={filter}
          onFilterChange={setFilter}
          pinnedCount={pinned.size}
          visibleCount={visibleCount}
          totalCount={totalCount}
          showOnlyPinned={showOnlyPinned}
          onToggleShowOnlyPinned={() => setShowOnlyPinned((v) => !v)}
          onFilesSelected={handleFilesSelected}
          onClearAll={clearAll}
          pinnedIds={pinnedIds}
          onJumpToId={(id) => setPendingJumpId(id)}
        />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            Max righe
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
          {ingesting && <span>Import in corso…</span>}
          {ingestStats.length > 0 && (
            <span>
              File importati: {ingestStats.length} • Scartate (globali per step): potrebbero essere applicati limiti di memoria
            </span>
          )}
        </div>

        <div
          className={`flex-1 min-h-0 rounded-md border relative overflow-x-hidden ${
            isDragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/70">
              <div className="rounded-lg border bg-card px-6 py-3 text-sm">
                Rilascia i file .log qui
              </div>
            </div>
          )}
          <LogList
            lines={allLines}
            pinned={pinned}
            onTogglePin={togglePin}
            filter={filter}
            showOnlyPinned={showOnlyPinned}
            onLoadMoreTop={handleLoadMoreTop}
            jumpToId={pendingJumpId}
            onAfterJump={() => setPendingJumpId(null)}
          />
        </div>
      </CardContent>
    </Card>
  );
}