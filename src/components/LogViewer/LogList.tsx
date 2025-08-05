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
  const outerRef = React.useRef<HTMLDivElement | null>(null);
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

  // Misura dinamicamente l'altezza riga, di default 22 per fallback
  const [rowHeight, setRowHeight] = React.useState<number>(22);
  const measureRef = React.useRef<HTMLDivElement | null>(null);

  // Render di misura: mostra fino a 3 righe per avere una media stabile
  const measureItems = React.useMemo(() => filtered.slice(0, Math.min(3, filtered.length)), [filtered]);

  React.useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    // Usa rAF per assicurarsi che il layout sia pronto
    const id = requestAnimationFrame(() => {
      const children = Array.from(el.children) as HTMLElement[];
      if (children.length > 0) {
        const heights = children.map((c) => c.offsetHeight);
        const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
        const next = Math.max(1, Math.round(avg)); // evita zero o frazioni
        if (Math.abs(next - rowHeight) >= 1) {
          setRowHeight(next);
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [measureItems.length, filter.query, filter.mode, filter.caseSensitive]);

  const overscan = 20;

  const [viewport, setViewport] = React.useState({ height: 0, scrollTop: 0 });
  const setViewportSafe = React.useCallback((next: { height: number; scrollTop: number }) => {
    setViewport((prev) => {
      if (prev.height === next.height && prev.scrollTop === next.scrollTop) return prev;
      return next;
    });
  }, []);

  const rafIdRef = React.useRef<number | null>(null);
  const scheduleSetViewport = React.useCallback((el: HTMLElement) => {
    if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const next = { height: el.clientHeight, scrollTop: el.scrollTop };
      setViewportSafe(next);
    });
  }, [setViewportSafe]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      scheduleSetViewport(el);
      if (onLoadMoreTop && el.scrollTop < 50) onLoadMoreTop();
    };

    scheduleSetViewport(el);

    el.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h !== viewport.height) scheduleSetViewport(el);
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [onLoadMoreTop, scheduleSetViewport, viewport.height]);

  React.useEffect(() => {
    const outer = outerRef.current;
    const el = containerRef.current;
    if (!outer || !el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h !== viewport.height) scheduleSetViewport(el);
    });
    ro.observe(outer);
    return () => ro.disconnect();
  }, [scheduleSetViewport, viewport.height]);

  // Calcolo offset costante tra scrollHeight e altezza totale calcolata (padding/bordi)
  const total = filtered.length;
  const totalHeight = total * rowHeight;
  const containerPaddingOffset = React.useMemo(() => {
    const el = containerRef.current;
    if (!el) return 0;
    const diff = el.scrollHeight - totalHeight;
    return Number.isFinite(diff) ? diff : 0;
  }, [totalHeight]);

  // Scroll iniziale in fondo: usa scrollHeight - clientHeight, nel prossimo frame
  const didInitScrollBottomRef = React.useRef(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitScrollBottomRef.current && total > 0) {
      requestAnimationFrame(() => {
        const target = Math.max(0, el.scrollHeight - el.clientHeight);
        if (Math.abs(el.scrollTop - target) > 1) {
          el.scrollTop = target;
          scheduleSetViewport(el);
        }
        didInitScrollBottomRef.current = true;
      });
    }
  }, [total, scheduleSetViewport, rowHeight]);

  // Jump to id compensando l’offset e usando l'altezza reale
  React.useEffect(() => {
    if (!jumpToId) return;
    const el = containerRef.current;
    if (!el) return;

    const idx = filtered.findIndex((l) => l.id === jumpToId);
    if (idx >= 0) {
      const targetTop = idx * rowHeight - viewport.height / 2 + containerPaddingOffset;
      const nextTop = Math.max(0, targetTop);
      if (Math.abs(el.scrollTop - nextTop) > 1) {
        el.scrollTop = nextTop;
        scheduleSetViewport(el);
      }
    }
    onAfterJump && onAfterJump();
  }, [jumpToId, filtered, onAfterJump, viewport.height, containerPaddingOffset, scheduleSetViewport, rowHeight]);

  const startIndex = Math.max(0, Math.floor(viewport.scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    total,
    Math.ceil((viewport.scrollTop + viewport.height) / rowHeight) + overscan
  );
  const items = filtered.slice(startIndex, endIndex);

  const offsetY = startIndex * rowHeight;

  return (
    <div ref={outerRef} className="rounded border bg-card h-full min-h-0">
      {/* area invisibile per misurare l'altezza reale di una riga */}
      <div
        ref={measureRef}
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", height: 0, overflow: "hidden" }}
      >
        {measureItems.map((line) => (
          <div key={`measure-${line.id}`}>
            <LogLineItem
              line={line}
              isPinned={pinned.has(line.id)}
              onTogglePin={() => {}}
              highlightRanges={highlightMap.get(line.id) ?? []}
            />
          </div>
        ))}
      </div>

      <div ref={containerRef} className="h-full min-h-0 overflow-auto relative">
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