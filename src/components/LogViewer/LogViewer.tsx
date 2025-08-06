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
import { Button } from "@/components/ui/button";
import { PanelRightOpen, AlertTriangle } from "lucide-react";
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
    // nuovi
    currentTotal,
    isLargeProvider,
  } = useLogState();

  const [ready, setReady] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState<boolean>(true);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_CHAT_OPEN_KEY);
      if (raw === "0") setChatOpen(false);
      else if (raw === "1") setChatOpen(true);
      else setChatOpen(true);
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
    const filesD = e.dataTransfer.files;
    if (filesD && filesD.length > 0) {
      await addFiles(filesD);
    }
  };

  React.useEffect(() => {
    if (ingesting) toast.message("Import in corso…");
  }, [ingesting]);

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

  const overallTotal = selectedTab === ALL_TAB_ID
    ? currentLines.length // aggregato per "Tutti"
    : currentTotal ?? currentLines.length;

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
      <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden p-0">
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
            pageSize={pageSize}
            onChangePageSize={setPageSize}
            onLoadMoreUp={loadMoreUp}
            onLoadMoreDown={loadMoreDown}
            onJumpToLine={jumpToLine}
          />
        </div>

        <div
          className="flex-1 min-h-0 rounded-none relative overflow-hidden flex"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && <DragOverlay />}

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
                />
              )}
            </div>

            {!ready ? (
              <div className="w-14 shrink-0" />
            ) : (
              <ChatSidebar
                lines={currentLines}
                pinnedIds={pinnedIdsFlat}
                filter={filter}
                open={true}
                onOpenChange={() => {}}
              />
            )}
          </div>
        </div>

        {ingestStats.length > 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            File importati: {ingestStats.length}
          </div>
        )}
      </CardContent>
    </Card>
  );
}