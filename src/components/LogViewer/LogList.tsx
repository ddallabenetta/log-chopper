"use client";

import * as React from "react";
import LogLineItem from "./LogLineItem";
import type { LogLine, FilterConfig } from "./LogTypes";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  lines: LogLine[];
  pinned: Set<string>;
  onTogglePin: (id: string) => void;
  filter: FilterConfig;
  showOnlyPinned: boolean;
  onLoadMoreTop?: () => void;
  jumpToId?: string | null;
  onAfterJump?: () => void;
  onMatchesChange?: (matchIds: string[]) => void;
  // nuovo: id del match corrente da evidenziare
  currentMatchId?: string | null;
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
    if (!needle) return { match: true, ranges: [] };
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

function useHeightsBatch() {
  const [heights, setHeights] = React.useState<Map<string, number>>(() => new Map());
  const pendingRef = React.useRef<Map<string, number>>(new Map());
  const rafRef = React.useRef<number | null>(null);
  const lastFlushTime = React.useRef<number>(0);

  const flush = React.useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current.size === 0) return;
    
    // Throttle flushes for better performance with large datasets
    const now = performance.now();
    const timeSinceLastFlush = now - lastFlushTime.current;
    
    if (timeSinceLastFlush < 16 && pendingRef.current.size < 10) {
      // Delay if too frequent and batch size is small
      rafRef.current = requestAnimationFrame(flush);
      return;
    }
    
    lastFlushTime.current = now;
    setHeights((prev) => {
      let changed = false;
      const next = new Map(prev);
      pendingRef.current.forEach((h, id) => {
        const old = next.get(id);
        if (old !== h) {
          next.set(id, h);
          changed = true;
        }
      });
      pendingRef.current.clear();
      return changed ? next : prev;
    });
  }, []);

  const queue = React.useCallback((id: string, h: number) => {
    const old = pendingRef.current.get(id);
    if (old === h) return;
    pendingRef.current.set(id, h);
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  React.useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      pendingRef.current.clear();
    };
  }, []);

  return { heights, queueHeight: queue };
}

const MeasuredRow = React.memo(function MeasuredRow({
  line,
  isPinned,
  onTogglePin,
  highlightRanges,
  onHeightChange,
  zebraClass,
  active,
}: {
  line: LogLine;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  highlightRanges: { start: number; end: number }[];
  onHeightChange: (id: string, h: number) => void;
  zebraClass: string;
  active: boolean;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const lastH = React.useRef<number>(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (Math.abs(h - lastH.current) >= 1) {
        lastH.current = h;
        onHeightChange(line.id, h);
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [line.id, onHeightChange]);

  return (
    <div
      ref={ref}
      data-row-id={line.id}
      className={[
        zebraClass,
        "relative",
        active ? "ring-2 ring-primary/70 rounded-md shadow-[0_0_0_2px_rgba(59,130,246,0.4)]" : ""
      ].join(" ")}
    >
      <MemoLineItem
        line={line}
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        highlightRanges={highlightRanges}
      />
    </div>
  );
});

export default function LogList({
  lines,
  pinned,
  onTogglePin,
  filter,
  showOnlyPinned,
  onLoadMoreTop,
  jumpToId,
  onAfterJump,
  onMatchesChange,
  currentMatchId,
}: Props) {
  const { t } = useI18n();

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

  const matchIds = React.useMemo(() => {
    if (!filter.query && filter.level === "ALL" && !showOnlyPinned) return [];
    const res: string[] = [];
    for (const l of filtered) {
      const m = matcher(l.content);
      if (m.match) res.push(l.id);
    }
    return res;
  }, [filtered, matcher, filter.query, filter.level, showOnlyPinned]);

  React.useEffect(() => {
    onMatchesChange?.(matchIds);
  }, [matchIds, onMatchesChange]);

  const ESTIMATE = 34;
  const OVERSCAN = 15; // Increased from 8 for smoother scrolling
  const SCROLL_THRESHOLD = 80; // Increased from 40 for better large file handling

  const { heights, queueHeight } = useHeightsBatch();

  const setHeight = React.useCallback((id: string, h: number) => {
    queueHeight(id, h);
  }, [queueHeight]);

  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(0);
  const [followBottom, setFollowBottom] = React.useState(true);
  const [isScrolling, setIsScrolling] = React.useState(false);
  const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleScroll = useRafThrottle(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const atBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) <= 24;
    setFollowBottom(atBottom);
    
    // Track scrolling state for performance optimizations
    setIsScrolling(true);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  });

  const handleResize = useRafThrottle(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = el.clientHeight;
    setViewportH(h);
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
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll, handleResize]);

  const didInitScrollBottomRef = React.useRef(false);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitScrollBottomRef.current && filtered.length > 0) {
      const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 24;
      if (nearBottom) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - el.clientHeight;
          didInitScrollBottomRef.current = true;
          setFollowBottom(true);
        });
      } else {
        didInitScrollBottomRef.current = true;
      }
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
      if (el.scrollTop <= SCROLL_THRESHOLD) {
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
    (window as any).__LOG_LIST_CONTAINER__ = containerRef.current;
    (window as any).__LOG_LIST_SCROLL_TO_BOTTOM__ = () => {
      const el = containerRef.current;
      if (!el) return;
      
      // Force scroll to absolute bottom
      const maxScrollTop = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: Math.max(0, maxScrollTop), behavior: "smooth" });
      setFollowBottom(true);
      
      // Fallback: try again after a short delay to ensure it worked
      setTimeout(() => {
        const currentMax = el.scrollHeight - el.clientHeight;
        if (el.scrollTop < currentMax - 10) {
          el.scrollTo({ top: Math.max(0, currentMax), behavior: "auto" });
        }
      }, 100);
    };

    // Add keyboard navigation for scroll
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el || !el.contains(document.activeElement)) return;
      
      switch (e.key) {
        case "PageUp":
          e.preventDefault();
          el.scrollBy({ top: -el.clientHeight * 0.8, behavior: "smooth" });
          setFollowBottom(false);
          break;
        case "PageDown":
          e.preventDefault();
          el.scrollBy({ top: el.clientHeight * 0.8, behavior: "smooth" });
          break;
        case "Home":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            el.scrollTo({ top: 0, behavior: "smooth" });
            setFollowBottom(false);
          }
          break;
        case "End":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            setFollowBottom(true);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const total = filtered.length;

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

  // Optimize calculation for large datasets
  let y = prefixHeights[startIndex];
  let i = startIndex;
  const targetY = scrollTop + viewportH + (OVERSCAN * ESTIMATE);
  while (i < total && y < targetY) {
    const id = filtered[i]?.id;
    const h = id ? (heights.get(id) ?? ESTIMATE) : ESTIMATE;
    y += h;
    i++;
  }
  const endIndex = Math.min(total, i + OVERSCAN);

  const topPad = prefixHeights[startIndex];
  const bottomPad = totalHeight - prefixHeights[endIndex];

  const slice = React.useMemo(() => filtered.slice(startIndex, endIndex), [filtered, startIndex, endIndex]);
  const lastId = slice.length > 0 ? slice[slice.length - 1]?.id : null;

  // Scroll position indicator
  const scrollProgress = React.useMemo(() => {
    if (totalHeight <= viewportH) return 1;
    return Math.min(1, Math.max(0, scrollTop / (totalHeight - viewportH)));
  }, [scrollTop, totalHeight, viewportH]);

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

  React.useEffect(() => {
    if (!jumpToId) return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 5;

    const tryScroll = () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts++;

      const target = el.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(jumpToId)}"]`);
      if (target) {
        const targetRect = target.getBoundingClientRect();
        const containerRect = el.getBoundingClientRect();
        
        // Better centering calculation
        const targetTop = target.offsetTop;
        const centerOffset = el.clientHeight / 2 - targetRect.height / 2;
        const newScrollTop = Math.max(0, Math.min(targetTop - centerOffset, el.scrollHeight - el.clientHeight));
        
        el.scrollTo({ 
          top: newScrollTop, 
          behavior: attempts === 1 ? "smooth" : "auto" // Smooth only on first attempt
        });
        
        // Disable auto-follow during jump
        setFollowBottom(false);
        
        // Highlight the target row briefly
        target.style.transition = "background-color 0.3s ease";
        target.style.backgroundColor = "rgba(59, 130, 246, 0.2)";
        setTimeout(() => {
          target.style.backgroundColor = "";
          setTimeout(() => {
            target.style.transition = "";
          }, 300);
        }, 1000);
        
        onAfterJump && onAfterJump();
        return;
      }

      const idx = filtered.findIndex((l) => l.id === jumpToId);
      if (idx >= 0) {
        const approxTop = prefixHeights[idx] - el.clientHeight / 2;
        const clampedTop = Math.max(0, Math.min(approxTop, el.scrollHeight - el.clientHeight));
        el.scrollTo({ top: clampedTop });
        setFollowBottom(false);
        
        // Wait a bit longer for virtual scrolling to catch up
        setTimeout(() => {
          if (!cancelled) requestAnimationFrame(tryScroll);
        }, 50);
      } else {
        onAfterJump && onAfterJump();
      }
    };

    requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [jumpToId, filtered, prefixHeights, onAfterJump]);

  return (
    <div className="rounded border bg-card h-full min-h-0 flex flex-col relative">
      {/* Scroll position indicator */}
      {filtered.length > 50 && (
        <div className="absolute right-2 top-2 z-10 bg-background/80 backdrop-blur-sm border rounded px-2 py-1 text-xs text-muted-foreground">
          {Math.round(scrollProgress * 100)}% • {Math.ceil((startIndex + endIndex) / 2)} / {filtered.length}
        </div>
      )}
      
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto scroll-smooth focus:outline-none"
        tabIndex={0}
        role="log"
        aria-label="Log entries"
        style={{ 
          contain: "layout style paint", 
          willChange: isScrolling ? "scroll-position" : "auto",
          // Better scrolling performance hints
          scrollBehavior: isScrolling ? "auto" : "smooth"
        }}
      >
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">{t("no_results")}</div>
        ) : (
          <div style={{ height: totalHeight || ESTIMATE }}>
            {topPad > 0 && <div style={{ height: topPad }} />}
            {slice.map((line, idx) => {
              const zebra = (startIndex + idx) % 2 === 0 ? "bg-background" : "bg-accent/30";
              const isLast = lastId === line.id;
              const isActive = currentMatchId === line.id;
              return (
                <div key={line.id} id={isLast ? "log-last-row" : undefined}>
                  <MeasuredRow
                    line={line}
                    isPinned={pinned.has(line.id)}
                    onTogglePin={onTogglePin}
                    highlightRanges={sliceHighlightMap.get(line.id) ?? []}
                    onHeightChange={setHeight}
                    zebraClass={zebra}
                    active={isActive}
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