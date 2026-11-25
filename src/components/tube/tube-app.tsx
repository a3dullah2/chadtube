"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  Dices,
  EyeOff,
  History,
  Home,
  Menu,
  Moon,
  RotateCcw,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { WatchView } from "./watch-view";
import {
  isResumable,
  loadAutoplay,
  loadHist,
  loadProgress,
  loadSaved,
  migrateLegacyStorage,
  progressRatio,
  resumeStart,
  saveAutoplay,
  saveHist,
  saveProgress,
  saveSaved,
} from "./store";
import type {
  BookmarkEntry,
  Chan,
  HistEntry,
  ProgressEntry,
  SortMode,
  Tier,
  TierFilter,
  TubeData,
  Vid,
} from "./types";
import {
  chanName,
  fmtAge,
  fmtDur,
  fmtTimeAgo,
  fmtViews,
  interleaveChannels,
  metaJoin,
  shuffleSeeded,
  TIER_COLORS,
  TIER_LABELS,
  thumbUrl,
} from "./utils";

const TIERS: Tier[] = ["S", "A", "B", "C", "D", "R", "★"];
const PAGE = 40;

type View = "home" | "watch" | "history" | "saved";

/** Query-string shape for shareable links + working browser Back. */
interface UrlParams {
  v?: string;
  view?: string;
  c?: string;
  tier?: string;
  uw?: string;
  s?: string;
  q?: string;
}

function parseUrl(search: string): UrlParams {
  const sp = new URLSearchParams(search);
  const p: UrlParams = {};
  const v = sp.get("v");
  if (v) p.v = v;
  const view = sp.get("view");
  if (view === "history" || view === "saved") p.view = view;
  const c = sp.get("c");
  if (c) p.c = c;
  const tier = sp.get("tier");
  if (tier && (tier === "all" || tier === "curated" || (TIERS as string[]).includes(tier)))
    p.tier = tier;
  if (sp.get("uw") === "1") p.uw = "1";
  const s = sp.get("s");
  if (s && ["newest", "curated", "views", "longest", "shuffle"].includes(s)) p.s = s;
  const q = sp.get("q");
  if (q) p.q = q;
  return p;
}

export function TubeApp() {
  const [data, setData] = useState<TubeData | null>(null);
  const [loadError, setLoadError] = useState(false);
  /** Bumped by the Retry button to re-run the library fetch. */
  const [reloadTick, setReloadTick] = useState(0);
  const [view, setView] = useState<View>("home");
  const [current, setCurrent] = useState<Vid | null>(null);
  const [queue, setQueue] = useState<Vid[]>([]);
  const [q, setQ] = useState("");
  // Heavy filtering/sorting over 30k videos is deferred so typing stays snappy.
  const dq = useDeferredValue(q);
  // Default landing is the curated core (S & A tiers) — 264 of 333 channels
  // are tier R, so "everything" made the first screen a firehose wall.
  const [tier, setTier] = useState<TierFilter>("curated");
  const [chan, setChan] = useState<number | null>(null);
  // "What haven't I seen" — hides videos with recorded progress or history.
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>("newest");
  const [seed, setSeed] = useState(1);
  // Pakistani mode: hide Pakistani news & Islamic channels (Dunya News, the
  // Ghamidi circle, SAMAA/Geo reposts, ...) from feed and search.
  const [pkMode, setPkMode] = useState(false);
  // Theater mode: edge-to-edge player on the watch page (YouTube-style).
  const [theater, setTheater] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [drawer, setDrawer] = useState(false);
  const [hist, setHist] = useState<HistEntry[]>([]);
  // Saved (bookmarks) + watch progress — localStorage-backed via store.ts.
  const [saved, setSaved] = useState<BookmarkEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressEntry>>({});
  const [autoplay, setAutoplay] = useState(true);
  const [mounted, setMounted] = useState(false);
  /** True once persisted state has been read back from localStorage — persist
      effects stay dormant until then so a mount never clobbers stored data. */
  const [hydrated, setHydrated] = useState(false);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Persisted prefs + persisted state (async: never setState synchronously inside the effect)
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      try {
        migrateLegacyStorage();
        setHist(loadHist());
        const a = loadAutoplay();
        if (a !== null) setAutoplay(a);
        if (localStorage.getItem("chadtube.pk") === "1") setPkMode(true);
        if (localStorage.getItem("chadtube.theater") === "1") setTheater(true);
        setSaved(loadSaved());
        setProgress(loadProgress());
      } catch {
        /* noop */
      }
      setMounted(true);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Library fetch. The inline bootstrap script in layout.tsx starts this
  // request while the HTML is still parsing; by the time we hydrate it's in
  // flight. Bumping reloadTick re-fetches (Retry button) — a fresh URL each
  // time so a failed/absent edge cache entry can't serve the same error.
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      try {
        const boot = (
          window as typeof window & { __chadtubeData?: Promise<TubeData> }
        ).__chadtubeData;
        let d: TubeData;
        if (boot && reloadTick === 0) {
          d = await boot;
        } else {
          const r = await fetch(`/api/videos?v=3${reloadTick ? `&retry=${reloadTick}` : ""}`);
          if (!r.ok) throw new Error("bad response");
          d = (await r.json()) as TubeData;
        }
        if (alive) setData(d);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadTick]);

  const pushHist = useCallback((id: string) => {
    setHist((prev) => {
      const next = [{ id, ts: Date.now() }, ...prev.filter((h) => h.id !== id)].slice(0, 300);
      saveHist(next);
      return next;
    });
  }, []);

  const clearHist = useCallback(() => {
    setHist([]);
    saveHist([]);
    toast({ title: "Watch history cleared" });
  }, [toast]);

  // Saved + progress persistence: mirror state into localStorage on change,
  // but only after hydration — otherwise a fresh mount would wipe the store
  // (and with it, another open tab's progress) with empty initial state.
  useEffect(() => {
    if (hydrated) saveSaved(saved);
  }, [saved, hydrated]);
  useEffect(() => {
    if (hydrated) saveProgress(progress);
  }, [progress, hydrated]);

  const toggleSaved = useCallback(
    (v: Vid) => {
      const exists = saved.some((b) => b.id === v.id);
      setSaved((prev) =>
        exists ? prev.filter((b) => b.id !== v.id) : [{ id: v.id, ts: Date.now() }, ...prev]
      );
      toast({
        title: exists ? "Removed from saved" : "Saved for later",
        description: v.t,
      });
    },
    [saved, toast]
  );

  const clearSaved = useCallback(() => {
    setSaved([]);
    toast({ title: "Saved list cleared" });
  }, [toast]);

  const pushProgress = useCallback((id: string, pos: number, dur: number) => {
    setProgress((prev) => {
      const cur = prev[id];
      // Same position (±1s) while paused: skip the state churn entirely.
      if (cur && cur.dur === dur && Math.abs(cur.pos - pos) < 1) return prev;
      return { ...prev, [id]: { pos, dur, ts: Date.now() } };
    });
  }, []);

  const changeAutoplay = useCallback((v: boolean) => {
    setAutoplay(v);
    saveAutoplay(v);
  }, []);

  const changeTheater = useCallback((v: boolean) => {
    setTheater(v);
    try {
      localStorage.setItem("chadtube.theater", v ? "1" : "0");
    } catch {
      /* noop */
    }
  }, []);

  const channels = data?.channels ?? [];

  /**
   * Watch queue with TV-style weighting: the clicked video first, then its
   * own channel's videos (playlist rows grouped by real uploader), then the
   * rest of its tier, then everything else in browse order. "Next" and the
   * Up next rail become meaningful instead of stepping through the raw feed.
   */
  const buildQueue = useCallback(
    (v: Vid, list: Vid[]): Vid[] => {
      if (list.length <= 1) return list;
      const keyOf = (x: Vid) => x.up || String(x.c);
      const tierOf = (x: Vid) => channels[x.c]?.tier;
      const vk = keyOf(v);
      const vt = tierOf(v);
      const sameChan: Vid[] = [];
      const sameTier: Vid[] = [];
      const rest: Vid[] = [];
      for (const x of list) {
        if (x.id === v.id) continue;
        if (keyOf(x) === vk) sameChan.push(x);
        else if (tierOf(x) === vt) sameTier.push(x);
        else rest.push(x);
      }
      return [v, ...sameChan, ...sameTier, ...rest];
    },
    [channels]
  );

  // ---- URL state sync ---------------------------------------------------
  // View, filters and the current video live in the query string: videos are
  // shareable (/ ?v=<id>), refresh keeps your place, and browser Back walks
  // back out of the player instead of out of the site. Navigation changes
  // (open video, switch view) push a history entry; filter edits replace, so
  // typing in search doesn't spam history.

  const pendingUrlRef = useRef<UrlParams | null>(null);
  const suppressUrlRef = useRef(true);
  const prevNavRef = useRef<{ view: View; id: string | null }>({ view: "home", id: null });

  const applyUrl = useCallback(
    (p: UrlParams, recordHist: boolean) => {
      suppressUrlRef.current = true;
      setTier(p.tier ? (p.tier as TierFilter) : "curated");
      setSort(p.s ? (p.s as SortMode) : "newest");
      setUnwatchedOnly(p.uw === "1");
      setQ(p.q ?? "");
      setView(
        p.view === "history" || p.view === "saved"
          ? (p.view as View)
          : p.v
            ? "watch"
            : "home"
      );
      if (!data) {
        // v / c need the library to resolve; re-apply once it lands.
        if (p.v || p.c) pendingUrlRef.current = p;
        return;
      }
      pendingUrlRef.current = null;
      const idx = p.c ? channels.findIndex((x) => x.cid === p.c) : -1;
      setChan(p.c && idx >= 0 ? idx : null);
      if (p.v) {
        const vid = data.videos.find((x) => x.id === p.v);
        if (vid) {
          setCurrent(vid);
          setQueue(buildQueue(vid, data.videos));
          if (recordHist) pushHist(vid.id);
        } else {
          setCurrent(null); // unknown id -> back to the grid
        }
      } else {
        setCurrent(null);
      }
    },
    [data, channels, buildQueue, pushHist]
  );

  const applyUrlRef = useRef(applyUrl);
  useEffect(() => {
    applyUrlRef.current = applyUrl;
  });

  // Restore state from the URL on first paint and on back/forward; the
  // initial restore must not write a history entry (suppress flag starts on).
  useEffect(() => {
    const apply = () => applyUrlRef.current(parseUrl(window.location.search), false);
    apply();
    const onPop = () => applyUrlRef.current(parseUrl(window.location.search), false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A deep link (?v=…) can only resolve once the library has loaded.
  useEffect(() => {
    if (data && pendingUrlRef.current) {
      const p = pendingUrlRef.current;
      pendingUrlRef.current = null;
      applyUrlRef.current(p, true);
    }
  }, [data]);

  // State -> URL: push on navigation, replace on filter tweaks.
  useEffect(() => {
    if (!mounted) return;
    const sp = new URLSearchParams();
    if (current?.id) sp.set("v", current.id);
    if (view === "history" || view === "saved") sp.set("view", view);
    if (chan !== null) {
      const cid = channels[chan]?.cid;
      if (cid) sp.set("c", cid);
    }
    if (tier !== "curated") sp.set("tier", tier);
    if (unwatchedOnly) sp.set("uw", "1");
    if (sort !== "newest") sp.set("s", sort);
    if (dq.trim()) sp.set("q", dq.trim());
    const qs = sp.toString();
    const target = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    // Push only when entering the player or hopping between videos — that's
    // what Back should reverse. Leaving watch (Escape/Back button), view
    // switches and filter tweaks replace the current entry instead, so Back
    // never lands on a stale duplicate of where you already are.
    const navChanged =
      view === "watch" &&
      (prevNavRef.current.view !== view || prevNavRef.current.id !== (current?.id ?? null));
    prevNavRef.current = { view, id: current?.id ?? null };
    if (suppressUrlRef.current) {
      suppressUrlRef.current = false;
      history.replaceState(null, "", target);
      return;
    }
    if (navChanged) history.pushState(null, "", target);
    else history.replaceState(null, "", target);
  }, [mounted, view, current?.id, chan, tier, unwatchedOnly, sort, dq, channels]);

  // Videos the user has already engaged with (progress or history) — powers
  // the Unwatched filter.
  const watchedIds = useMemo(() => {
    const s = new Set<string>();
    for (const [id, e] of Object.entries(progress)) if (e && e.pos > 0) s.add(id);
    for (const h of hist) s.add(h.id);
    return s;
  }, [progress, hist]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = dq.trim().toLowerCase();
    let out = data.videos.filter((v) => {
      if (tier !== "all") {
        const t = (data.channels[v.c]?.tier as Tier | undefined) ?? "R";
        if (tier === "curated" ? t !== "S" && t !== "A" : t !== tier) return false;
      }
      if (chan !== null && v.c !== chan) return false;
      if (pkMode && (data.channels[v.c]?.pk || v.pk)) return false;
      if (unwatchedOnly && watchedIds.has(v.id)) return false;
      if (ql) {
        const t = v.t.toLowerCase();
        const c = `${data.channels[v.c]?.n ?? ""} ${v.up ?? ""}`.toLowerCase();
        if (!t.includes(ql) && !c.includes(ql)) return false;
      }
      return true;
    });
    // Feed-level dedupe: same video via its channel AND the playlist keeps the
    // channel copy in the mixed feed (the ★ filter still shows the full playlist).
    const seen = new Set<string>();
    out = out.filter((v) => !seen.has(v.id) && seen.add(v.id));
    if (sort === "newest") {
      // Healthy feed: newest-first inside each channel, then round-robin
      // across channels so firehose channels (news, music dumps) can't
      // cluster at the top. Single-channel filters degenerate to identity.
      out = interleaveChannels(
        [...out].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || b.v - a.v)
      );
    } else if (sort === "views") out = [...out].sort((a, b) => b.v - a.v);
    else if (sort === "longest") out = [...out].sort((a, b) => b.d - a.d);
    else if (sort === "shuffle") out = shuffleSeeded(out, seed);
    return out;
  }, [data, dq, tier, chan, sort, seed, pkMode, unwatchedOnly, watchedIds]);

  const applyFilter = useCallback(() => {
    setVisible(PAGE);
    // Typing in search or changing filters should return to the grid
    setView("home");
  }, []);

  const openFromGrid = useCallback(
    (v: Vid, list: Vid[]) => {
      setQueue(buildQueue(v, list));
      setCurrent(v);
      setView("watch");
      pushHist(v.id);
      window.scrollTo({ top: 0 });
    },
    [buildQueue, pushHist]
  );

  const openInQueue = useCallback(
    (v: Vid) => {
      setCurrent(v);
      pushHist(v.id);
      window.scrollTo({ top: 0 });
    },
    [pushHist]
  );

  const togglePk = useCallback(() => {
    const next = !pkMode;
    setPkMode(next);
    try {
      localStorage.setItem("chadtube.pk", next ? "1" : "0");
    } catch {
      /* noop */
    }
    applyFilter();
    toast({
      title: next ? "Pakistani mode on" : "Pakistani mode off",
      description: next
        ? "Pakistani news & Islamic channels are hidden"
        : "Pakistani channels are back in the feed",
    });
  }, [pkMode, applyFilter, toast]);

  const reshuffle = useCallback(() => {
    setSort("shuffle");
    setSeed(Math.floor(Math.random() * 1e9));
    setVisible(PAGE);
    toast({
      title: "Shuffled",
      description: `${filtered.length.toLocaleString()} videos in a brand-new order`,
    });
  }, [filtered.length, toast]);

  // Infinite scroll: reveal more when the sentinel approaches the viewport.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const canLoadMore = !!data && visible < filtered.length;
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !canLoadMore || view !== "home") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((n) => Math.min(n + PAGE * 4, filtered.length));
        }
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, view, filtered.length]);

  // Reactive subtitle: says what's actually on screen, not the same static
  // line for every filter/sort combination.
  const scopeText = useMemo(() => {
    if (chan !== null) {
      const c = channels[chan];
      return c ? `from ${c.n} (${c.tier} tier)` : "";
    }
    if (tier === "curated") return "across S & A channels — the curated core, zero algorithm";
    if (tier === "all") return "across the whole line-up, zero algorithm";
    return `${TIER_LABELS[tier]} — ${tier}-tier channels`;
  }, [chan, tier, channels]);
  const sortText =
    sort === "shuffle"
      ? " · freshly shuffled"
      : sort === "views"
        ? " · most viewed first"
        : sort === "longest"
          ? " · longest first"
          : sort === "curated"
            ? " · in channel order"
            : "";

  const goHome = useCallback(() => {
    setView("home");
    setDrawer(false);
  }, []);

  // Leaving the watch view drops the current video, so the URL stops
  // carrying ?v= once you're back on a grid — reloading a grid URL stays a
  // grid instead of dropping you back into the last-played video.
  useEffect(() => {
    if (view !== "watch") setCurrent(null);
  }, [view]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // O(1) id -> video lookups (31k entries, rebuilt only when data loads).
  const byId = useMemo(
    () => new Map(data ? data.videos.map((v) => [v.id, v]) : []),
    [data]
  );

  const histVids = useMemo(() => {
    if (!data) return [];
    return hist
      .map((h) => ({ h, v: byId.get(h.id) }))
      .filter((x): x is { h: HistEntry; v: Vid } => !!x.v)
      .map((x) => ({ entry: x.h, vid: x.v }));
  }, [hist, byId]);

  const savedVids = useMemo(
    () =>
      saved
        .map((b) => ({ entry: b, vid: byId.get(b.id) }))
        .filter((x): x is { entry: BookmarkEntry; vid: Vid } => !!x.vid),
    [saved, byId]
  );

  /** Partially-watched videos, most recently watched first (home strip). */
  const resumeList = useMemo(
    () =>
      Object.entries(progress)
        .filter(([id, e]) => isResumable(e) && byId.has(id))
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, 12)
        .map(([id]) => byId.get(id))
        .filter((v): v is Vid => !!v),
    [progress, byId]
  );

  const navItem = (
    icon: React.ReactNode,
    label: string,
    active: boolean,
    onClick: () => void
  ) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent ${
        active ? "bg-accent" : ""
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const sidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="p-3">
        {navItem(<Home className="h-4 w-4" />, "Home", view === "home", () => {
          setTier("curated");
          setChan(null);
          applyFilter();
          goHome();
          onNavigate?.();
        })}
        {navItem(<Bookmark className="h-4 w-4" />, "Saved", view === "saved", () => {
          setView("saved");
          setDrawer(false);
          onNavigate?.();
        })}
        {navItem(<History className="h-4 w-4" />, "History", view === "history", () => {
          setView("history");
          setDrawer(false);
          onNavigate?.();
        })}
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto p-3">
        {data ? (
          <>
            <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {channels.length} curated channels
            </p>
            <button
              onClick={() => {
                setChan(null);
                applyFilter();
                setView("home");
                onNavigate?.();
              }}
              className={`mt-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-accent ${
                chan === null ? "bg-accent font-medium" : ""
              }`}
            >
              All channels
            </button>
            {TIERS.map((t) => {
              const list = channels
                .map((c, i) => ({ c, i }))
                .filter((x) => x.c.tier === t);
              if (!list.length) return null;
              return (
                <div key={t} className="mt-3">
                  <p className="flex items-center gap-2 px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: TIER_COLORS[t] }}
                    />
                    {t} — {TIER_LABELS[t]}
                  </p>
                  {list.map(({ c, i }) => (
                    <button
                      key={c.cid}
                      onClick={() => {
                        setChan(i);
                        applyFilter();
                        setView("home");
                        onNavigate?.();
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-accent ${
                        chan === i ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span className="truncate">{c.n}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.count}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </>
        ) : loadError ? (
          <p className="p-3 text-sm text-muted-foreground">
            Library unavailable — use Retry in the grid once it loads.
          </p>
        ) : (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const chipCls = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "border-transparent bg-foreground text-background"
        : "bg-secondary text-secondary-foreground hover:bg-accent"
    }`;

  const chip = (t: "all" | "curated" | Tier) => {
    const active = tier === t;
    return (
      <button
        key={t}
        onClick={() => {
          setTier(t);
          applyFilter();
        }}
        className={chipCls(active)}
        aria-pressed={active}
        title={t === "curated" ? "Only the S & A channels" : undefined}
      >
        {t === "curated" ? (
          <>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: TIER_COLORS.S }}
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: TIER_COLORS.A }}
            />
          </>
        ) : (
          t !== "all" && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: TIER_COLORS[t] }}
            />
          )
        )}
        {t === "all" ? "All" : t === "curated" ? "Curated" : t}
      </button>
    );
  };

  const uwChip = () => (
    <button
      onClick={() => {
        setUnwatchedOnly(!unwatchedOnly);
        applyFilter();
      }}
      className={chipCls(unwatchedOnly)}
      aria-pressed={unwatchedOnly}
      title="Hide videos you already watched or have in history"
    >
      <EyeOff className="h-3.5 w-3.5" />
      Unwatched
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="m-0 flex items-center">
            <button
              className="flex items-center gap-2 text-lg font-bold tracking-tight"
              onClick={goHome}
              aria-label="ChadTube home"
            >
              <img
                src="/chad.png"
                alt="ChadTube logo"
                width={36}
                height={36}
                draggable={false}
                className="chad-logo h-9 w-auto select-none"
              />
              <span className="tracking-tight">ChadTube</span>
            </button>
          </h1>
          <div className="relative mx-auto hidden max-w-xl flex-1 sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                applyFilter();
              }}
              placeholder="Search videos and channels…"
              className="rounded-full border-0 bg-secondary pl-9"
              aria-label="Search"
            />
          </div>
          <div className="flex-1 sm:hidden" />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={reshuffle}
              aria-label="Shuffle everything"
            >
              <Dices className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              onClick={() => setView("history")}
              aria-label="Watch history"
            >
              <History className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePk}
              aria-label="Pakistani mode"
              aria-pressed={pkMode}
              title="Pakistani mode: hide Pakistani news & Islamic channels"
              className={pkMode ? "bg-foreground text-background hover:bg-foreground/90" : ""}
            >
              <span className="text-base leading-none">🇵🇰</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {mounted && theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
        <div className="px-3 pb-2 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                applyFilter();
              }}
              placeholder="Search…"
              className="rounded-full border-0 bg-secondary pl-9"
              aria-label="Search"
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar — hidden in theater mode so the player gets the
            full content width, like YouTube collapsing its guide rail. */}
        <aside
          className={
            theater && view === "watch"
              ? "hidden"
              : "sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r md:block"
          }
        >
          {sidebarContent()}
        </aside>

        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setDrawer(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0 w-72 border-r bg-background">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">Browse</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDrawer(false)}
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {sidebarContent(() => setDrawer(false))}
            </div>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1">
          {view === "watch" && current && data ? (
            <WatchView
              /* key: a brand-new iframe per video. Reusing one iframe across
                 watch->watch navigation (loadVideoById) keeps the previous
                 video's end screen painted inside it until the new video's
                 first frame — remounting starts every video clean. */
              key={current.id}
              video={current}
              queue={queue}
              channels={channels}
              autoplay={autoplay}
              theater={theater}
              startAt={resumeStart(progress[current.id])}
              bookmarked={saved.some((b) => b.id === current.id)}
              onAutoplayChange={changeAutoplay}
              onTheaterChange={changeTheater}
              onToggleBookmark={() => toggleSaved(current)}
              onProgress={pushProgress}
              onBack={goHome}
              onSelect={openInQueue}
            />
          ) : view === "history" ? (
            <div className="mx-auto max-w-4xl px-4 py-4">
              <div className="mb-4 flex items-center gap-3">
                <h1 className="text-xl font-bold">Watch history</h1>
                {histVids.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearHist}>
                    Clear history
                  </Button>
                )}
              </div>
              {histVids.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">
                  Nothing watched yet — hit the dice and shuffle something up.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {histVids.map(({ entry, vid }) => (
                    <button
                      key={vid.id}
                      onClick={() => openFromGrid(vid, histVids.map((x) => x.vid))}
                      className="flex gap-3 rounded-lg p-2 text-left hover:bg-accent"
                    >
                      <div className="relative aspect-video w-44 shrink-0 overflow-hidden rounded-md bg-muted">
                        <img
                          src={thumbUrl(vid.id)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {fmtDur(vid.d) && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                            {fmtDur(vid.d)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-medium">
                          {vid.t}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {metaJoin(chanName(vid, channels), fmtViews(vid.v))}
                          {" · "}watched {fmtTimeAgo(entry.ts)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : view === "saved" ? (
            <div className="mx-auto max-w-4xl px-4 py-4">
              <div className="mb-4 flex items-center gap-3">
                <h1 className="text-xl font-bold">Saved</h1>
                {savedVids.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearSaved}>
                    Clear saved
                  </Button>
                )}
              </div>
              {savedVids.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">
                  Nothing saved yet — tap the bookmark on any video to keep it
                  here.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {savedVids.map(({ entry, vid }) => (
                    <div key={vid.id} className="relative">
                      <button
                        onClick={() =>
                          openFromGrid(vid, savedVids.map((x) => x.vid))
                        }
                        className="flex w-full gap-3 rounded-lg p-2 pr-12 text-left hover:bg-accent"
                      >
                        <div className="relative aspect-video w-44 shrink-0 overflow-hidden rounded-md bg-muted">
                          <img
                            src={thumbUrl(vid.id)}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          {fmtDur(vid.d) && (
                            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                              {fmtDur(vid.d)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-medium">
                            {vid.t}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {metaJoin(chanName(vid, channels), fmtViews(vid.v))}
                            {" · "}saved {fmtTimeAgo(entry.ts)}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => toggleSaved(vid)}
                        aria-label={`Remove ${vid.t} from saved`}
                        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Continue watching */}
              {resumeList.length > 0 && (
                <div className="px-4 pt-3">
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    <Clock className="h-4 w-4" /> Continue watching
                  </h2>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {resumeList.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => openFromGrid(v, resumeList)}
                        className="w-56 shrink-0 rounded-lg p-2 text-left hover:bg-accent"
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                          <img
                            src={thumbUrl(v.id)}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 text-[10px] text-white">
                            {fmtDur(progress[v.id]?.pos ?? 0)} / {fmtDur(v.d)}
                          </span>
                        </div>
                        <div className="mt-1.5 line-clamp-1 text-sm font-medium">
                          {v.t}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter chips — wraps on small screens instead of scrolling
                  the sort control off the viewport. */}
              <div className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur">
                <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                  {chip("all")}
                  {chip("curated")}
                  {TIERS.map((t) => chip(t))}
                  {uwChip()}
                  {chan !== null && (
                    <Badge
                      variant="outline"
                      className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm"
                    >
                      {channels[chan]?.n}
                      <button
                        onClick={() => setChan(null)}
                        aria-label="Clear channel filter"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Badge>
                  )}
                  <div className="ml-auto w-full sm:w-auto sm:pl-2">
                    <Select value={sort} onValueChange={(v) => { setSort(v as SortMode); applyFilter(); }}>
                      <SelectTrigger
                        size="sm"
                        className="w-[150px] rounded-full"
                        aria-label="Sort videos"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest (mixed)</SelectItem>
                        <SelectItem value="curated">By channel order</SelectItem>
                        <SelectItem value="views">Most viewed</SelectItem>
                        <SelectItem value="longest">Longest</SelectItem>
                        <SelectItem value="shuffle">Shuffled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Meta line */}
              <div className="px-4 pt-3 text-sm text-muted-foreground">
                {data ? (
                  <>
                    <span className="font-medium text-foreground">
                      {filtered.length.toLocaleString()} videos
                    </span>
                    {scopeText && [
                      " · ",
                      <span key="scope">{scopeText}</span>,
                    ]}
                    {sortText}
                    {pkMode && " · 🇵🇰 Pakistani mode: Pakistani channels hidden"}
                    {q.trim() && <> · results for “{q.trim()}”</>}
                  </>
                ) : (
                  !loadError && "Loading library…"
                )}
              </div>

              {/* Grid */}
              {!data && !loadError ? (
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="aspect-video w-full rounded-xl" />
                      <Skeleton className="mt-2 h-4 w-3/4" />
                      <Skeleton className="mt-1 h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : loadError && !data ? (
                <div className="p-16 text-center">
                  <p className="text-muted-foreground">
                    Couldn’t load the video library. Check your connection and try again.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-2"
                    onClick={() => {
                      setLoadError(false);
                      setReloadTick((t) => t + 1);
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Retry
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-16 text-center text-muted-foreground">
                  No videos match. Try clearing the search or filters.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {filtered.slice(0, visible).map((v) => {
                      const ch: Chan | undefined = channels[v.c];
                      const pr = progressRatio(progress[v.id]);
                      const isSaved = saved.some((b) => b.id === v.id);
                      return (
                        <div key={v.id} className="group relative text-left">
                          <button
                            onClick={() => openFromGrid(v, filtered)}
                            className="block w-full text-left"
                          >
                            <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                              <img
                                src={thumbUrl(v.id)}
                                alt={v.t}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              {fmtDur(v.d) && (
                                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                                  {fmtDur(v.d)}
                                </span>
                              )}
                              <span
                                className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-black"
                                style={{
                                  backgroundColor: TIER_COLORS[(ch?.tier ?? "D") as Tier],
                                }}
                              >
                                {ch?.tier}
                              </span>
                              {pr > 0 && (
                                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                                  <span
                                    className="block h-full bg-[#e5484d]"
                                    style={{ width: `${Math.round(pr * 100)}%` }}
                                  />
                                </span>
                              )}
                            </div>
                            <div className="mt-2 px-0.5">
                              <div className="line-clamp-2 text-sm font-medium leading-snug">
                                {v.t}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {metaJoin(chanName(v, channels), fmtViews(v.v), fmtAge(v.ts))}
                              </div>
                            </div>
                          </button>
                          {/* Bookmark toggle — sibling of the open button so
                              buttons are never nested. Hover-revealed on
                              desktop, always visible on touch screens. */}
                          <button
                            onClick={() => toggleSaved(v)}
                            aria-label={
                              isSaved
                                ? `Remove ${v.t} from saved`
                                : `Save ${v.t} for later`
                            }
                            aria-pressed={isSaved}
                            className={`absolute right-1.5 top-1.5 z-10 rounded-lg p-1.5 transition ${
                              isSaved
                                ? "bg-black/80 text-[#ff7a7a]"
                                : "bg-black/60 text-white opacity-100 hover:bg-black/80 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            }`}
                          >
                            {isSaved ? (
                              <BookmarkCheck className="h-4 w-4" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {visible < filtered.length && (
                    <div ref={loadMoreRef} className="h-8" aria-hidden="true" />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t">
        <div className="flex flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            ChadTube — a personal, algorithm-free video site. Videos play via
            YouTube embeds.
          </span>
          <span>
            Inspired by Karpathy’s TristanTube · curated from Tristan Hume’s
            2026 channel tier list · data harvested with yt-dlp
          </span>
        </div>
      </footer>
    </div>
  );
}
