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
  onLoadMoreTop?: () => void; // lazy load verso l'alto
  jumpToId?: string | null; // richiesta di jump esterna
  onAfterJump?: () => void; // reset richiesta jump
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

  // Altezza riga stimata per virtualizzazione
  const rowHeight = 22; // px, semplice stima
  const overscan = 20; // righe extra sopra/sotto

  const [viewport, setViewport] = React.useState({ height: 0, scrollTop: 0 });
  const [didInitScrollBottom, setDidInitScrollBottom] = React.useState(false);

  // Setup scroll e observer
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      setViewport({ height: el.clientHeight, scrollTop: el.scrollTop });

      // Lazy load verso l'alto
      if (onLoadMoreTop && el.scrollTop < 50) {
        onLoadMoreTop();
      }
    };

    setViewport({ height: el.clientHeight, scrollTop: el.scrollTop });
    el.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => {
      setViewport({ height: el.clientHeight, scrollTop: el.scrollTop });
    });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [onLoadMoreTop]);

  // Scroll iniziale in basso per mostrare le righe più recenti
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitScrollBottom && filtered.length > 0) {
      el.scrollTop = el.scrollHeight;
      setDidInitScrollBottom(true);
      setViewport({ height: el.clientHeight, scrollTop: el.scrollTop });
    }
  }, [filtered.length, didInitScrollBottom]);

  // Jump a una riga specifica
  React.useEffect(() => {
    if (!jumpToId) return;
    const el = containerRef.current;
    if (!el) return;

    const idx = filtered.findIndex((l) => l.id === jumpToId);
    if (idx >= 0) {
      const targetTop = idx * rowHeight - viewport.height / 2;
      el.scrollTop = Math.max(0, targetTop);
      setViewport({ height: el.clientHeight, scrollTop: el.scrollTop });
    }
    onAfterJump && onAfterJump();
  }, [jumpToId, filtered, onAfterJump, viewport.height]);

  // Virtualizzazione base
  const total = filtered.length;
  const startIndex = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    total,
    Math.ceil((viewport.scrollTop + viewport.height) / rowHeight) + overscan
  );
  const items = filtered.slice(startIndex, endIndex);

  const offsetY = startIndex * rowHeight;
  const totalHeight = total * rowHeight;

  return (
    <div className="rounded border bg-card h-full">
      <div ref={containerRef} className="h-full overflow-auto relative">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nessun risultato.</div>
        ) : (
          <div style={{ height: totalHeight + "px", position: "relative" }}>
            <div style={{ position: "absolute", top: offsetY + "px", left: 0, right: 0 }}>
              {items.map((line, i) => {
                const isEven = (startIndex + i) % 2 === 0;
                return (
                  <div
                    key={line.id}
                    className={isEven ? "bg-muted/30" : "bg-transparent"}
                    data-row-id={line.id}
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
          </div>
        )}
      </div>
    </div>
  );
}