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
import JsonPrettyViewer, { JsonPrettyViewerHandle } from "./JsonPrettyViewer";

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

function levelDotClass(level: LogLine["level"]) {
  switch (level) {
    case "ERROR":
      return "bg-red-500";
    case "WARN":
      return "bg-yellow-500";
    case "INFO":
      return "bg-blue-500";
    case "DEBUG":
      return "bg-emerald-500";
    case "TRACE":
      return "bg-purple-500";
    default:
      return "bg-gray-400";
  }
}

export default function LogLineDetailDialog({ open, onOpenChange, line }: Props) {
  const [view, setView] = React.useState<"text" | "pretty" | "graph">("text");
  const [fullscreen, setFullscreen] = React.useState(false);
  const prettyRef = React.useRef<JsonPrettyViewerHandle | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setView("text");
    setFullscreen(false);
  }, [open, line?.id]);

  const extraction = React.useMemo<JsonExtraction>(() => {
    if (!line) return { kind: "none", raw: "" };
    return extractFirstJsonBlock(line.content);
  }, [line]);

  const copyToClipboard = async () => {
    if (!line) return;
    // Se siamo in vista Pretty e abbiamo JSON, copia solo il JSON
    if (view === "pretty" && extraction.kind !== "none") {
      const jsonStr = prettyRef.current?.getFormattedJson?.() || (extraction as any).formatted || "";
      if (jsonStr) {
        await navigator.clipboard.writeText(jsonStr);
        toast.success("JSON copiato");
        return;
      }
    }
    // Altrimenti copia il contenuto completo della riga (fallback)
    await navigator.clipboard.writeText(line.content);
    toast.success("Contenuto copiato");
  };

  const hasJson = extraction.kind !== "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={[
          "flex flex-col min-h-0 gap-3",
          fullscreen ? "w-screen h-screen max-w-none p-3" : "sm:max-w-3xl"
        ].join(" ")}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {line && <span className={`inline-block h-2.5 w-2.5 rounded-full ${levelDotClass(line.level)}`} aria-hidden />}
            <Badge variant="secondary">{line?.level}</Badge>
            <span className="truncate">{line?.fileName}:{line?.lineNumber}</span>
          </DialogTitle>
        </DialogHeader>

        {line && (
          <div className={["space-y-3", fullscreen ? "flex-1 min-h-0 flex flex-col" : ""].join(" ")}>
            <div className="text-xs text-muted-foreground">ID: {line.id}</div>
            <Separator />

            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {hasJson ? (view === "pretty" ? "Contenuto (JSON colorato)" : view === "graph" ? "Contenuto (grafico)" : "Contenuto") : "Contenuto"}
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
                      className={`px-2 py-1 text-xs rounded ${view === "pretty" ? "bg-secondary" : ""}`}
                      onClick={() => setView("pretty")}
                      title="JSON con colori e collapse"
                    >
                      Pretty
                    </button>
                    <button
                      className={`px-2 py-1 text-xs rounded ${view === "graph" ? "bg-secondary" : ""}`}
                      onClick={() => setView("graph")}
                    >
                      Grafico
                    </button>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFullscreen((v) => !v)}
                  className="gap-2"
                  title={fullscreen ? "Esci da schermo intero" : "Schermo intero"}
                >
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  {fullscreen ? "Riduci" : "Schermo intero"}
                </Button>
                <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-2">
                  <Copy className="h-4 w-4" />
                  {view === "pretty" && hasJson ? "Copia JSON" : "Copia"}
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

            {hasJson && view === "pretty" && (
              <div className={fullscreen ? "flex-1 min-h-0" : ""}>
                <JsonPrettyViewer
                  ref={prettyRef}
                  data={(extraction as any).parsed}
                  className={fullscreen ? "h-full" : "max-h-[60vh]"}
                  initiallyCollapsed={false}
                />
              </div>
            )}

            {hasJson && view === "graph" && (
              <div className={fullscreen ? "flex-1 min-h-0" : ""}>
                <JsonGraphViewer data={(extraction as any).parsed} className={fullscreen ? "h-full" : undefined} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}