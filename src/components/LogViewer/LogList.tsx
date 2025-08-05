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

  const rowHeight = 22;
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

    // init
    scheduleSetViewport(el);

    el.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => {
      // Aggiorna solo se l’altezza cambia realmente
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

  const didInitScrollBottomRef = React.useRef(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitScrollBottomRef.current && filtered.length > 0) {
      const nextTop = el.scrollHeight;
      if (el.scrollTop !== nextTop) {
        el.scrollTop = nextTop;
        scheduleSetViewport(el);
      }
      didInitScrollBottomRef.current = true;
    }
  }, [filtered.length, scheduleSetViewport]);

  React.useEffect(() => {
    if (!jumpToId) return;
    const el = containerRef.current;
    if (!el) return;

    const idx = filtered.findIndex((l) => l.id === jumpToId);
    if (idx >= 0) {
      const targetTop = idx * rowHeight - viewport.height / 2;
      const nextTop = Math.max(0, targetTop);
      if (el.scrollTop !== nextTop) {
        el.scrollTop = nextTop;
        scheduleSetViewport(el);
      }
    }
    onAfterJump && onAfterJump();
  }, [jumpToId, filtered, onAfterJump, viewport.height, scheduleSetViewport]);

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
    <div ref={outerRef} className="rounded border bg-card h-full min-h-0">
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