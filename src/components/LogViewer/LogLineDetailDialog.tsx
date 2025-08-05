"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { LogLine } from "./LogTypes";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  line: LogLine | null;
};

type JsonExtraction =
  | { kind: "none"; raw: string }
  | { kind: "full"; formatted: string }
  | { kind: "embedded"; prefix: string; formatted: string; suffix: string };

/**
 * Estrae il primo blocco JSON valido ({} o []) presente nella stringa.
 * Gestisce stringhe con escape e virgolette per evitare di contare parentesi dentro stringhe.
 */
function extractFirstJsonBlock(raw: string): JsonExtraction {
  const s = raw.trim();

  // 1) Se l'intera stringa è JSON valido
  try {
    const parsed = JSON.parse(s);
    return { kind: "full", formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    // continua
  }

  // 2) Cerca primo '{' o '[' nel testo grezzo
  const openIdxObj = raw.indexOf("{");
  const openIdxArr = raw.indexOf("[");
  const candidates = [openIdxObj, openIdxArr].filter((i) => i >= 0).sort((a, b) => a - b);
  if (candidates.length === 0) {
    return { kind: "none", raw };
  }

  // 3) Prova a partire da ciascun candidato (es. se il primo fallisce, tenta il successivo)
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
          // Candidato blocco
          const jsonSlice = raw.slice(openIdx, i + 1);
          try {
            const parsed = JSON.parse(jsonSlice);
            return {
              kind: "embedded",
              prefix: raw.slice(0, openIdx).trimEnd(),
              formatted: JSON.stringify(parsed, null, 2),
              suffix: raw.slice(i + 1).trimStart(),
            };
          } catch {
            // JSON non valido: interrompe e si passa al prossimo candidato
            break;
          }
        }
      }
    }
  }

  // 4) Nessun blocco JSON valido trovato
  return { kind: "none", raw };
}

export default function LogLineDetailDialog({ open, onOpenChange, line }: Props) {
  const contentRef = React.useRef<HTMLTextAreaElement | HTMLPreElement | null>(null);

  const extraction = React.useMemo<JsonExtraction>(() => {
    if (!line) return { kind: "none", raw: "" };
    return extractFirstJsonBlock(line.content);
  }, [line]);

  const copyToClipboard = async () => {
    if (!line) return;
    await navigator.clipboard.writeText(line.content);
    toast.success("Contenuto copiato");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="secondary">{line?.level}</Badge>
            <span className="truncate">{line?.fileName}:{line?.lineNumber}</span>
          </DialogTitle>
        </DialogHeader>
        {line && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">ID: {line.id}</div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                Contenuto {extraction.kind === "none" ? "" : "(JSON formattato rilevato)"}
              </div>
              <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-2">
                <Copy className="h-4 w-4" />
                Copia
              </Button>
            </div>

            {extraction.kind === "none" && (
              <textarea
                ref={contentRef as React.RefObject<HTMLTextAreaElement>}
                className="w-full max-h-[60vh] h-[50vh] rounded-md border bg-background p-3 text-sm font-mono overflow-auto"
                readOnly
                value={extraction.raw}
              />
            )}

            {extraction.kind === "full" && (
              <pre
                ref={contentRef as React.RefObject<HTMLPreElement>}
                className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre"
              >
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
                <pre
                  className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre"
                >
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}