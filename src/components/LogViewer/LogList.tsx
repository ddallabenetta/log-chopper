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
  onLoadMoreTop?: () => void;
  jumpToId?: string | null;
  onAfterJump?: () => void;
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
  onLoadMoreTop,
  jumpToId,
  onAfterJump,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

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

  // Scroll all'inizio: vai in fondo al primo popolamento
  const didInitScrollBottomRef = React.useRef(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitScrollBottomRef.current && filtered.length > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - el.clientHeight;
        didInitScrollBottomRef.current = true;
      });
    }
  }, [filtered.length]);

  // Se arrivano nuove righe (incremento lunghezza), resta agganciato al fondo
  const prevLenRef = React.useRef(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (filtered.length > prevLenRef.current) {
      const atBottom = Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) < 8;
      if (atBottom || prevLenRef.current === 0) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - el.clientHeight;
        });
      }
    }
    prevLenRef.current = filtered.length;
  }, [filtered.length]);

  // Caricamento top-on-scroll (se fornito)
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !onLoadMoreTop) return;
    const onScroll = () => {
      if (el.scrollTop < 50) onLoadMoreTop();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [onLoadMoreTop]);

  // Jump a id
  React.useEffect(() => {
    if (!jumpToId) return;
    const el = containerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(jumpToId)}"]`);
    if (target) {
      const top = target.offsetTop - el.clientHeight / 2;
      el.scrollTo({ top: Math.max(0, top) });
    }
    onAfterJump && onAfterJump();
  }, [jumpToId, onAfterJump]);

  // Espone globalmente il container per lo scroll “Vai in fondo”
  React.useEffect(() => {
    (window as any).__LOG_LIST_CONTAINER__ = containerRef.current;
  }, []);

  const lastId = filtered.length > 0 ? filtered[filtered.length - 1]?.id : null;

  return (
    <div className="rounded border bg-card h-full min-h-0 flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{ contain: "content" }}
      >
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nessun risultato.</div>
        ) : (
          <div>
            {filtered.map((line, idx) => {
              const isEven = idx % 2 === 0;
              const renderKey = `${line.id}__${idx}`;
              const isLast = lastId === line.id;
              return (
                <div
                  key={renderKey}
                  className={isEven ? "bg-muted/30" : "bg-transparent"}
                  data-row-id={line.id}
                  id={isLast ? "log-last-row" : undefined}
                >
                  <LogLineItem
                    line={line}
                    isPinned={pinned.has(line.id)}
                    onTogglePin={onTogglePin}
                    highlightRanges={highlightMap.get(line.id) ?? []}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}