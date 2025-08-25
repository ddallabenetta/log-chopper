"use client";

import * as React from "react";
import { Upload, Pin, Filter, Navigation, ArrowDownToLine, Target, ChevronUp, ChevronDown, ChevronsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { FilterConfig, FilterMode } from "./LogTypes";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  filter: FilterConfig;
  onFilterChange: (next: FilterConfig) => void;
  pinnedCount: number;
  visibleCount: number;
  totalCount: number;
  showOnlyPinned: boolean;
  onToggleShowOnlyPinned: () => void;
  onFilesSelected: (files: FileList) => void;
  pinnedIds?: string[];
  onJumpToId?: (id: string) => void;
  onJumpToLine?: (n: number) => Promise<void> | void;
  onPrevMatch?: () => void;
  onNextMatch?: () => void;
  matchesEnabled?: boolean;
  onGoToStart?: () => Promise<void> | void;
  onGoToEnd?: () => Promise<void> | void;
};

const LEVEL_OPTIONS = (t: (k: string) => string): Array<{ label: string; value: FilterConfig["level"] }> => [
  { label: t("level_all"), value: "ALL" },
  { label: t("level_trace"), value: "TRACE" },
  { label: t("level_debug"), value: "DEBUG" },
  { label: t("level_info"), value: "INFO" },
  { label: t("level_warn"), value: "WARN" },
  { label: t("level_error"), value: "ERROR" },
  { label: t("level_other"), value: "OTHER" },
];


export default function LogControls({
  filter,
  onFilterChange,
  pinnedCount,
  visibleCount,
  totalCount,
  showOnlyPinned,
  onToggleShowOnlyPinned,
  onFilesSelected,
  pinnedIds = [],
  onJumpToId,
  onJumpToLine,
  onPrevMatch,
  onNextMatch,
  matchesEnabled = false,
  onGoToStart,
  onGoToEnd,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  const [localQuery, setLocalQuery] = React.useState(filter.query);
  const [hasUncommittedSearch, setHasUncommittedSearch] = React.useState(false);

  const [jumpLine, setJumpLine] = React.useState<string>("");
  const [isJumping, setIsJumping] = React.useState<boolean>(false);

  // Track if local query differs from filter query
  React.useEffect(() => {
    setHasUncommittedSearch(localQuery !== filter.query);
  }, [localQuery, filter.query]);

  React.useEffect(() => {
    setLocalQuery(filter.query);
  }, [filter.query]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const uniquePinned = React.useMemo(() => {
    const s = new Set<string>();
    for (const raw of pinnedIds) {
      const id = typeof raw === "string" ? raw.trim() : "";
      if (id) s.add(id);
    }
    return Array.from(s).sort();
  }, [pinnedIds]);

  const commitSearch = () => {
    if (localQuery !== filter.query) {
      onFilterChange({ ...filter, query: localQuery });
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSearch();
    } else if (e.key === "Escape") {
      setLocalQuery(filter.query); // Reset to last committed search
    }
  };

  const triggerJump = async () => {
    const n = Number(jumpLine);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Inserisci un numero di riga valido");
      return;
    }
    
    setIsJumping(true);
    try {
      await onJumpToLine?.(Math.floor(n));
      setJumpLine(""); // Clear the input after successful jump
      toast.success(`Saltato alla riga ${Math.floor(n)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore durante il salto alla riga";
      toast.error(message);
    } finally {
      setIsJumping(false);
    }
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
            className="whitespace-nowrap gap-2"
            title={t("upload_logs")}
          >
            <Upload className="h-4 w-4" />
            {t("upload_logs")}
          </Button>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                ref={searchInputRef}
                placeholder={
                  filter.mode === "regex"
                    ? `${t("filter_regex_placeholder")} (Premi Enter per cercare)`
                    : `${t("filter_text_placeholder")} (Premi Enter per cercare)`
                }
                value={localQuery}
                onChange={(e) => setLocalQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className={hasUncommittedSearch ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" : ""}
              />
              {hasUncommittedSearch && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-yellow-600 dark:text-yellow-400">
                  Enter
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9"
                onClick={onPrevMatch}
                disabled={!matchesEnabled}
                title="Precedente"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-9 w-9"
                onClick={onNextMatch}
                disabled={!matchesEnabled}
                title="Successivo"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Tabs
            value={filter.mode}
            onValueChange={(v) => setMode(v as FilterMode)}
          >
            <TabsList>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="regex">Regex</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 px-2">
            <span className="text-sm text-muted-foreground">{t("case_sensitive")}</span>
            <Switch
              checked={filter.caseSensitive}
              onCheckedChange={(v) => onFilterChange({ ...filter, caseSensitive: v })}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={filter.level}
              onChange={(e) =>
                onFilterChange({ ...filter, level: e.target.value as FilterConfig["level"] })
              }
            >
              {LEVEL_OPTIONS(t).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant={showOnlyPinned ? "default" : "outline"}
            onClick={onToggleShowOnlyPinned}
            className="gap-2"
            title="Mostra solo le righe pinnate"
          >
            <Pin className="h-4 w-4" />
            {t("pinned")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">
            {(showOnlyPinned || filter.level !== "ALL" || (filter.query && filter.query.trim().length > 0)) ? "Corrispondenze" : t("totals")}: {totalCount}
          </Badge>
          <Badge>{t("visible")}: {visibleCount}</Badge>
          <Badge variant="outline">{t("pinned")}: {pinnedCount}</Badge>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-4 w-4" />
              Vai alla riga
            </label>
            <Input
              type="number"
              min={1}
              step={100}
              value={jumpLine}
              onChange={(e) => setJumpLine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isJumping) {
                  e.preventDefault();
                  void triggerJump();
                }
              }}
              className="h-8 w-28"
              placeholder="es. 100"
              disabled={isJumping}
            />
            <Button 
              variant="default" 
              size="sm" 
              className="h-8" 
              onClick={triggerJump}
              disabled={isJumping}
            >
              {isJumping ? "..." : "Vai"}
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={onGoToStart}
            title="Vai all'inizio"
          >
            <ChevronsUp className="h-4 w-4" />
            Inizio
          </Button>

          <Button
            variant="default"
            size="sm"
            className="h-8 gap-2 shadow hover:shadow-md transition-shadow"
            onClick={onGoToEnd}
            title="Fine"
          >
            <ArrowDownToLine className="h-4 w-4" />
            <span className="hidden sm:inline">Fine</span>
          </Button>
        </div>
      </div>

      {uniquePinned.length > 0 && (
        <div className="rounded-md border p-2">
          <div className="text-xs font-medium mb-1">{t("pinned")}</div>
          <div className="flex flex-wrap gap-2">
            {uniquePinned.map((id) => (
              <Button
                key={id}
                variant="outline"
                size="sm"
                className="h-7 gap-1"
                onClick={() => onJumpToId?.(id)}
                title={`Vai a ${id}`}
              >
                <Navigation className="h-3.5 w-3.5" />
                {id}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}