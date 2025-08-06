"use client";

import * as React from "react";
import { toast } from "sonner";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "../LogTypes";
import { idbLoadState, idbSaveState, idbUpdatePinned, idbClearAll } from "@/lib/idb";

export type FileIngestStats = {
  fileName: string;
  totalLines: number;
  droppedLines: number;
};

export const ALL_TAB_ID = "__ALL__";

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

export function useLogState() {
  const [files, setFiles] = React.useState<ParsedFile[]>([]);
  const [allLines, setAllLines] = React.useState<LogLine[]>([]);
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

  const [selectedTab, setSelectedTab] = React.useState<string>(ALL_TAB_ID);

  // Restore
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
    const pinnedIds = Array.from(pinnedByFile.values()).flatMap((s) => Array.from(s));
    const metaFiles = files.map((f) => ({ fileName: f.fileName, totalLines: f.totalLines }));
    await idbSaveState({
      allLines: allLinesIdb,
      pinnedIds,
      files: metaFiles,
      maxLines,
    });
  }, [allLines, pinnedByFile, files, maxLines]);

  React.useEffect(() => {
    const h = setTimeout(() => void persistAll(), 500);
    return () => clearTimeout(h);
  }, [allLines, files, maxLines, pinnedByFile, persistAll]);

  // Ingest new files
  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setIngesting(true);

    const tempByFile = new Map<string, LogLine[]>();
    const newStats: FileIngestStats[] = [];

    for (const f of arr) {
      const fileName = f.name;
      let totalLines = 0;
      let dropped = 0;
      const linesForFile: LogLine[] = [];
      const batch: LogLine[] = [];

      for await (const rawLine of streamLines(f)) {
        totalLines++;
        const id = `${fileName}:${totalLines}`;
        const lineObj: LogLine = {
          id,
          fileName,
          lineNumber: totalLines,
          content: rawLine,
          level: detectLevel(rawLine),
        };

        linesForFile.push(lineObj);
        batch.push(lineObj);

        if (batch.length >= 2000) {
          const publish = batch.splice(0, batch.length);
          setAllLines((prev) => {
            const prevIds = new Set(prev.map((l) => l.id));
            const merged = dedupeById([...prev, ...publish.filter((l) => !prevIds.has(l.id))]);
            if (merged.length > maxLines) return merged.slice(-maxLines);
            return merged;
          });
          await new Promise((r) => setTimeout(r));
        }
      }

      setAllLines((prev) => {
        const prevIds = new Set(prev.map((l) => l.id));
        const merged = dedupeById([...prev, ...batch.filter((l) => !prevIds.has(l.id))]);
        if (merged.length > maxLines) {
          const removeCount = merged.length - maxLines;
          dropped += removeCount;
          return merged.slice(-maxLines);
        }
        return merged;
      });

      tempByFile.set(fileName, linesForFile);

      setFiles((prev) => {
        const idx = prev.findIndex((p) => p.fileName === fileName);
        if (idx === -1) {
          return [...prev, { fileName, lines: linesForFile, totalLines }];
        }
        const next = [...prev];
        next[idx] = { fileName, lines: linesForFile, totalLines };
        return next;
      });

      newStats.push({ fileName, totalLines, droppedLines: dropped });
    }

    setIngestStats(newStats);
    setIngesting(false);
    toast.success(`${arr.length} file caricati`);
    queueMicrotask(() => {
      (window as any).__LOG_LIST_SCROLL_TO_BOTTOM__?.();
      persistAll();
    });
  };

  // Close a file tab
  const closeFileTab = (fileName: string) => {
    if (!fileName || fileName === ALL_TAB_ID) return;

    setAllLines((prev) => prev.filter((l) => l.fileName !== fileName));
    setFiles((prev) => prev.filter((f) => f.fileName !== fileName));
    setPinnedByFile((prev) => {
      const next = new Map(prev);
      next.delete(fileName);
      const flat = Array.from(next.values()).flatMap((s) => Array.from(s));
      idbUpdatePinned(flat);
      return next;
    });
    setSelectedTab((cur) => (cur === fileName ? ALL_TAB_ID : cur));
    toast.message(`Tab chiusa: ${fileName}`);
    queueMicrotask(() => persistAll());
  };

  // Clear all
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
    void idbClearAll();
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
      const flat = Array.from(next.values()).flatMap((s) => Array.from(s));
      idbUpdatePinned(flat);
      return next;
    });
  };

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

  const onJumpToId = (id: string) => {
    const line = allLines.find((l) => l.id === id);
    if (line && selectedTab !== ALL_TAB_ID && line.fileName !== selectedTab) {
      setSelectedTab(line.fileName);
    }
    setPendingJumpId(id);
  };

  const currentLines = React.useMemo<LogLine[]>(() => {
    if (selectedTab === ALL_TAB_ID) return allLines;
    return allLines.filter((l) => l.fileName === selectedTab);
  }, [selectedTab, allLines]);

  const currentPinnedSet = React.useMemo<Set<string>>(() => {
    if (selectedTab === ALL_TAB_ID) {
      const s = new Set<string>();
      for (const set of pinnedByFile.values()) for (const id of set) s.add(id);
      return s;
    }
    return pinnedByFile.get(selectedTab) ?? new Set<string>();
  }, [pinnedByFile, selectedTab]);

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

  const pinnedIdsFlat = React.useMemo(() => {
    if (selectedTab === ALL_TAB_ID) {
      const s = new Set<string>();
      for (const set of pinnedByFile.values()) for (const id of set) s.add(id);
      return Array.from(s);
    }
    return Array.from(currentPinnedSet);
  }, [currentPinnedSet, pinnedByFile, selectedTab]);

  const fileTabs = React.useMemo(() => {
    const entries = files.map((f) => ({
      id: f.fileName,
      label: f.fileName,
      count: f.totalLines,
    }));
    return [{ id: ALL_TAB_ID, label: "Tutti", count: allLines.length }, ...entries];
  }, [files, allLines.length]);

  return {
    // state
    files,
    allLines,
    filter,
    showOnlyPinned,
    maxLines,
    isDragging,
    ingesting,
    ingestStats,
    isRestoring,
    pendingJumpId,
    selectedTab,
    currentLines,
    currentPinnedSet,
    visibleCount,
    pinnedIdsFlat,
    fileTabs,
    // setters/actions
    setFilter,
    setShowOnlyPinned,
    setIsDragging,
    setPendingJumpId,
    setSelectedTab,
    addFiles,
    closeFileTab,
    clearAll,
    togglePin,
    handleLoadMoreTop,
    onChangeMaxLines,
    onJumpToId,
  };
}