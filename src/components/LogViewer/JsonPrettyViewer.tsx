"use client";

import * as React from "react";

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

function ValueToken({ value }: { value: unknown }) {
  const t = getType(value);
  if (t === "string") {
    return <span className="text-green-600 dark:text-green-400 break-words">"{String(value)}"</span>;
  }
  if (t === "number") {
    return <span className="text-orange-600 dark:text-amber-400">{String(value)}</span>;
  }
  if (t === "boolean") {
    return <span className="text-blue-700 dark:text-blue-400">{String(value)}</span>;
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
};

function CollapsibleNode({ value, depth, k, indent, initiallyCollapsed }: CollapsibleNodeProps) {
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
            <span className="text-sky-700 dark:text-sky-300 break-words">"{k}"</span>
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
              <span className="text-sky-700 dark:text-sky-300 break-words">"{k}"</span>
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
          <span className="text-sky-700 dark:text-sky-300 break-words">"{k}"</span>
          <span className="text-muted-foreground">: </span>
        </>
      )}
      <ValueToken value={value} />
    </div>
  );
}

export default function JsonPrettyViewer({ data, className, initiallyCollapsed = false, indent = 12 }: Props) {
  return (
    <div className={["w-full rounded-md border bg-background p-3 font-mono text-[13px] overflow-auto", className].filter(Boolean).join(" ")}>
      <CollapsibleNode value={data as any} depth={0} indent={indent} initiallyCollapsed={initiallyCollapsed} />
    </div>
  );
}