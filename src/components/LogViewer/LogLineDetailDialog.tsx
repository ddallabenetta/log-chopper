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

function tryFormatJson(raw: string): { isJson: boolean; formatted: string } {
  // Heuristica: cerca primo e ultimo blocco JSON al volo
  // Se l’intera stringa è JSON valido, la formattiamo; altrimenti mostriamo testo grezzo.
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed);
    return { isJson: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    return { isJson: false, formatted: raw };
  }
}

export default function LogLineDetailDialog({ open, onOpenChange, line }: Props) {
  const contentRef = React.useRef<HTMLTextAreaElement | HTMLPreElement | null>(null);

  const formatted = React.useMemo(() => {
    if (!line) return { isJson: false, formatted: "" };
    return tryFormatJson(line.content);
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
            <div className="text-xs text-muted-foreground">
              ID: {line.id}
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                Contenuto {formatted.isJson ? "(JSON formattato)" : ""}
              </div>
              <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-2">
                <Copy className="h-4 w-4" />
                Copia
              </Button>
            </div>
            {formatted.isJson ? (
              <pre
                ref={contentRef as React.RefObject<HTMLPreElement>}
                className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre"
              >
                {formatted.formatted}
              </pre>
            ) : (
              <textarea
                ref={contentRef as React.RefObject<HTMLTextAreaElement>}
                className="w-full max-h-[60vh] h-[50vh] rounded-md border bg-background p-3 text-sm font-mono overflow-auto"
                readOnly
                value={line.content}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}