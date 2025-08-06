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
import { Bot, PanelRightOpen } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

const LS_CHAT_OPEN_KEY = "logviewer.chat.open.v1";

export default function LogViewer() {
  const { t } = useI18n();
  const {
    // state
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
    // actions
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
  } = useLogState();

  // Evita flicker: fino a quando non è il client, non mostriamo la chat
  const [ready, setReady] = React.useState(false);

  // Inizializza leggendo subito localStorage (default true se non presente)
  const [chatOpen, setChatOpen] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true; // SSR: default aperto
    const raw = window.localStorage.getItem(LS_CHAT_OPEN_KEY);
    return raw === "0" ? false : true;
    });

  React.useEffect(() => {
    // Siamo sul client: assicuriamoci di leggere ancora localStorage nel caso di navigazioni client
    try {
      const raw = window.localStorage.getItem(LS_CHAT_OPEN_KEY);
      if (raw === "0") setChatOpen(false);
      else if (raw === "1") setChatOpen(true);
    } catch {}
    setReady(true);
  }, []);

  // Salva preferenza ogni volta che cambia
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
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await addFiles(files);
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

        <div className="shrink-0 p-3">
          <LogControls
            filter={filter}
            onFilterChange={setFilter}
            pinnedCount={currentPinnedSet.size}
            visibleCount={visibleCount}
            totalCount={currentLines.length}
            showOnlyPinned={showOnlyPinned}
            onToggleShowOnlyPinned={() => setShowOnlyPinned((v) => !v)}
            onFilesSelected={(fl) => addFiles(fl)}
            pinnedIds={pinnedIdsFlat}
            onJumpToId={onJumpToId}
            maxLines={maxLines}
            onChangeMaxLines={onChangeMaxLines}
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

            {ready && chatOpen ? (
              <ChatSidebar lines={currentLines} pinnedIds={pinnedIdsFlat} filter={filter} />
            ) : ready && !chatOpen ? (
              <div className="h-full flex items-center">
                <Button
                  variant="default"
                  size="icon"
                  className="mx-2 rounded-full shadow hover:shadow-md transition-all"
                  title="Apri assistant"
                  onClick={() => setChatOpen(true)}
                >
                  <PanelRightOpen className="h-5 w-5" />
                </Button>
                <div className="mr-2 hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" />
                  <span>Assistant</span>
                </div>
              </div>
            ) : (
              // Non renderizzare nulla della chat finché non siamo pronti (evita flicker)
              <div className="w-14 shrink-0" />
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