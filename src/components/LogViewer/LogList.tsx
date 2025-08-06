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

const MemoLineItem = React.memo(LogLineItem);

function buildMatcher(filter: FilterConfig): ((text: string) => { match: boolean; ranges: { start: number; end: number }[] }) {
  if (!filter.query) return () => ({ match: true, ranges: [] });
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
    if (needle.length === 0) return { match: true, ranges: [] };
    let from = 0;
    while (true) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + needle.length;
    }
    return { match: ranges.length > 0, ranges };
  };
}

function useRafThrottle<T extends (...args: any[]) => void>(fn: T) {
  const ref = React.useRef<number | null>(null);
  const lastArgs = React.useRef<any[]>([]);
  const saved = React.useRef(fn);
  React.useEffect(() => {
    saved.current = fn;
  }, [fn]);
  const throttled = React.useCallback((...args: any[]) => {
    lastArgs.current = args;
    if (ref.current != null) return;
    ref.current = requestAnimationFrame(() => {
      ref.current = null;
      saved.current(...(lastArgs.current as any[]));
    });
  }, []);
  return throttled as T;
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

  const [expandedMap, setExpandedMap] = React.useState<Map<string, boolean>>(() => new Map());
  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedMap((prev) => {
      const next = new Map(prev);
      next.set(id, !next.get(id));
      return next;
    });
  }, []);

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

  const ROW_H = 34;
  const OVERSCAN = 12;

  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(0);
  const [followBottom, setFollowBottom] = React.useState(true);

  const handleScroll = useRafThrottle(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const atBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) <= 24;
    setFollowBottom(atBottom);
  });

  const handleResize = useRafThrottle(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
  });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    handleResize();
    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleScroll, handleResize]);

  const didInitScrollBottomRef = React.useRef(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitScrollBottomRef.current && filtered.length > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - el.clientHeight;
        didInitScrollBottomRef.current = true;
        setFollowBottom(true);
      });
    }
  }, [filtered.length]);

  const prevLenRef = React.useRef(0);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (filtered.length > prevLenRef.current && followBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      });
    }
    prevLenRef.current = filtered.length;
  }, [filtered.length, followBottom]);

  const loadingTopRef = React.useRef(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !onLoadMoreTop) return;
    const onScrollTop = () => {
      if (loadingTopRef.current) return;
      if (el.scrollTop <= 40) {
        loadingTopRef.current = true;
        Promise.resolve(onLoadMoreTop()).finally(() => {
          requestAnimationFrame(() => {
            loadingTopRef.current = false;
          });
        });
      }
    };
    el.addEventListener("scroll", onScrollTop, { passive: true });
    return () => el.removeEventListener("scroll", onScrollTop);
  }, [onLoadMoreTop]);

  React.useEffect(() => {
    if (!jumpToId) return;
    const el = containerRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(jumpToId)}"]`);
    if (target) {
      const top = target.offsetTop - el.clientHeight / 2;
      el.scrollTo({ top: Math.max(0, top) });
      setFollowBottom(false);
    }
    onAfterJump && onAfterJump();
  }, [jumpToId, onAfterJump]);

  React.useEffect(() => {
    (window as any).__LOG_LIST_CONTAINER__ = containerRef.current;
    (window as any).__LOG_LIST_SCROLL_TO_BOTTOM__ = () => {
      const el = containerRef.current;
      if (!el) return;
      const sentinel = el.querySelector("#log-bottom-sentinel") as HTMLElement | null;
      if (sentinel) {
        el.scrollTo({ top: sentinel.offsetTop - (el.clientHeight - sentinel.clientHeight), behavior: "smooth" });
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
      setFollowBottom(true);
    };
  }, []);

  const total = filtered.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.max(0, Math.ceil((viewportH || 1) / ROW_H) + OVERSCAN * 2);
  const endIndex = Math.min(total, startIndex + visibleCount);

  const topPad = startIndex * ROW_H;
  const bottomPad = Math.max(0, (total - endIndex) * ROW_H);

  const slice = React.useMemo(() => filtered.slice(startIndex, endIndex), [filtered, startIndex, endIndex]);
  const lastId = slice.length > 0 ? slice[slice.length - 1]?.id : null;

  const sliceHighlightMap = React.useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    if (!showOnlyPinned || filter.query) {
      for (const l of slice) {
        const { ranges } = matcher(l.content);
        if (ranges.length > 0) map.set(l.id, ranges);
      }
    }
    return map;
  }, [slice, matcher, showOnlyPinned, filter.query]);

  return (
    <div className="rounded border bg-card h-full min-h-0 flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{ contain: "content", willChange: "transform" }}
      >
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nessun risultato.</div>
        ) : (
          <div>
            {topPad > 0 && <div style={{ height: topPad }} />}
            {slice.map((line, i) => {
              const isLast = lastId === line.id;
              const expanded = expandedMap.get(line.id) === true;
              const zebra = (startIndex + i) % 2 === 0 ? "bg-background" : "bg-accent/30";
              return (
                <div
                  key={line.id}
                  data-row-id={line.id}
                  id={isLast ? "log-last-row" : undefined}
                  className={zebra}
                  style={{ minHeight: expanded ? undefined : ROW_H }}
                  onClick={(e) => {
                    // evita che click su bottoni azione espandano/comprimano
                    const target = e.target as HTMLElement;
                    if (target.closest("button")) return;
                    toggleExpanded(line.id);
                  }}
                >
                  <MemoLineItem
                    line={line}
                    isPinned={pinned.has(line.id)}
                    onTogglePin={(id) => {
                      // fermiamo la propagazione per non innescare il toggle di riga
                      // (in LogLineItem i bottoni già fanno stopPropagation; doppia sicurezza)
                      onTogglePin(id);
                    }}
                    highlightRanges={sliceHighlightMap.get(line.id) ?? []}
                    expanded={expanded}
                    onToggleExpanded={toggleExpanded}
                  />
                </div>
              );
            })}
            {bottomPad > 0 && <div style={{ height: bottomPad }} />}
            <div id="log-bottom-sentinel" style={{ height: 1 }} />
          </div>
        )}
      </div>
    </div>
  );
}