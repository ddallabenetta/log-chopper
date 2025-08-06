"use client";

import * as React from "react";
import { toast } from "sonner";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "../LogTypes";
import { idbLoadState, idbUpdatePinned, idbClearAll } from "@/lib/idb";
import { detectLevel, streamLines, dedupeById } from "./log-helpers";
import {
  TAIL_PREVIEW_DEFAULT,
  saveBatchToDb,
  updateFileTotal,
  readTailPreview,
  readRange,
  getFileMetaTotal,
  getAllFilesMeta,
} from "./log-pagination";

export type FileIngestStats = {
  fileName: string;
  totalLines: number;
  droppedLines: number;
};

export const ALL_TAB_ID = "__ALL__";

const LS_PAGE_SIZE = "logviewer.pageSize.v1";

let emptyTabCounter = 1;

export function useLogState() {
  // State
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

  const [maxLines, setMaxLines] = React.useState<number>(50000); // legacy/compat

  const [isDragging, setIsDragging] = React.useState(false);
  const [ingesting, setIngesting] = React.useState(false);
  const [ingestStats, setIngestStats] = React.useState<FileIngestStats[]>([]);
  const [isRestoring, setIsRestoring] = React.useState(false);

  const [pendingJumpId, setPendingJumpId] = React.useState<string | null>(null);
  const [selectedTab, setSelectedTab] = React.useState<string>(ALL_TAB_ID);

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

  // Restore meta & pinned
  React.useEffect(() => {
    (async () => {
      setIsRestoring(true);
      const saved = await idbLoadState();
      const metaFiles = await getAllFilesMeta();

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

  // Import with tail-first preview
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
          await saveBatchToDb(batch);
          batch = [];
          await updateFileTotal(fileName, totalLines);

          const mapped = await readTailPreview(fileName, TAIL_PREVIEW_DEFAULT);

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
        await saveBatchToDb(batch);
        await updateFileTotal(fileName, totalLines);
      }

      const mapped = await readTailPreview(fileName, TAIL_PREVIEW_DEFAULT);

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

  // Paging helpers
  async function loadMoreUp() {
    if (selectedTab === ALL_TAB_ID) return;
    const current = allLines.filter((l) => l.fileName === selectedTab);
    const first = current[0];
    const block = Math.max(1000, Math.min(pageSize, 20000));
    const fromLine = first ? Math.max(1, first.lineNumber - block) : 1;
    const toLine = first ? first.lineNumber - 1 : 0;
    if (toLine < fromLine) return;

    const older = await readRange(selectedTab, fromLine, toLine);
    if (!older.length) return;

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      const currentPrev = prev.filter((l) => l.fileName === selectedTab);
      return dedupeById([...others, ...older, ...currentPrev]);
    });
  }

  async function loadMoreDown() {
    if (selectedTab === ALL_TAB_ID) return;
    const total = await getFileMetaTotal(selectedTab);
    if (total <= 0) return;

    const current = allLines.filter((l) => l.fileName === selectedTab);
    const last = current[current.length - 1];
    const fromLine = last ? last.lineNumber + 1 : Math.max(1, total - pageSize + 1);
    const toLine = Math.min(total, fromLine + Math.max(1000, Math.min(pageSize, 20000)) - 1);
    if (toLine < fromLine) return;

    const newer = await readRange(selectedTab, fromLine, toLine);
    if (!newer.length) return;

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      const currentPrev = prev.filter((l) => l.fileName === selectedTab);
      return dedupeById([...others, ...currentPrev, ...newer]);
    });
  }

  async function jumpToLine(n: number) {
    if (selectedTab === ALL_TAB_ID) return;
    const total = await getFileMetaTotal(selectedTab);
    if (total <= 0) return;

    const target = Math.max(1, Math.min(total, Math.floor(n)));
    const half = Math.floor(pageSize / 2);
    const from = Math.max(1, target - half);
    const to = Math.min(total, from + pageSize - 1);
    const rows = await readRange(selectedTab, from, to);
    if (!rows.length) return;

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      return dedupeById([...others, ...rows]);
    });

    setPendingJumpId(`${selectedTab}:${target}`);
  }

  const onJumpToId = (id: string) => {
    setPendingJumpId(id);
  };

  // Load a tail-aligned window on tab/pageSize change
  React.useEffect(() => {
    (async () => {
      const tab = selectedTab;
      if (!tab || tab === ALL_TAB_ID) return;

      const total = await getFileMetaTotal(tab);
      if (total <= 0) {
        setAllLines((prev) => prev.filter((l) => l.fileName !== tab));
        return;
      }

      const n = Math.max(1, Math.min(pageSize, total));
      const from = total - n + 1;
      const to = total;
      const rows = await readRange(tab, from, to);

      setAllLines((prev) => {
        const others = prev.filter((l) => l.fileName !== tab);
        return dedupeById([...others, ...rows]);
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, pageSize]);

  // Derived
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

    const passesLevel = (lvl: LogLevel) => (filter.level === "ALL" ? true : lvl === filter.level);

    if (!filter.query) {
      return currentLines.reduce((acc, l) => (passesLevel(l.level) || pinned.has(l.id) ? acc + 1 : acc), 0);
    }

    const flags = filter.caseSensitive ? "" : "i";
    try {
      if (filter.mode === "regex") {
        const re = new RegExp(filter.query, flags);
        return currentLines.reduce(
          (acc, l) => ((passesLevel(l.level) && re.test(l.content)) || pinned.has(l.id) ? acc + 1 : acc),
          0
        );
      }
      const needle = filter.caseSensitive ? filter.query : filter.query.toLowerCase();
      return currentLines.reduce((acc, l) => {
        const hay = filter.caseSensitive ? l.content : l.content.toLowerCase();
        return (passesLevel(l.level) && hay.includes(needle)) || pinned.has(l.id) ? acc + 1 : acc;
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
    setFilter,
    setShowOnlyPinned,
    setIsDragging,
    setPendingJumpId,
    setSelectedTab,
    addFiles,
    closeFileTab,
    clearAll,
    togglePin,
    onChangeMaxLines,
    onJumpToId,
    addEmptyTab,
    pageSize,
    setPageSize,
    // paging actions
    loadMoreUp,
    loadMoreDown,
    jumpToLine,
    // compat handler used by LogList for top loading
    handleLoadMoreTop: loadMoreUp,
  };
}