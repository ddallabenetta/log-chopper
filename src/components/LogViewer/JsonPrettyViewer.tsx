"use client";

import * as React from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

export type JsonPrettyViewerHandle = {
  getFormattedJson: () => string;
};

type Props = {
  data: unknown;
  className?: string;
  initiallyCollapsed?: boolean;
  indent?: number;
};

type NodeType = "object" | "array" | "string" | "number" | "boolean" | "null" | "unknown";

function getType(v: unknown): NodeType {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (Array.isArray(v)) return "array";
  if (t === "object") return "object";
  return "unknown";
}

const BRACKET_COLORS = [
  "text-emerald-500",
  "text-blue-500",
  "text-fuchsia-500",
  "text-amber-500",
  "text-cyan-500",
  "text-rose-500",
];

function Bracket({ ch, depth }: { ch: "{" | "}" | "[" | "]"; depth: number }) {
  const color = BRACKET_COLORS[depth % BRACKET_COLORS.length];
  return <span className={color}>{ch}</span>;
}

function highlightText(text: string, query: string) {
  if (!query) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  const hay = text;
  const needle = query.toLowerCase();
  let from = 0;
  while (true) {
    const idx = hay.toLowerCase().indexOf(needle, from);
    if (idx === -1) break;
    if (idx > from) parts.push(<span key={`t-${from}`}>{hay.slice(from, idx)}</span>);
    parts.push(
      <span key={`h-${idx}`} className="bg-yellow-200 dark:bg-yellow-600/40 rounded-sm">
        {hay.slice(idx, idx + needle.length)}
      </span>
    );
    from = idx + needle.length;
  }
  if (from < hay.length) parts.push(<span key={`t-end-${from}`}>{hay.slice(from)}</span>);
  return <>{parts}</>;
}

function ValueToken({ value, query }: { value: unknown; query: string }) {
  const t = getType(value);
  if (t === "string") {
    const s = String(value);
    return <span className="text-green-600 dark:text-green-400 break-words">"{highlightText(s, query)}"</span>;
  }
  if (t === "number") {
    const s = String(value);
    return <span className="text-orange-600 dark:text-amber-400">{highlightText(s, query)}</span>;
  }
  if (t === "boolean") {
    const s = String(value);
    return <span className="text-blue-700 dark:text-blue-400">{highlightText(s, query)}</span>;
  }
  if (t === "null") {
    return <span className="text-purple-600 dark:text-purple-400">null</span>;
  }
  return <span className="text-foreground/90">{String(value)}</span>;
}

type CollapsibleNodeProps = {
  value: any;
  depth: number;
  k?: string;
  indent: number;
  initiallyCollapsed: boolean;
  query: string;
};

function CollapsibleNode({ value, depth, k, indent, initiallyCollapsed, query }: CollapsibleNodeProps) {
  const type = getType(value);
  const [collapsed, setCollapsed] = React.useState(initiallyCollapsed && (type === "object" || type === "array"));

  if (type === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const isEmpty = entries.length === 0;
    return (
      <div className="leading-6">
        <div className="flex items-start gap-1">
          <button
            className="mt-0.5 select-none text-xs px-1 rounded hover:bg-accent"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Espandi" : "Comprimi"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          {k !== undefined && (
            <span className="text-sky-700 dark:text-sky-300 break-words">"{highlightText(k, query)}"</span>
          )}
          {k !== undefined && <span className="text-muted-foreground">: </span>}
          <Bracket ch="{" depth={depth} />
          {isEmpty && <Bracket ch="}" depth={depth} />}
        </div>
        {!isEmpty && !collapsed && (
          <div className="pl-4" style={{ marginLeft: indent }}>
            {entries.map(([key, val], idx) => (
              <div key={key + idx} className="flex">
                <CollapsibleNode
                  value={val}
                  depth={depth + 1}
                  k={key}
                  indent={indent}
                  initiallyCollapsed={initiallyCollapsed}
                  query={query}
                />
                {idx < entries.length - 1 && <span className="text-muted-foreground">,</span>}
              </div>
            ))}
          </div>
        )}
        {!isEmpty && (
          <div className="flex items-center gap-1" style={{ marginLeft: indent }}>
            <Bracket ch="}" depth={depth} />
          </div>
        )}
      </div>
    );
  }

  if (type === "array") {
    const arr = value as unknown[];
    const isEmpty = arr.length === 0;
    return (
      <div className="leading-6">
        <div className="flex items-start gap-1">
          <button
            className="mt-0.5 select-none text-xs px-1 rounded hover:bg-accent"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Espandi" : "Comprimi"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
          {k !== undefined && (
            <>
              <span className="text-sky-700 dark:text-sky-300 break-words">"{highlightText(k, query)}"</span>
              <span className="text-muted-foreground">: </span>
            </>
          )}
          <Bracket ch="[" depth={depth} />
          {isEmpty && <Bracket ch="]" depth={depth} />}
        </div>
        {!isEmpty && !collapsed && (
          <div className="pl-4" style={{ marginLeft: indent }}>
            {arr.map((val, idx) => (
              <div key={idx} className="flex">
                <CollapsibleNode
                  value={val}
                  depth={depth + 1}
                  indent={indent}
                  initiallyCollapsed={initiallyCollapsed}
                  query={query}
                />
                {idx < arr.length - 1 && <span className="text-muted-foreground">,</span>}
              </div>
            ))}
          </div>
        )}
        {!isEmpty && (
          <div className="flex items-center gap-1" style={{ marginLeft: indent }}>
            <Bracket ch="]" depth={depth} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="leading-6">
      {k !== undefined && (
        <>
          <span className="text-sky-700 dark:text-sky-300 break-words">"{highlightText(k, query)}"</span>
          <span className="text-muted-foreground">: </span>
        </>
      )}
      <ValueToken value={value} query={query} />
    </div>
  );
}

function useDebounced<T>(val: T, delay = 200) {
  const [v, setV] = React.useState(val);
  React.useEffect(() => {
    const id = setTimeout(() => setV(val), delay);
    return () => clearTimeout(id);
  }, [val, delay]);
  return v;
}

const JsonPrettyViewer = React.forwardRef<JsonPrettyViewerHandle, Props>(function JsonPrettyViewer(
  { data, className, initiallyCollapsed = false, indent = 12 }: Props,
  ref
) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const debounced = useDebounced(query, 200);
  const formatted = React.useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "";
    }
  }, [data]);

  React.useImperativeHandle(ref, () => ({
    getFormattedJson: () => formatted,
  }), [formatted]);

  return (
    <div className={["w-full rounded-md border bg-background p-3 font-mono text-[13px] overflow-auto space-y-3", className].filter(Boolean).join(" ")}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder={t("filter_text_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        />
        {query && (
          <button
            className="h-8 px-2 rounded-md border text-xs"
            onClick={() => setQuery("")}
            title={t("clear")}
          >
            {t("clear")}
          </button>
        )}
      </div>
      <div>
        <CollapsibleNode
          value={data as any}
          depth={0}
          indent={indent}
          initiallyCollapsed={initiallyCollapsed}
          query={debounced}
        />
      </div>
    </div>
  );
});

export default JsonPrettyViewer;