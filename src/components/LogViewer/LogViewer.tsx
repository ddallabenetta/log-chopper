"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LogControls from "./LogControls";
import LogList from "./LogList";
import type { FilterConfig, LogLine, ParsedFile } from "./LogTypes";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

function parseContent(fileName: string, content: string): ParsedFile {
  const rawLines = content.split(/\r?\n/);
  const lines: LogLine[] = rawLines.map((content, idx) => ({
    id: `${fileName}:${idx + 1}`,
    fileName,
    lineNumber: idx + 1,
    content,
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
  });
  const [showOnlyPinned, setShowOnlyPinned] = React.useState(false);

  const handleFilesSelected = async (list: FileList) => {
    const arr = Array.from(list);
    const texts = await Promise.all(arr.map(readFileAsText));
    const parsed = arr.map((f, i) => parseContent(f.name, texts[i]));
    setFiles((prev) => [...prev, ...parsed]);
    setAllLines((prev) => [
      ...prev,
      ...parsed.flatMap((p) => p.lines),
    ]);
  };

  const togglePin = (id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearAll = () => {
    setFiles([]);
    setAllLines([]);
    setPinned(new Set());
    setFilter({ query: "", mode: "text", caseSensitive: false });
    setShowOnlyPinned(false);
    toast.message("Pulito");
  };

  const totalCount = allLines.length;

  const visibleCount = React.useMemo(() => {
    // calcolato rapidamente con logica simile a LogList
    if (showOnlyPinned) return Array.from(pinned).length;
    if (!filter.query) return totalCount;
    // stima semplice: filtra qui
    const flags = filter.caseSensitive ? "" : "i";
    try {
      if (filter.mode === "regex") {
        const re = new RegExp(filter.query, flags);
        return allLines.reduce((acc, l) => (re.test(l.content) || pinned.has(l.id) ? acc + 1 : acc), 0);
      }
      const needle = filter.caseSensitive ? filter.query : filter.query.toLowerCase();
      return allLines.reduce((acc, l) => {
        const hay = filter.caseSensitive ? l.content : l.content.toLowerCase();
        return hay.includes(needle) || pinned.has(l.id) ? acc + 1 : acc;
      }, 0);
    } catch {
      // regex non valida => solo pinned
      return Array.from(pinned).length;
    }
  }, [allLines, filter, pinned, showOnlyPinned, totalCount]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Log Viewer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
        <LogList
          lines={allLines}
          pinned={pinned}
          onTogglePin={togglePin}
          filter={filter}
          showOnlyPinned={showOnlyPinned}
        />
      </CardContent>
    </Card>
  );
}