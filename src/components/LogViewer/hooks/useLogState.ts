"use client";

import * as React from "react";
import { toast } from "sonner";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "../LogTypes";
import {
  idbLoadState,
  idbAppendLogs,
  idbGetLastN,
  idbGetLogsByRange,
  idbUpdatePinned,
  idbClearAll,
  idbUpdateFileTotal,
  idbGetFilesMeta,
} from "@/lib/idb";

export type FileIngestStats = {
  fileName: string;
  totalLines: number;
  droppedLines: number;
};

export const ALL_TAB_ID = "__ALL__";

// Config
const TAIL_PREVIEW_DEFAULT = 50000;
const LS_PAGE_SIZE = "logviewer.pageSize.v1";

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

let emptyTabCounter = 1;

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

  // Compat: maxLines non usato per troncare più
  const [maxLines, setMaxLines] = React.useState<number>(50000);

  const [isDragging, setIsDragging] = React.useState(false);
  const [ingesting, setIngesting] = React.useState(false);
  const [ingestStats, setIngestStats] = React.useState<FileIngestStats[]>([]);
  const [isRestoring, setIsRestoring] = React.useState(false);

  const [pendingJumpId, setPendingJumpId] = React.useState<string | null>(null);

  const [selectedTab, setSelectedTab] = React.useState<string>(ALL_TAB_ID);

  // pageSize con persistenza
  const [pageSize, setPageSize] = React.useState<number>(() => {
    if (typeof window === "undefined") return 20000;
    const raw = window.localStorage.getItem(LS_PAGE_SIZE);
    const n = raw ? Number(raw) : 20000;
    return Number.isFinite(n) && n >= 2000 ? Math.min(200000, Math.max(2000, Math.floor(n))) : 20000;
  });
  React.useEffect(() => {
    try {
      window.localStorage.setItem(LS_PAGE_SIZE, String(pageSize));
    } catch {}
  }, [pageSize]);

  // Restore meta e pinned; le righe si leggono a richiesta
  React.useEffect(() => {
    (async () => {
      setIsRestoring(true);
      const saved = await idbLoadState();
      const metaFiles = await idbGetFilesMeta();

      setFiles(metaFiles.map((m) => ({ fileName: m.fileName, lines: [], totalLines: m.totalLines })));

      const nextPinned = new Map<string, Set<string>>();
      for (const id of saved?.pinnedIds || []) {
        const [fileName] = id.split(":");
        if (!fileName) continue;
        const set = nextPinned.get(fileName) ?? new Set<string>();
        set.add(id);
        nextPinned.set(fileName, set);
      }
      setPinnedByFile(nextPinned);

      if (!metaFiles || metaFiles.length === 0) {
        const id = `Nuova-${emptyTabCounter++}`;
        setFiles([{ fileName: id, lines: [], totalLines: 0 }]);
        setSelectedTab(id);
      } else {
        setSelectedTab(ALL_TAB_ID);
      }

      setIsRestoring(false);
    })();
  }, []);

  const addEmptyTab = React.useCallback(() => {
    const id = `Nuova-${emptyTabCounter++}`;
    setFiles((prev) => {
      if (prev.some((f) => f.fileName === id)) return prev;
      return [...prev, { fileName: id, lines: [], totalLines: 0 }];
    });
    return id;
  }, []);

  // Import file: salvataggio su DB e anteprima tail-first 50k
  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setIngesting(true);

    const wasOnNewTab = selectedTab !== ALL_TAB_ID && selectedTab.startsWith("Nuova-");

    const newStats: FileIngestStats[] = [];
    const importedNames: string[] = [];

    for (const f of arr) {
      const fileName = f.name;
      importedNames.push(fileName);

      let totalLines = 0;
      const batchSize = 2000;
      let batch: LogLine[] = [];

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
        batch.push(lineObj);

        if (batch.length >= batchSize) {
          await idbAppendLogs(
            batch.map((l) => ({
              id: l.id,
              fileName: l.fileName,
              lineNumber: l.lineNumber,
              content: l.content,
              level: l.level,
            }))
          );
          batch = [];
          await idbUpdateFileTotal(fileName, totalLines);

          // Anteprima tail-first durante l'import: 50k
          const preview = await idbGetLastN(fileName, TAIL_PREVIEW_DEFAULT);
          const mapped = preview.map((l) => ({
            id: l.id,
            fileName: l.fileName,
            lineNumber: l.lineNumber,
            content: l.content,
            level: (l.level as LogLevel) || "OTHER",
          }));
          mapped.sort((a, b) => a.lineNumber - b.lineNumber);

          setAllLines((prev) => {
            if (selectedTab === ALL_TAB_ID || selectedTab === fileName) {
              const others = prev.filter((l) => l.fileName !== fileName);
              return dedupeById([...others, ...mapped]);
            }
            return prev;
          });

          setFiles((prev) => {
            const idx = prev.findIndex((p) => p.fileName === fileName);
            const upd = { fileName, lines: [], totalLines };
            if (idx === -1) return [...prev, upd];
            const next = [...prev];
            next[idx] = upd;
            return next;
          });
        }
      }

      if (batch.length > 0) {
        await idbAppendLogs(
          batch.map((l) => ({
            id: l.id,
            fileName: l.fileName,
            lineNumber: l.lineNumber,
            content: l.content,
            level: l.level,
          }))
        );
        await idbUpdateFileTotal(fileName, totalLines);
      }

      // Fine import: aggiorna anteprima una volta (ancora 50k per coerenza visuale)
      const preview = await idbGetLastN(fileName, TAIL_PREVIEW_DEFAULT);
      const mapped = preview.map((l) => ({
        id: l.id,
        fileName: l.fileName,
        lineNumber: l.lineNumber,
        content: l.content,
        level: (l.level as LogLevel) || "OTHER",
      }));
      mapped.sort((a, b) => a.lineNumber - b.lineNumber);

      setAllLines((prev) => {
        if (selectedTab === ALL_TAB_ID || selectedTab === fileName) {
          const others = prev.filter((l) => l.fileName !== fileName);
          return dedupeById([...others, ...mapped]);
        }
        return prev;
      });

      setFiles((prev) => {
        const idx = prev.findIndex((p) => p.fileName === fileName);
        const upd = { fileName, lines: [], totalLines };
        if (idx === -1) return [...prev, upd];
        const next = [...prev];
        next[idx] = upd;
        return next;
      });

      newStats.push({ fileName, totalLines, droppedLines: 0 });
    }

    setIngestStats(newStats);
    setIngesting(false);

    if (wasOnNewTab) {
      setFiles((prev) => prev.filter((f) => f.fileName !== selectedTab));
    }

    const lastImported = importedNames[importedNames.length - 1];
    if (lastImported) {
      setSelectedTab(lastImported);
    }

    toast.success(`${arr.length} file caricati`);
    queueMicrotask(() => {
      (window as any).__LOG_LIST_SCROLL_TO_BOTTOM__?.();
    });
  };

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
  };

  const clearAll = (showToast = true) => {
    setFiles([]);
    setAllLines([]);
    setPinnedByFile(new Map());
    setFilter({ query: "", mode: "text", caseSensitive: false, level: "ALL" });
    setShowOnlyPinned(false);
    setIngestStats([]);
    setSelectedTab(ALL_TAB_ID);
    if (showToast) toast.message("Pulito");
    void idbClearAll();
    const id = `Nuova-${emptyTabCounter++}`;
    setFiles([{ fileName: id, lines: [], totalLines: 0 }]);
    setSelectedTab(id);
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

  // Caricamento pagina precedente (top)
  const handleLoadMoreTop = async () => {
    if (selectedTab === ALL_TAB_ID) return;
    const current = allLines.filter((l) => l.fileName === selectedTab);
    const first = current[0];
    const block = Math.max(1000, Math.min(pageSize, 20000)); // carica blocchi fino a pageSize, massimo 20k per step
    const fromLine = first ? Math.max(1, first.lineNumber - block) : 1;
    const toLine = first ? first.lineNumber - 1 : 0;
    if (toLine < fromLine) return;
    const older = await idbGetLogsByRange(selectedTab, fromLine, toLine);
    if (!older.length) return;

    const mapped = older.map((l) => ({
      id: l.id,
      fileName: l.fileName,
      lineNumber: l.lineNumber,
      content: l.content,
      level: (l.level as LogLevel) || "OTHER",
    }));
    mapped.sort((a, b) => a.lineNumber - b.lineNumber);

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      const currentPrev = prev.filter((l) => l.fileName === selectedTab);
      return dedupeById([...others, ...mapped, ...currentPrev]);
    });
  };

  const onJumpToId = (id: string) => {
    setPendingJumpId(id);
  };

  // Quando cambio tab: carica finestra visibile basata su pageSize
  React.useEffect(() => {
    (async () => {
      const tab = selectedTab;
      if (!tab || tab === ALL_TAB_ID) return;

      // Ottieni totali per tab correnti
      const meta = await idbGetFilesMeta();
      const info = meta.find((m) => m.fileName === tab);
      const total = info?.totalLines ?? 0;
      if (total <= 0) {
        setAllLines((prev) => prev.filter((l) => l.fileName !== tab));
        return;
      }

      const n = Math.max(1, Math.min(pageSize, total));
      const from = total - n + 1;
      const to = total;
      const rows = await idbGetLogsByRange(tab, from, to);
      const mapped = rows.map((l) => ({
        id: l.id,
        fileName: l.fileName,
        lineNumber: l.lineNumber,
        content: l.content,
        level: (l.level as LogLevel) || "OTHER",
      }));
      mapped.sort((a, b) => a.lineNumber - b.lineNumber);

      setAllLines((prev) => {
        const others = prev.filter((l) => l.fileName !== tab);
        return dedupeById([...others, ...mapped]);
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, pageSize]);

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

  const onChangeMaxLines = (val: number) => {
    const v = Math.max(1000, Math.min(500000, Math.floor(val)));
    setMaxLines(v);
    toast.message(`Righe per finestra (compat): ${v.toLocaleString()}`);
  };

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
    addEmptyTab,
    // pagination
    pageSize,
    setPageSize,
  };
}