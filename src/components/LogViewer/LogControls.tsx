"use client";

import * as React from "react";
import { Upload, Regex, CaseSensitive, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { FilterConfig, FilterMode } from "./LogTypes";

type Props = {
  filter: FilterConfig;
  onFilterChange: (next: FilterConfig) => void;
  pinnedCount: number;
  visibleCount: number;
  totalCount: number;
  showOnlyPinned: boolean;
  onToggleShowOnlyPinned: () => void;
  onFilesSelected: (files: FileList) => void;
  onClearAll: () => void;
};

export default function LogControls({
  filter,
  onFilterChange,
  pinnedCount,
  visibleCount,
  totalCount,
  showOnlyPinned,
  onToggleShowOnlyPinned,
  onFilesSelected,
  onClearAll,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      toast.success(`${e.target.files.length} file caricati`);
      e.target.value = "";
    }
  };

  const setMode = (mode: FilterMode) => {
    onFilterChange({ ...filter, mode });
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,text/plain"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <Button
            variant="default"
            onClick={() => fileInputRef.current?.click()}
            className="whitespace-nowrap"
          >
            <Upload className="mr-2 h-4 w-4" />
            Carica log
          </Button>
          <Button variant="secondary" onClick={onClearAll}>
            Svuota
          </Button>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <Input
            placeholder={
              filter.mode === "regex"
                ? "Filtra per regex (es: error|warn)"
                : "Filtra per testo (es: error)"
            }
            value={filter.query}
            onChange={(e) => onFilterChange({ ...filter, query: e.target.value })}
          />
          <Tabs
            value={filter.mode}
            onValueChange={(v) => setMode(v as FilterMode)}
          >
            <TabsList>
              <TabsTrigger value="text" className="gap-1">
                <CaseSensitive className="h-4 w-4" /> Testo
              </TabsTrigger>
              <TabsTrigger value="regex" className="gap-1">
                <Regex className="h-4 w-4" /> Regex
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 px-2">
            <span className="text-sm text-muted-foreground">Case sensitive</span>
            <Switch
              checked={filter.caseSensitive}
              onCheckedChange={(v) => onFilterChange({ ...filter, caseSensitive: v })}
            />
          </div>
          <Button
            variant={showOnlyPinned ? "default" : "outline"}
            onClick={onToggleShowOnlyPinned}
            className="gap-2"
            title="Mostra solo le righe pinnate"
          >
            <Pin className="h-4 w-4" />
            Pinned
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary">Totali: {totalCount}</Badge>
        <Badge>Visibili: {visibleCount}</Badge>
        <Badge variant="outline">Pinned: {pinnedCount}</Badge>
      </div>
    </div>
  );
}