"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LogControls from "./LogControls";
import LogList from "./LogList";
import type { FilterConfig, LogLine, ParsedFile, LogLevel } from "./LogTypes";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

function detectLevel(text: string): LogLevel {
  const t = text.toUpperCase();
  if (/\bTRACE\b/.test(t)) return "TRACE";
  if (/\bDEBUG\b/.test(t)) return "DEBUG";
  if (/\bINFO\b/.test(t)) return "INFO";
  if (/\bWARN(ING)?\b/.test(t)) return "WARN";
  if (/\bERR(OR)?\b/.test(t)) return "ERROR";
  return "OTHER";
}

function parseContent(fileName: string, content: string): ParsedFile {
  const rawLines = content.split(/\r?\n/);
  const lines: LogLine[] = rawLines.map((content, idx) => ({
    id: `${fileName}:${idx + 1}`,
    fileName,
    lineNumber: idx + 1,
    content,
    level: detectLevel(content),
  }));
  return { fileName, lines, totalLines: lines.length };
}

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

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    const texts = await Promise.all(arr.map(readFileAsText));
    const parsed = arr.map((f, i) => parseContent(f.name, texts[i]));
    setFiles((prev) => [...prev, ...parsed]);
    setAllLines((prev) => [...prev, ...parsed.flatMap((p) => p.lines)]);
    toast.success(`${arr.length} file caricati`);
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

  // Drag & Drop handlers
  const [isDragging, setIsDragging] = React.useState(false);
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

  return (
    <Card className="w-full h-[calc(100vh-6rem)] sm:h-[calc(100vh-8rem)] flex flex-col">
      <CardHeader className="pb-4">
        <CardTitle>Log Viewer</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
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
        />
        <div
          className={`flex-1 min-h-0 rounded-md border relative ${
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
          />
        </div>
      </CardContent>
    </Card>
  );
}