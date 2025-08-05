"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Copy, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import type { LogLine } from "./LogTypes";
import JsonGraphViewer from "./JsonGraphViewer";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  line: LogLine | null;
};

type JsonExtraction =
  | { kind: "none"; raw: string }
  | { kind: "full"; formatted: string; parsed: unknown }
  | { kind: "embedded"; prefix: string; formatted: string; parsed: unknown; suffix: string };

function extractFirstJsonBlock(raw: string): JsonExtraction {
  const s = raw.trim();
  try {
    const parsed = JSON.parse(s);
    return { kind: "full", formatted: JSON.stringify(parsed, null, 2), parsed };
  } catch {}

  const openIdxObj = raw.indexOf("{");
  const openIdxArr = raw.indexOf("[");
  const candidates = [openIdxObj, openIdxArr].filter((i) => i >= 0).sort((a, b) => a - b);
  if (candidates.length === 0) {
    return { kind: "none", raw };
  }

  for (const openIdx of candidates) {
    const opener = raw[openIdx];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = openIdx; i < raw.length; i++) {
      const ch = raw[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      } else {
        if (ch === "\"") {
          inString = true;
          continue;
        }
        if (ch === opener) depth++;
        else if (ch === closer) depth--;

        if (depth === 0) {
          const jsonSlice = raw.slice(openIdx, i + 1);
          try {
            const parsed = JSON.parse(jsonSlice);
            return {
              kind: "embedded",
              prefix: raw.slice(0, openIdx).trimEnd(),
              formatted: JSON.stringify(parsed, null, 2),
              parsed,
              suffix: raw.slice(i + 1).trimStart(),
            };
          } catch {
            break;
          }
        }
      }
    }
  }

  return { kind: "none", raw };
}

export default function LogLineDetailDialog({ open, onOpenChange, line }: Props) {
  const [view, setView] = React.useState<"text" | "graph">("text");
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setView("text");
    setIsFullscreen(false);
  }, [open, line?.id]);

  const extraction = React.useMemo<JsonExtraction>(() => {
    if (!line) return { kind: "none", raw: "" };
    return extractFirstJsonBlock(line.content);
  }, [line]);

  const copyToClipboard = async () => {
    if (!line) return;
    await navigator.clipboard.writeText(line.content);
    toast.success("Contenuto copiato");
  };

  const hasJson = extraction.kind !== "none";

  // Contenuto principale (riutilizzato in modale e in fullscreen)
  const MainContent = (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">ID: {line?.id}</div>
      <Separator />

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {hasJson ? "Contenuto (JSON rilevato)" : "Contenuto"}
        </div>
        <div className="flex items-center gap-2">
          {hasJson && (
            <div className="inline-flex rounded-md border p-0.5">
              <button
                className={`px-2 py-1 text-xs rounded ${view === "text" ? "bg-secondary" : ""}`}
                onClick={() => setView("text")}
              >
                Testo
              </button>
              <button
                className={`px-2 py-1 text-xs rounded ${view === "graph" ? "bg-secondary" : ""}`}
                onClick={() => setView("graph")}
              >
                Grafico
              </button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-2">
            <Copy className="h-4 w-4" />
            Copia
          </Button>
        </div>
      </div>

      {(!hasJson || view === "text") && (
        <>
          {extraction.kind === "none" && (
            <textarea
              className="w-full max-h-[60vh] h-[50vh] rounded-md border bg-background p-3 text-sm font-mono overflow-auto"
              readOnly
              value={extraction.raw}
            />
          )}
          {extraction.kind === "full" && (
            <pre className="w-full max-h-[60vh] overflow-y-auto overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre">
              {extraction.formatted}
            </pre>
          )}
          {extraction.kind === "embedded" && (
            <div className="space-y-2">
              {extraction.prefix && (
                <textarea
                  className="w-full rounded-md border bg-background p-2 text-xs font-mono overflow-auto"
                  readOnly
                  value={extraction.prefix}
                />
              )}
              <pre className="w-full max-h-[50vh] overflow-y-auto overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre">
                {extraction.formatted}
              </pre>
              {extraction.suffix && (
                <textarea
                  className="w-full rounded-md border bg-background p-2 text-xs font-mono overflow-auto"
                  readOnly
                  value={extraction.suffix}
                />
              )}
            </div>
          )}
        </>
      )}

      {hasJson && view === "graph" && (
        <div className={isFullscreen ? "h-[calc(100vh-160px)]" : ""}>
          <JsonGraphViewer data={(extraction as any).parsed} />
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setIsFullscreen(false); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="secondary">{line?.level}</Badge>
                <span className="truncate">{line?.fileName}:{line?.lineNumber}</span>
              </DialogTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsFullscreen(true)}
                title="Schermo intero"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {line && MainContent}
        </DialogContent>
      </Dialog>

      {open && isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="h-full w-full flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary">{line?.level}</Badge>
                <span className="text-sm font-medium truncate">
                  {line?.fileName}:{line?.lineNumber}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setView("graph")}
                  className={view === "graph" ? "bg-secondary" : ""}
                >
                  Grafico
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setView("text")}
                  className={view === "text" ? "bg-secondary" : ""}
                >
                  Testo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFullscreen(false)}
                  title="Esci da schermo intero"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
              {MainContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}