"use client";

import * as React from "react";
import LogLineItem from "./LogLineItem";
import type { LogLine, FilterConfig } from "./LogTypes";

type Props = {
  lines: LogLine[];
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
  filter: FilterConfig;
  showOnlyPinned: boolean;
};

function buildMatcher(filter: FilterConfig): ((text: string) => { match: boolean; ranges: { start: number; end: number }[] }) {
  if (!filter.query) {
    return () => ({ match: true, ranges: [] });
  }
  if (filter.mode === "regex") {
    try {
      const flags = filter.caseSensitive ? "g" : "gi";
      const re = new RegExp(filter.query, flags);
      return (text: string) => {
        const ranges: { start: number; end: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const start = m.index;
          const end = start + (m[0]?.length ?? 0);
          if (end > start) ranges.push({ start, end });
          if (m[0]?.length === 0) re.lastIndex++;
        }
        return { match: ranges.length > 0, ranges };
      };
    } catch {
      return () => ({ match: false, ranges: [] });
    }
  }
  return (text: string) => {
    const ranges: { start: number; end: number }[] = [];
    const haystack = filter.caseSensitive ? text : text.toLowerCase();
    const needle = filter.caseSensitive ? filter.query : filter.query.toLowerCase();
    let from = 0;
    while (true) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1 || needle.length === 0) break;
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + needle.length;
    }
    return { match: ranges.length > 0 || filter.query.length === 0, ranges };
  };
}

export default function LogList({
  lines,
  pinned,
  onTogglePin,
  filter,
  showOnlyPinned,
}: Props) {
  const matcher = React.useMemo(() => buildMatcher(filter), [filter]);

  const passesLevel = React.useCallback(
    (lvl: LogLine["level"]) => (filter.level === "ALL" ? true : lvl === filter.level),
    [filter.level]
  );

  const filtered = React.useMemo(() => {
    return lines.filter((l) => {
      if (showOnlyPinned) return pinned.has(l.id);
      if (!passesLevel(l.level) && !pinned.has(l.id)) return false;
      const res = matcher(l.content);
      return res.match || pinned.has(l.id);
    });
  }, [lines, matcher, pinned, showOnlyPinned, passesLevel]);

  const highlightMap = React.useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    if (!showOnlyPinned || filter.query) {
      for (const l of filtered) {
        const { ranges } = matcher(l.content);
        if (ranges.length > 0) map.set(l.id, ranges);
      }
    }
    return map;
  }, [filtered, matcher, showOnlyPinned, filter.query]);

  return (
    <div className="rounded border bg-card h-full">
      <div className="h-full overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nessun risultato.</div>
        ) : (
          filtered.map((line) => (
            <LogLineItem
              key={line.id}
              line={line}
              isPinned={pinned.has(line.id)}
              onTogglePin={onTogglePin}
              highlightRanges={highlightMap.get(line.id) ?? []}
            />
          ))
        )}
      </div>
    </div>
  );
}