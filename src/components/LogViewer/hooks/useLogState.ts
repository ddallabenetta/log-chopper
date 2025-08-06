"use client";

import * as React from "react";
import { toast } from "sonner";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "../LogTypes";
import { idbLoadState, idbUpdatePinned, idbClearAll } from "@/lib/idb";
import { dedupeById } from "./log-helpers";
import { LARGE_FILE_THRESHOLD, createIdbProvider, createLargeProvider, type LineProvider } from "./line-provider";
import { getAllFilesMeta } from "./log-pagination";

export type FileIngestStats = {
  fileName: string;
  totalLines: number;
  droppedLines: number;
};

export const ALL_TAB_ID = "__ALL__";

const LS_PAGE_SIZE = "logviewer.pageSize.v1";

// Contatore per tab vuote
let emptyTabCounter = 1;

export function useLogState() {
  // State base
  const [files, setFiles] = React.useState<ParsedFile[]>([]);
  const [allLines, setAllLines] = React.useState<LogLine[]>([]);
  const [pinnedByFile, setPinnedByFile] = React.useState<Map<string, Set<string>>>(new Map());
  const [filter, setFilter] = React.useState<FilterConfig>({ query: "", mode: "text", caseSensitive: false, level: "ALL" });
  const [showOnlyPinned, setShowOnlyPinned] = React.useState(false);

  const [maxLines, setMaxLines] = React.useState<number>(50000); // compat

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

  // Provider per fileName -> provider
  const providersRef = React.useRef<Map<string, LineProvider>>(new Map());

  // Restore pinned e meta file (solo nomi e totali; i provider grandi saranno creati all'import)
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

  // Import: decide provider in base alla dimensione (large-file > 50MB)
  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setIngesting(true);

    const wasOnNewTab = selectedTab !== ALL_TAB_ID && selectedTab.startsWith("Nuova-");

    const newStats: FileIngestStats[] = [];
    const importedNames: string[] = [];

    for (const f of arr) {
      importedNames.push(f.name);

      let provider: LineProvider;
      if (f.size > LARGE_FILE_THRESHOLD) {
        // LARGE provider: indice leggero, nessun salvataggio su IDB
        provider = await createLargeProvider(f);
        providersRef.current.set(f.name, provider);

        // aggiorna lista file (totale da indice)
        const total = await provider.totalLines();
        setFiles((prev) => upsertFile(prev, { fileName: f.name, lines: [], totalLines: total }));

        // carica una tail window
        const tail = await provider.tail(Math.min(pageSize, total));
        setAllLines((prev) => {
          const others = prev.filter((l) => l.fileName !== f.name);
          return dedupeById([...others, ...tail]);
        });

        newStats.push({ fileName: f.name, totalLines: total, droppedLines: 0 });
      } else {
        // SMALL provider (IndexedDB) – usiamo la pipeline esistente di Log Chopper
        provider = await createIdbProvider(f.name);
        providersRef.current.set(f.name, provider);

        const total = await provider.totalLines();
        setFiles((prev) => upsertFile(prev, { fileName: f.name, lines: [], totalLines: total }));
        const tail = await provider.tail(Math.min(pageSize, total));
        setAllLines((prev) => {
          const others = prev.filter((l) => l.fileName !== f.name);
          return dedupeById([...others, ...tail]);
        });
        newStats.push({ fileName: f.name, totalLines: total, droppedLines: 0 });
      }
    }

    setIngestStats(newStats);
    setIngesting(false);

    if (wasOnNewTab) {
      setFiles((prev) => prev.filter((f) => f.fileName !== selectedTab));
    }

    const lastImported = importedNames[importedNames.length - 1];
    if (lastImported) setSelectedTab(lastImported);

    toast.success(`${arr.length} file caricati`);
    queueMicrotask(() => (window as any).__LOG_LIST_SCROLL_TO_BOTTOM__?.());
  };

  const upsertFile = (prev: ParsedFile[], entry: ParsedFile) => {
    const idx = prev.findIndex((p) => p.fileName === entry.fileName);
    if (idx === -1) return [...prev, entry];
    const next = [...prev];
    next[idx] = entry;
    return next;
  };

  const closeFileTab = (fileName: string) => {
    if (!fileName || fileName === ALL_TAB_ID) return;

    const prov = providersRef.current.get(fileName);
    prov?.dispose?.();
    providersRef.current.delete(fileName);

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
    // dispose providers
    for (const p of providersRef.current.values()) p.dispose?.();
    providersRef.current.clear();

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

  // Paging helpers attraverso provider
  async function loadMoreUp() {
    if (selectedTab === ALL_TAB_ID) return;
    const prov = providersRef.current.get(selectedTab);
    if (!prov) return;

    const current = allLines.filter((l) => l.fileName === selectedTab);
    const first = current[0];
    const block = Math.max(1000, Math.min(pageSize, 20000));
    const fromLine = first ? Math.max(1, first.lineNumber - block) : 1;
    const toLine = first ? first.lineNumber - 1 : 0;
    if (toLine < fromLine) return;

    const older = await prov.range(fromLine, toLine);
    if (!older.length) return;

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      const currentPrev = prev.filter((l) => l.fileName === selectedTab);
      return dedupeById([...others, ...older, ...currentPrev]);
    });
  }

  async function loadMoreDown() {
    if (selectedTab === ALL_TAB_ID) return;
    const prov = providersRef.current.get(selectedTab);
    if (!prov) return;

    const total = await prov.totalLines();
    if (total <= 0) return;

    const current = allLines.filter((l) => l.fileName === selectedTab);
    const last = current[current.length - 1];
    const fromLine = last ? last.lineNumber + 1 : Math.max(1, total - pageSize + 1);
    const toLine = Math.min(total, fromLine + Math.max(1000, Math.min(pageSize, 20000)) - 1);
    if (toLine < fromLine) return;

    const newer = await prov.range(fromLine, toLine);
    if (!newer.length) return;

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      const currentPrev = prev.filter((l) => l.fileName === selectedTab);
      return dedupeById([...others, ...currentPrev, ...newer]);
    });
  }

  async function jumpToLine(n: number) {
    if (selectedTab === ALL_TAB_ID) return;
    const prov = providersRef.current.get(selectedTab);
    if (!prov) return;

    const total = await prov.totalLines();
    if (total <= 0) return;

    const target = Math.max(1, Math.min(total, Math.floor(n)));
    const half = Math.floor(pageSize / 2);
    const from = Math.max(1, target - half);
    const to = Math.min(total, from + pageSize - 1);
    const rows = await prov.range(from, to);
    if (!rows.length) return;

    setAllLines((prev) => {
      const others = prev.filter((l) => l.fileName !== selectedTab);
      return dedupeById([...others, ...rows]);
    });

    setPendingJumpId(`${selectedTab}:${target}`);
  }

  const onJumpToId = (id: string) => setPendingJumpId(id);

  // Quando cambia tab o pageSize, ricarichiamo la coda con il suo provider
  React.useEffect(() => {
    (async () => {
      const tab = selectedTab;
      if (!tab || tab === ALL_TAB_ID) return;
      const prov = providersRef.current.get(tab);
      if (!prov) return;

      const total = await prov.totalLines();
      if (total <= 0) {
        setAllLines((prev) => prev.filter((l) => l.fileName !== tab));
        return;
      }

      const n = Math.max(1, Math.min(pageSize, total));
      const tail = await prov.tail(n);
      setAllLines((prev) => {
        const others = prev.filter((l) => l.fileName !== tab);
        return dedupeById([...others, ...tail]);
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
    const entries = files.map((f) => ({ id: f.fileName, label: f.fileName, count: f.totalLines }));
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
    loadMoreUp,
    loadMoreDown,
    jumpToLine,
    handleLoadMoreTop: loadMoreUp,
  };
}