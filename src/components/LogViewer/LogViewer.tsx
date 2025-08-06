"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LogControls from "./LogControls";
import LogList from "./LogList";
import ChatSidebar from "./ChatSidebar";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "./LogTypes";
import { idbLoadState, idbSaveState, idbUpdatePinned } from "@/lib/idb";

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

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

const ALL_TAB_ID = "__ALL__";

export default function LogViewer() {
  const [files, setFiles] = React.useState<ParsedFile[]>([]);
  const [allLines, setAllLines] = React.useState<LogLine[]>([]);
  // pin per-file: mappa fileName -> Set di id
  const [pinnedByFile, setPinnedByFile] = React.useState<Map<string, Set<string>>>(new Map());
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
  const [isRestoring, setIsRestoring] = React.useState(false);

  const [pendingJumpId, setPendingJumpId] = React.useState<string | null>(null);
  const pendingOlderRef = React.useRef<LogLine[]>([]);

  // tab selezionata
  const [selectedTab, setSelectedTab] = React.useState<string>(ALL_TAB_ID);

  React.useEffect(() => {
    (async () => {
      setIsRestoring(true);
      const saved = await idbLoadState();
      if (saved) {
        const restoredLines: LogLine[] = saved.allLines.map((l) => ({
          id: l.id,
          fileName: l.fileName,
          lineNumber: l.lineNumber,
          content: l.content,
          level: (l.level as LogLevel) || "OTHER",
        }));

        restoredLines.sort((a, b) => {
          if (a.fileName === b.fileName) return a.lineNumber - b.lineNumber;
          return a.fileName.localeCompare(b.fileName);
        });

        const uniqueRestored = dedupeById(restoredLines);
        setAllLines(uniqueRestored);

        const byFile = new Map<string, LogLine[]>();
        for (const l of uniqueRestored) {
          const arr = byFile.get(l.fileName);
          if (arr) arr.push(l);
          else byFile.set(l.fileName, [l]);
        }
        const restoredFiles: ParsedFile[] = Array.from(byFile.entries()).map(([fileName, lines]) => ({
          fileName,
          lines,
          totalLines: lines.length,
        }));
        setFiles(restoredFiles);

        // Ricostruisce pin unici e li associa al file corrispondente
        const nextPinned = new Map<string, Set<string>>();
        for (const id of saved.pinnedIds) {
          const line = uniqueRestored.find((l) => l.id === id);
          if (!line) continue;
          const set = nextPinned.get(line.fileName) ?? new Set<string>();
          set.add(id);
          nextPinned.set(line.fileName, set);
        }
        setPinnedByFile(nextPinned);

        setMaxLines(saved.maxLines || 50000);

        pendingOlderRef.current = uniqueRestored.slice();

        toast.message(`Log ripristinati (${uniqueRestored.length.toLocaleString()} righe)`);
      }
      setIsRestoring(false);
    })();
  }, []);

  const persistAll = React.useCallback(async () => {
    const allLinesIdb = allLines.map((l) => ({
      id: l.id,
      fileName: l.fileName,
      lineNumber: l.lineNumber,
      content: l.content,
      level: l.level,
    }));
    // flat dei pin
    const pinnedIds = Array.from(pinnedByFile.values()).flatMap((s) => Array.from(s));
    const metaFiles = files.map((f) => ({ fileName: f.fileName, totalLines: f.totalLines }));
    await idbSaveState({
      allLines: allLinesIdb,
      pinnedIds,
      files: metaFiles,
      maxLines,
    });
  }, [allLines, pinnedByFile, files, maxLines]);

  const addFiles = async (list: FileList | File[]) => {
    clearAll(false);

    const arr = Array.from(list);
    if (arr.length === 0) return;
    setIngesting(true);
    const newStats: FileIngestStats[] = [];
    const newParsedFiles: ParsedFile[] = [];
    const newLinesAll: LogLine[] = [];

    // reset pin per nuovi file
    setPinnedByFile(new Map());

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

        if (batch.length >= 2000) {
          const publish = batch.splice(0, batch.length);
          setAllLines((prev) => {
            const merged = dedupeById([...prev, ...publish]);
            if (merged.length > maxLines) {
              return merged.slice(-maxLines);
            }
            return merged;
          });
          await new Promise((r) => setTimeout(r));
        }
      }

      setAllLines((prev) => {
        const merged = dedupeById([...prev, ...batch]);
        if (merged.length > maxLines) {
          return merged.slice(-maxLines);
        }
        return merged;
      });

      pendingOlderRef.current = [...linesForFile];
      newParsedFiles.push({
        fileName,
        lines: linesForFile,
        totalLines,
      });

      newStats.push({
        fileName,
        totalLines,
        droppedLines: dropped,
      });
    }

    setFiles(newParsedFiles);
    setIngestStats(newStats);
    // seleziona la prima tab file, ma manteniamo anche la tab "Tutti"
    setSelectedTab(ALL_TAB_ID);

    setIngesting(false);
    toast.success(`${arr.length} file caricati (stream)`);

    queueMicrotask(() => {
      scrollListToBottom();
      persistAll();
    });
  };

  const handleFilesSelected = async (list: FileList) => {
    await addFiles(list);
  };

  const togglePin = (id: string) => {
    const target = allLines.find((l) => l.id === id);
    if (!target) return;
    setPinnedByFile((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(target.fileName) ?? new Set<string>());
      if (set.has(id)) set.delete(id);
      else set.add(id);
      next.set(target.fileName, set);
      // salva piatto in idb anche come lista unica
      const flat = Array.from(next.values()).flatMap((s) => Array.from(s));
      idbUpdatePinned(flat);
      return next;
    });
  };

  const clearAll = (showToast = true) => {
    setFiles([]);
    setAllLines([]);
    setPinnedByFile(new Map());
    setFilter({ query: "", mode: "text", caseSensitive: false, level: "ALL" });
    setShowOnlyPinned(false);
    setIngestStats([]);
    setSelectedTab(ALL_TAB_ID);
    pendingOlderRef.current = [];
    if (showToast) toast.message("Pulito");
    import("@/lib/idb").then((m) => m.idbClearAll());
  };

  // Filtra righe in base alla tab selezionata
  const currentLines = React.useMemo<LogLine[]>(() => {
    if (selectedTab === ALL_TAB_ID) return allLines;
    return allLines.filter((l) => l.fileName === selectedTab);
  }, [selectedTab, allLines]);

  // Set dei pin corrente
  const currentPinnedSet = React.useMemo<Set<string>>(() => {
    if (selectedTab === ALL_TAB_ID) {
      // in vista tutti, consideriamo pin di tutti i file
      const s = new Set<string>();
      for (const set of pinnedByFile.values()) for (const id of set) s.add(id);
      return s;
    }
    return pinnedByFile.get(selectedTab) ?? new Set<string>();
  }, [pinnedByFile, selectedTab]);

  const totalCount = currentLines.length;

  const visibleCount = React.useMemo(() => {
    const pinned = currentPinnedSet;
    if (showOnlyPinned) return Array.from(pinned).length;
    const passesLevel = (lvl: LogLevel) =>
      filter.level === "ALL" ? true : lvl === filter.level;

    if (!filter.query) {
      return currentLines.reduce((acc, l) => (passesLevel(l.level) || pinned.has(l.id) ? acc + 1 : acc), 0);
    }

    const flags = filter.caseSensitive ? "" : "i";
    try {
      if (filter.mode === "regex") {
        const re = new RegExp(filter.query, flags);
        return currentLines.reduce(
          (acc, l) =>
            ((passesLevel(l.level) && re.test(l.content)) || pinned.has(l.id) ? acc + 1 : acc),
          0
        );
      }
      const needle = filter.caseSensitive ? filter.query : filter.query.toLowerCase();
      return currentLines.reduce((acc, l) => {
        const hay = filter.caseSensitive ? l.content : l.content.toLowerCase();
        return ((passesLevel(l.level) && hay.includes(needle)) || pinned.has(l.id)) ? acc + 1 : acc;
      }, 0);
    } catch {
      return Array.from(pinned).length;
    }
  }, [currentLines, filter, currentPinnedSet, showOnlyPinned]);

  const handleLoadMoreTop = () => {
    if (pendingOlderRef.current.length === 0) return;
    const take = 2000;
    const slice = pendingOlderRef.current.splice(
      Math.max(0, pendingOlderRef.current.length - take),
      take
    );
    if (slice.length === 0) return;

    setAllLines((prev) => {
      const prevIds = new Set(prev.map((l) => l.id));
      const filteredSlice = slice.filter((l) => !prevIds.has(l.id));
      if (filteredSlice.length === 0) return prev;

      const merged = dedupeById([...filteredSlice, ...prev]);
      if (merged.length > maxLines) {
        return merged.slice(-maxLines);
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
      const limited = prev.length > v ? prev.slice(-v) : prev;
      return dedupeById(limited);
    });
    toast.message(`Max righe: ${v.toLocaleString()}`);
    queueMicrotask(() => persistAll());
  };

  const pinnedIdsFlat = React.useMemo(() => {
    if (selectedTab === ALL_TAB_ID) {
      const s = new Set<string>();
      for (const set of pinnedByFile.values()) for (const id of set) s.add(id);
      return Array.from(s);
    }
    return Array.from(currentPinnedSet);
  }, [currentPinnedSet, pinnedByFile, selectedTab]);

  React.useEffect(() => {
    const h = setTimeout(() => {
      void persistAll();
    }, 500);
    return () => clearTimeout(h);
  }, [allLines, files, maxLines, pinnedByFile, persistAll]);

  const scrollListToBottom = () => {
    const container = (window as any).__LOG_LIST_CONTAINER__ as HTMLElement | undefined;
    const last = document.getElementById("log-last-row");
    if (container && last) {
      container.scrollTo({
        top: last.offsetTop - (container.clientHeight - last.clientHeight),
        behavior: "smooth",
      });
      return;
    }

    const scrollers = document.querySelectorAll('[data-radix-scroll-area-viewport], .overflow-auto');
    const el = (scrollers[scrollers.length - 1] as HTMLElement) || null;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  };

  const fileTabs = React.useMemo(() => {
    const entries = files.map((f) => ({
      id: f.fileName,
      label: f.fileName,
      count: f.totalLines,
    }));
    return [{ id: ALL_TAB_ID, label: "Tutti", count: allLines.length }, ...entries];
  }, [files, allLines.length]);

  const onJumpToId = (id: string) => {
    // Cambia tab al file di appartenenza se necessario
    const line = allLines.find((l) => l.id === id);
    if (line && selectedTab !== ALL_TAB_ID && line.fileName !== selectedTab) {
      setSelectedTab(line.fileName);
    }
    setPendingJumpId(id);
  };

  return (
    <Card className="w-screen h-[calc(100vh-56px)] max-w-none rounded-none border-0 flex flex-col overflow-hidden">
      {isRestoring && (
        <div className="w-full h-1 bg-secondary relative overflow-hidden">
          <div className="absolute inset-0 animate-[shimmer_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <style jsx>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
            div[style*="shimmer"] {}
          `}</style>
        </div>
      )}
      <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden p-0">
        <div className="shrink-0 p-3">
          <LogControls
            filter={filter}
            onFilterChange={setFilter}
            pinnedCount={currentPinnedSet.size}
            visibleCount={visibleCount}
            totalCount={totalCount}
            showOnlyPinned={showOnlyPinned}
            onToggleShowOnlyPinned={() => setShowOnlyPinned((v) => !v)}
            onFilesSelected={handleFilesSelected}
            onClearAll={clearAll}
            pinnedIds={pinnedIdsFlat}
            onJumpToId={onJumpToId}
          />
        </div>

        {/* Tabs per file */}
        <div className="px-3 pb-2 border-b">
          <div className="flex items-center gap-1 overflow-auto">
            {fileTabs.map((t) => {
              const active = t.id === selectedTab;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTab(t.id)}
                  className={[
                    "px-3 py-1.5 rounded-t-md border-b-2 text-sm whitespace-nowrap",
                    active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  ].join(" ")}
                  title={t.label}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({t.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
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
          {currentLines.length > 0 && (
            <Button size="sm" variant="outline" onClick={scrollListToBottom}>
              Vai in fondo
            </Button>
          )}
          <div className="flex-1" />
          {ingesting && <span>Import in corso…</span>}
          {ingestStats.length > 0 && (
            <span>File importati: {ingestStats.length}</span>
          )}
        </div>

        <div
          className="flex-1 min-h-0 rounded-none relative overflow-hidden flex"
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

          <div className="flex-1 min-w-0 overflow-hidden flex">
            <div className="flex-1 min-w-0 overflow-auto">
              <LogList
                lines={currentLines}
                pinned={currentPinnedSet}
                onTogglePin={togglePin}
                filter={filter}
                showOnlyPinned={showOnlyPinned}
                onLoadMoreTop={handleLoadMoreTop}
                jumpToId={pendingJumpId}
                onAfterJump={() => setPendingJumpId(null)}
              />
            </div>
            <ChatSidebar lines={currentLines} pinnedIds={pinnedIdsFlat} filter={filter} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}