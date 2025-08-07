"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import LogControls from "./LogControls";
import LogList from "./LogList";
import ChatSidebar from "./ChatSidebar";
import { useLogState, ALL_TAB_ID } from "./hooks/useLogState";
import FileTabs, { type Tab as FileTab } from "./components/FileTabs";
import DragOverlay from "./components/DragOverlay";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

const LS_CHAT_OPEN_KEY = "logviewer.chat.open.v1";

export default function LogViewer() {
  const { t } = useI18n();
  const {
    files,
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
    handleLoadMoreTop,
    onChangeMaxLines,
    onJumpToId,
    addEmptyTab,
    pageSize,
    setPageSize,
    loadMoreUp,
    loadMoreDown,
    jumpToLine,
    currentTotal,
    isLargeProvider,
    jumpToStart,
    jumpToEnd,
  } = useLogState();

  const [ready, setReady] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState<boolean>(true);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_CHAT_OPEN_KEY);
      setChatOpen(raw !== "0");
    } catch {
      setChatOpen(true);
    } finally {
      setReady(true);
    }
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(LS_CHAT_OPEN_KEY, chatOpen ? "1" : "0");
    } catch {}
  }, [chatOpen, ready]);

  const onNewTab = () => {
    const id = addEmptyTab();
    setSelectedTab(id);
  };

  const handleCloseTab = (id: string) => {
    const fileOnly = fileTabs.filter((t) => t.id !== ALL_TAB_ID);
    if (fileOnly.length <= 1 && id !== ALL_TAB_ID) {
      clearAll(false);
      setSelectedTab(ALL_TAB_ID);
      toast.message("Pulito");
      return;
    }
    closeFileTab(id);
  };

  const tabsForRender: FileTab[] = fileTabs;

  const showEmptyHint =
    selectedTab !== ALL_TAB_ID &&
    currentLines.length === 0 &&
    files.find((f) => f.fileName === selectedTab)?.totalLines === 0;

  // Match list e indice corrente
  const [matchIds, setMatchIds] = React.useState<string[]>([]);
  const [matchIndex, setMatchIndex] = React.useState<number>(-1);

  React.useEffect(() => {
    setMatchIndex(-1);
  }, [filter.mode, filter.query, filter.caseSensitive, filter.level, showOnlyPinned, selectedTab]);

  const hasActiveFilter =
    showOnlyPinned ||
    filter.level !== "ALL" ||
    (filter.query && filter.query.trim().length > 0);

  const overallTotal = hasActiveFilter
    ? matchIds.length
    : selectedTab === ALL_TAB_ID
      ? currentLines.length
      : currentTotal ?? currentLines.length;

  const goToMatchAt = (idx: number) => {
    if (matchIds.length === 0) return;
    const n = ((idx % matchIds.length) + matchIds.length) % matchIds.length;
    setMatchIndex(n);
    setPendingJumpId(matchIds[n]);
  };

  const goPrevMatch = () => goToMatchAt((matchIndex === -1 ? 0 : matchIndex) - 1);
  const goNextMatch = () => goToMatchAt((matchIndex === -1 ? 0 : matchIndex) + 1);

  const currentMatchId = matchIndex >= 0 ? matchIds[matchIndex] : null;

  const handleGoToStart = () => {
    if (selectedTab === ALL_TAB_ID) return;
    void jumpToStart();
  };
  const handleGoToEnd = () => {
    if (selectedTab === ALL_TAB_ID) {
      (window as any).__LOG_LIST_SCROLL_TO_BOTTOM__?.();
      return;
    }
    void jumpToEnd();
  };

  // Drag & Drop handlers su tutta l'area principale
  const dragCounterRef = React.useRef(0);

  const resetDragState = React.useCallback(() => {
    dragCounterRef.current = 0;
    setIsDragging(false);
  }, [setIsDragging]);

  React.useEffect(() => {
    // In alcuni browser, uscendo dalla finestra con l'elemento trascinato non scatta dragleave:
    // ascoltiamo eventi globali per ripulire lo stato.
    const onDocDragEnd = () => resetDragState();
    const onDocDrop = () => resetDragState();
    const onDocEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") resetDragState();
    };
    document.addEventListener("dragend", onDocDragEnd);
    document.addEventListener("drop", onDocDrop);
    document.addEventListener("keydown", onDocEscape);
    return () => {
      document.removeEventListener("dragend", onDocDragEnd);
      document.removeEventListener("drop", onDocDrop);
      document.removeEventListener("keydown", onDocEscape);
    };
  }, [resetDragState]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // primo ingresso: mostra overlay
    if (dragCounterRef.current === 0) setIsDragging(true);
    dragCounterRef.current++;
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // filtra a .log o text/plain, ma accetta anche type vuoto (alcuni OS)
      const accepted = Array.from(files).filter(
        (f) => f.name.endsWith(".log") || f.type === "text/plain" || f.type === ""
      );
      if (accepted.length === 0) {
        toast.message("Nessun file valido. Trascina file .log o di testo.");
        return;
      }
      void addFiles(accepted);
    }
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
          `}</style>
        </div>
      )}
      <CardContent
        className="flex-1 min-h-0 flex flex-col overflow-hidden p-0"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <FileTabs
          tabs={tabsForRender}
          selected={selectedTab}
          onSelect={setSelectedTab}
          onClose={handleCloseTab}
          onNewTab={onNewTab}
        />

        {selectedTab !== ALL_TAB_ID && isLargeProvider && (
          <div className="mx-3 my-2 rounded-md border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              Questo è un file molto grande. Non sarà disponibile dopo il refresh del browser e le risposte del chatbot potrebbero non essere complete perché il contesto viene caricato a blocchi.
            </div>
          </div>
        )}

        <div className="shrink-0 p-3">
          <LogControls
            filter={filter}
            onFilterChange={setFilter}
            pinnedCount={currentPinnedSet.size}
            visibleCount={visibleCount}
            totalCount={overallTotal}
            showOnlyPinned={showOnlyPinned}
            onToggleShowOnlyPinned={() => setShowOnlyPinned((v) => !v)}
            onFilesSelected={(fl) => addFiles(fl)}
            pinnedIds={pinnedIdsFlat}
            onJumpToId={onJumpToId}
            onJumpToLine={jumpToLine}
            onPrevMatch={goPrevMatch}
            onNextMatch={goNextMatch}
            matchesEnabled={!!(hasActiveFilter && matchIds.length > 0)}
            onGoToStart={handleGoToStart}
            onGoToEnd={handleGoToEnd}
          />
        </div>

        <div className="flex-1 min-h-0 rounded-none relative overflow-hidden flex">
          {false && <div />} {/* placeholder to keep structure stable */}

          <div className="flex-1 min-w-0 overflow-hidden flex relative">
            <div className="flex-1 min-w-0 overflow-auto relative">
              {showEmptyHint ? (
                <div className="h-full grid place-items-center p-6">
                  <div className="rounded-lg border bg-card px-6 py-5 text-sm text-center space-y-2">
                    <div className="text-base font-medium">{t("drop_files_here")}</div>
                    <div className="text-xs text-muted-foreground">
                      Oppure clicca “{t("upload_logs")}” per scegliere un file dal tuo PC.
                    </div>
                  </div>
                </div>
              ) : (
                <LogList
                  lines={currentLines}
                  pinned={currentPinnedSet}
                  onTogglePin={togglePin}
                  filter={filter}
                  showOnlyPinned={showOnlyPinned}
                  onLoadMoreTop={handleLoadMoreTop}
                  jumpToId={pendingJumpId}
                  onAfterJump={() => setPendingJumpId(null)}
                  onMatchesChange={setMatchIds}
                  currentMatchId={currentMatchId}
                />
              )}
            </div>

            {ready ? (
              <ChatSidebar
                lines={currentLines}
                pinnedIds={pinnedIdsFlat}
                filter={filter}
                open={chatOpen}
                onOpenChange={setChatOpen}
              />
            ) : (
              <div className="w-14 shrink-0" />
            )}
          </div>
        </div>

        {ingestStats.length > 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            File importati: {ingestStats.length}
          </div>
        )}

        {isDragging && <DragOverlay />}
      </CardContent>
    </Card>
  );
}