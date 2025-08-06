"use client";

import * as React from "react";
import { Upload, Regex, CaseSensitive, Pin, Filter, Navigation } from "lucide-react";
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
  onClearAll: () => void;
  pinnedIds?: string[];
  onJumpToId?: (id: string) => void;
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

function useDebouncedValue<T>(value: T, delay = 200) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

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
  pinnedIds = [],
  onJumpToId,
}: Props) {
  const { t } = useI18n();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [localQuery, setLocalQuery] = React.useState(filter.query);
  const debouncedQuery = useDebouncedValue(localQuery, 200);

  React.useEffect(() => {
    if (debouncedQuery !== filter.query) {
      onFilterChange({ ...filter, query: debouncedQuery });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  React.useEffect(() => {
    setLocalQuery(filter.query);
  }, [filter.query]);

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

  return (
    <div className="w-full space-y-3">
      <div className("flex flex-col sm:flex-row items-stretch sm:items-center gap-2")>
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
            {t("upload_logs")}
          </Button>
          <Button variant="secondary" onClick={onClearAll}>
            {t("clear")}
          </Button>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <Input
            placeholder={
              filter.mode === "regex"
                ? t("filter_regex_placeholder")
                : t("filter_text_placeholder")
            }
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
          />
          <Tabs
            value={filter.mode}
            onValueChange={(v) => setMode(v as FilterMode)}
          >
            <TabsList>
              <TabsTrigger value="text" className="gap-1">
                <CaseSensitive className="h-4 w-4" /> {t("text")}
              </TabsTrigger>
              <TabsTrigger value="regex" className="gap-1">
                <Regex className="h-4 w-4" /> {t("regex")}
              </TabsTrigger>
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

      <div className="flex items-center gap-2 text-sm">
        <Badge variant="secondary">{t("totals")}: {totalCount}</Badge>
        <Badge>{t("visible")}: {visibleCount}</Badge>
        <Badge variant="outline">{t("pinned")}: {pinnedCount}</Badge>
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