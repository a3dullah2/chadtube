"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dices,
  History,
  Home,
  Menu,
  Moon,
  Play,
  Search,
  Sun,
  Tv,
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
import { TvMode } from "./tv-mode";
import { WatchView } from "./watch-view";
import type { Chan, HistEntry, SortMode, Tier, TubeData, Vid } from "./types";
import {
  chanName,
  fmtAge,
  fmtDur,
  fmtTimeAgo,
  fmtViews,
  metaJoin,
  shuffleSeeded,
  TIER_COLORS,
  TIER_LABELS,
  thumbUrl,
} from "./utils";

const TIERS: Tier[] = ["S", "A", "B", "C", "D", "★"];
const PAGE = 40;

type View = "home" | "watch" | "history";

export function TubeApp() {
  const [data, setData] = useState<TubeData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<View>("home");
  const [current, setCurrent] = useState<Vid | null>(null);
  const [queue, setQueue] = useState<Vid[]>([]);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | Tier>("all");
  const [chan, setChan] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>("newest");
  const [seed, setSeed] = useState(1);
  const [visible, setVisible] = useState(PAGE);
  const [drawer, setDrawer] = useState(false);
  const [tv, setTv] = useState(false);
  const [tvQueue, setTvQueue] = useState<Vid[]>([]);
  const [tvStart, setTvStart] = useState(0);
  const [hist, setHist] = useState<HistEntry[]>([]);
  const [autoplay, setAutoplay] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Data + persisted prefs (async: never setState synchronously inside the effect)
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (!alive) return;
      try {
        const h = localStorage.getItem("mytube.hist");
        if (h) setHist(JSON.parse(h));
        const a = localStorage.getItem("mytube.autoplay");
        if (a !== null) setAutoplay(a === "1");
      } catch {
        /* noop */
      }
      setMounted(true);
      try {
        const r = await fetch("/api/videos");
        if (!r.ok) throw new Error("bad response");
        const d = (await r.json()) as TubeData;
        if (alive) setData(d);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pushHist = useCallback((id: string) => {
    setHist((prev) => {
      const next = [{ id, ts: Date.now() }, ...prev.filter((h) => h.id !== id)].slice(0, 300);
      try {
        localStorage.setItem("mytube.hist", JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const clearHist = useCallback(() => {
    setHist([]);
    try {
      localStorage.removeItem("mytube.hist");
    } catch {
      /* noop */
    }
    toast({ title: "Watch history cleared" });
  }, [toast]);

  const changeAutoplay = useCallback((v: boolean) => {
    setAutoplay(v);
    try {
      localStorage.setItem("mytube.autoplay", v ? "1" : "0");
    } catch {
      /* noop */
    }
  }, []);

  const channels = data?.channels ?? [];

  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toLowerCase();
    let out = data.videos.filter((v) => {
      if (tier !== "all" && (data.channels[v.c]?.tier as Tier) !== tier) return false;
      if (chan !== null && v.c !== chan) return false;
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
    if (sort === "newest")
      out = [...out].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || b.v - a.v);
    else if (sort === "views") out = [...out].sort((a, b) => b.v - a.v);
    else if (sort === "longest") out = [...out].sort((a, b) => b.d - a.d);
    else if (sort === "shuffle") out = shuffleSeeded(out, seed);
    return out;
  }, [data, q, tier, chan, sort, seed]);

  const applyFilter = useCallback(() => {
    setVisible(PAGE);
    // Typing in search or changing filters should return to the grid
    setView("home");
  }, []);

  const openFromGrid = useCallback(
    (v: Vid, list: Vid[]) => {
      setQueue(list);
      setCurrent(v);
      setView("watch");
      pushHist(v.id);
      window.scrollTo({ top: 0 });
    },
    [pushHist]
  );

  const openInQueue = useCallback(
    (v: Vid) => {
      setCurrent(v);
      pushHist(v.id);
      window.scrollTo({ top: 0 });
    },
    [pushHist]
  );

  const reshuffle = useCallback(() => {
    setSort("shuffle");
    setSeed(Math.floor(Math.random() * 1e9));
    setVisible(PAGE);
    toast({
      title: "Shuffled",
      description: `${filtered.length.toLocaleString()} videos in a brand-new order`,
    });
  }, [filtered.length, toast]);

  const openTv = useCallback(
    (startIdx?: number) => {
      const list = view === "watch" && queue.length ? queue : filtered;
      if (!list.length) {
        toast({ title: "Nothing to play", description: "No videos match the current filters." });
        return;
      }
      setTvQueue(list);
      setTvStart(
        startIdx !== undefined && startIdx >= 0
          ? startIdx
          : Math.floor(Math.random() * list.length)
      );
      setTv(true);
    },
    [view, queue, filtered, toast]
  );

  const goHome = useCallback(() => {
    setView("home");
    setDrawer(false);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const histVids = useMemo(() => {
    if (!data) return [];
    return hist
      .map((h) => ({ h, v: data.videos.find((x) => x.id === h.id) }))
      .filter((x): x is { h: HistEntry; v: Vid } => !!x.v)
      .map((x) => ({ entry: x.h, vid: x.v }));
  }, [data, hist]);

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
          setTier("all");
          setChan(null);
          applyFilter();
          goHome();
          onNavigate?.();
        })}
        {navItem(<Tv className="h-4 w-4" />, "TV mode", false, () => {
          openTv();
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

  const chip = (t: "all" | Tier) => {
    const active = tier === t;
    return (
      <button
        key={t}
        onClick={() => {
          setTier(t);
          applyFilter();
        }}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "border-transparent bg-foreground text-background"
            : "bg-secondary text-secondary-foreground hover:bg-accent"
        }`}
        aria-pressed={active}
      >
        {t !== "all" && (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: TIER_COLORS[t] }}
          />
        )}
        {t === "all" ? "All" : t}
      </button>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
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
          <button
            className="flex items-center gap-2"
            onClick={goHome}
            aria-label="MyTube home"
          >
            <span className="grid h-7 w-10 place-items-center rounded-md bg-[#e5484d]">
              <Play className="h-4 w-4 fill-white text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">MyTube</span>
          </button>
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
              size="sm"
              onClick={() => openTv()}
              className="hidden gap-2 bg-[#e5484d] text-white hover:bg-[#d23c41] sm:inline-flex"
            >
              <Tv className="h-4 w-4" /> TV mode
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => openTv()}
              aria-label="TV mode"
            >
              <Tv className="h-5 w-5" />
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
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r md:block">
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
              {sidebarContent(() => setDrawer(false))}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">
          {view === "watch" && current && data ? (
            <WatchView
              video={current}
              queue={queue}
              channels={channels}
              autoplay={autoplay}
              onAutoplayChange={changeAutoplay}
              onBack={goHome}
              onSelect={openInQueue}
              onTv={() =>
                openTv(Math.max(0, queue.findIndex((v) => v.id === current.id)))
              }
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
          ) : (
            <>
              {/* Filter chips */}
              <div className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur">
                <div className="flex items-center gap-2 overflow-x-auto px-4 py-2">
                  {chip("all")}
                  {TIERS.map((t) => chip(t))}
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
                  <div className="ml-auto shrink-0 pl-2">
                    <Select value={sort} onValueChange={(v) => { setSort(v as SortMode); applyFilter(); }}>
                      <SelectTrigger
                        size="sm"
                        className="w-[150px] rounded-full"
                        aria-label="Sort videos"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
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
                    {" · "}
                    {channels.length} channels · newest uploads across the whole
                    line-up, zero algorithm
                    {q.trim() && <> · results for “{q.trim()}”</>}
                  </>
                ) : loadError ? (
                  "Couldn’t load the video library."
                ) : (
                  "Loading library…"
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
                <div className="p-16 text-center text-muted-foreground">
                  Failed to load videos. Try refreshing the page.
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
                      return (
                        <button
                          key={v.id}
                          onClick={() => openFromGrid(v, filtered)}
                          className="group text-left"
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
                      );
                    })}
                  </div>
                  {visible < filtered.length && (
                    <div className="pb-6 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setVisible((n) => n + PAGE * 2)}
                      >
                        Load more ({(filtered.length - visible).toLocaleString()} remaining)
                      </Button>
                    </div>
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
            MyTube — a personal, algorithm-free video site. Videos play via
            YouTube embeds.
          </span>
          <span>
            Inspired by Karpathy’s TristanTube · curated from Tristan Hume’s
            2026 channel tier list · data harvested with yt-dlp
          </span>
        </div>
      </footer>

      {/* TV mode overlay */}
      {tv && (
        <TvMode
          queue={tvQueue}
          channels={channels}
          startIndex={tvStart}
          onExit={() => setTv(false)}
        />
      )}
    </div>
  );
}
