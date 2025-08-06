"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import LogControls from "./LogControls";
import LogList from "./LogList";
import ChatSidebar from "./ChatSidebar";
import { useLogState } from "./hooks/useLogState";
import FileTabs from "./components/FileTabs";
import TopBar from "./components/TopBar";
import DragOverlay from "./components/DragOverlay";

export default function LogViewer() {
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
  } = useLogState();

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
            totalCount={currentLines.length}
            showOnlyPinned={showOnlyPinned}
            onToggleShowOnlyPinned={() => setShowOnlyPinned((v) => !v)}
            onFilesSelected={(fl) => addFiles(fl)}
            onClearAll={clearAll}
            pinnedIds={pinnedIdsFlat}
            onJumpToId={onJumpToId}
          />
        </div>

        <FileTabs
          tabs={fileTabs}
          selected={selectedTab}
          onSelect={setSelectedTab}
          onClose={closeFileTab}
        />

        <TopBar
          maxLines={maxLines}
          onChangeMaxLines={onChangeMaxLines}
          hasLines={currentLines.length > 0}
        />

        <div
          className="flex-1 min-h-0 rounded-none relative overflow-hidden flex"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && <DragOverlay />}

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

        {ingestStats.length > 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            File importati: {ingestStats.length}
          </div>
        )}
      </CardContent>
    </Card>
  );
}