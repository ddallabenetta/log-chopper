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

// Matcher
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

// Componente riga con misurazione dell’altezza
function MeasuredRow({
  line,
  isPinned,
  onTogglePin,
  highlightRanges,
  onHeightChange,
  zebraClass,
}: {
  line: LogLine;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  highlightRanges: { start: number; end: number }[];
  onHeightChange: (id: string, h: number) => void;
  zebraClass: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      onHeightChange(line.id, el.getBoundingClientRect().height);
    });
    ro.observe(el);
    // prima misura
    onHeightChange(line.id, el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [line.id, onHeightChange]);

  return (
    <div ref={ref} data-row-id={line.id} className={zebraClass}>
      <MemoLineItem
        line={line}
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        highlightRanges={highlightRanges}
      />
    </div>
  );
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

  // Virtual scroll con altezze variabili
  const ESTIMATE = 34; // stima iniziale
  const OVERSCAN = 8;

  // Mappa id -> altezza misurata
  const [heights, setHeights] = React.useState<Map<string, number>>(() => new Map());

  const setHeight = React.useCallback((id: string, h: number) => {
    setHeights((prev) => {
      const old = prev.get(id);
      if (old === h) return prev;
      const next = new Map(prev);
      next.set(id, h);
      return next;
    });
  }, []);

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

  // Calcolo finestra visibile con altezze variabili
  const total = filtered.length;

  // prefixHeights[i] = somma altezze 0..i-1
  const prefixHeights = React.useMemo(() => {
    const arr = new Array<number>(total + 1);
    arr[0] = 0;
    for (let i = 0; i < total; i++) {
      const id = filtered[i]?.id;
      const h = id ? heights.get(id) ?? ESTIMATE : ESTIMATE;
      arr[i + 1] = arr[i] + h;
    }
    return arr;
  }, [filtered, heights, total]);

  const totalHeight = prefixHeights[total];

  // Trova startIndex via ricerca binaria sul prefixHeights rispetto a scrollTop
  const findIndexForOffset = (offset: number) => {
    let lo = 0, hi = total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefixHeights[mid] <= offset) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - 1);
  };

  const startIndex = Math.max(0, findIndexForOffset(scrollTop) - OVERSCAN);

  // Calcola quanti item entrano nel viewport
  let y = prefixHeights[startIndex];
  let i = startIndex;
  while (i < total && y < scrollTop + viewportH) {
    const id = filtered[i].id;
    const h = heights.get(id) ?? ESTIMATE;
    y += h;
    i++;
  }
  const endIndex = Math.min(total, i + OVERSCAN);

  const topPad = prefixHeights[startIndex];
  const bottomPad = totalHeight - prefixHeights[endIndex];

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
          <div style={{ height: totalHeight || ESTIMATE }}>
            {topPad > 0 && <div style={{ height: topPad }} />}
            {slice.map((line, idx) => {
              const isLast = lastId === line.id;
              const zebra = (startIndex + idx) % 2 === 0 ? "bg-background" : "bg-accent/30";
              return (
                <div key={line.id} id={isLast ? "log-last-row" : undefined}>
                  <MeasuredRow
                    line={line}
                    isPinned={pinned.has(line.id)}
                    onTogglePin={onTogglePin}
                    highlightRanges={sliceHighlightMap.get(line.id) ?? []}
                    onHeightChange={setHeight}
                    zebraClass={zebra}
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