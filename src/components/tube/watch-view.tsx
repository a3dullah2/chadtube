"use client";

import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  RectangleHorizontal,
  SkipForward,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useYTPlayer } from "./use-yt";
import { chanName, fmtAge, fmtDur, fmtViews, metaJoin, TIER_COLORS, thumbUrl } from "./utils";
import type { Chan, Tier, Vid } from "./types";

interface WatchViewProps {
  video: Vid;
  queue: Vid[];
  channels: Chan[];
  autoplay: boolean;
  theater: boolean;
  /** Resume position in seconds; undefined = start from the top. */
  startAt?: number;
  /** True when the video is in the saved (bookmarked) list. */
  bookmarked: boolean;
  onAutoplayChange: (v: boolean) => void;
  onTheaterChange: (v: boolean) => void;
  onToggleBookmark: () => void;
  /** Persist the last playback position (called on a 5s poll and on unmount). */
  onProgress: (id: string, pos: number, dur: number) => void;
  onBack: () => void;
  onSelect: (v: Vid) => void;
}

export function WatchView({
  video,
  queue,
  channels,
  autoplay,
  theater,
  startAt,
  bookmarked,
  onAutoplayChange,
  onTheaterChange,
  onToggleBookmark,
  onProgress,
  onBack,
  onSelect,
}: WatchViewProps) {
  const idx = queue.findIndex((v) => v.id === video.id);
  const next =
    idx >= 0 && idx + 1 < queue.length ? queue[idx + 1] : (queue[0] ?? null);
  const chan = channels[video.c];
  const upNext = idx >= 0 ? queue.slice(idx + 1, idx + 26) : queue.slice(0, 25);
  const endRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Watch-progress sampling. The YouTube IFrame API has no "on position
  // change" event, so poll getCurrentTime()/getDuration() every 5s and once
  // more on unmount — the freshest sample always lands in localStorage.
  const lastRef = useRef<{ pos: number; dur: number }>({ pos: 0, dur: 0 });
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  });

  const clearEnd = () => {
    if (endRef.current) {
      clearTimeout(endRef.current);
      endRef.current = null;
    }
  };

  // The player is a plain, standard YouTube embed. YouTube renders its own
  // native controls — progress bar, play/pause, volume, settings, fullscreen
  // — inside its iframe; this app draws nothing on top of it. The IFrame API
  // stays connected for two jobs: advancing Autoplay when a video ends, and
  // sampling getCurrentTime() so watch progress survives reloads.
  const { hostRef, playerRef } = useYTPlayer({
    videoId: video.id,
    autoplay: true,
    start: startAt,
    onEnd: () => {
      clearEnd();
      // A completed video is stored at 100% — progressRatio() then treats it
      // as finished, so its card stops showing a resume bar.
      const dur = lastRef.current.dur;
      if (dur > 0) onProgressRef.current(video.id, dur, dur);
      if (autoplay && next) {
        endRef.current = setTimeout(() => onSelect(next), 2000);
      }
    },
  });

  // Watch-progress sampling: runs the 5s poll; refs used by the player
  // callbacks above are declared just before it.
  useEffect(() => {
    lastRef.current = { pos: 0, dur: 0 };
    const sample = () => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      try {
        const pos = p.getCurrentTime();
        const dur = p.getDuration();
        // pos 0 = playback never started (autoplay blocked, still buffering)
        // — nothing to resume, don't record it.
        if (!dur || !isFinite(pos) || pos <= 0) return;
        lastRef.current = { pos, dur };
        onProgressRef.current(video.id, pos, dur);
      } catch {
        /* player not ready yet */
      }
    };
    const iv = setInterval(sample, 5000);
    return () => {
      clearInterval(iv);
      const { pos, dur } = lastRef.current;
      if (dur > 0 && pos > 0) onProgressRef.current(video.id, pos, dur);
    };
  }, [video.id]);

  // A pending auto-advance belongs to the video that just ended — navigating
  // to any other video must cancel it instead of hijacking the navigation.
  useEffect(() => {
    clearEnd();
  }, [video.id]);

  useEffect(
    () => () => {
      if (endRef.current) clearTimeout(endRef.current);
    },
    []
  );

  return (
    <>
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-4 pb-3 pt-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {idx >= 0 && (
          <span className="text-sm text-muted-foreground">
            {idx + 1} / {queue.length} in queue
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={autoplay}
              onCheckedChange={onAutoplayChange}
              aria-label="Autoplay next"
            />
            Autoplay
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleBookmark}
            aria-pressed={bookmarked}
            title={bookmarked ? "Remove from saved" : "Save for later"}
            className={cn(
              "gap-2",
              bookmarked && "border-[#e5484d]/50 text-[#e5484d] hover:text-[#e5484d]"
            )}
          >
            {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {bookmarked ? "Saved" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTheaterChange(!theater)}
            aria-pressed={theater}
            title="Theater mode (t)"
            className="gap-2"
          >
            <RectangleHorizontal className="h-4 w-4" /> Theater
          </Button>
          {next && (
            <Button
              size="sm"
              onClick={() => onSelect(next)}
              className="gap-2 bg-[#e5484d] text-white hover:bg-[#d23c41]"
            >
              Next <SkipForward className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className={theater ? "pb-6" : "mx-auto max-w-[1700px] px-4 pb-4"}>
        <div
          className={
            theater
              ? ""
              : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]"
          }
        >
          <div className="min-w-0">
            {/* Standard YouTube embed — the only child is the API mount div.
                No overlays, no custom controls, nothing drawn on top. */}
            <div
              className={
                theater
                  ? "w-full overflow-hidden bg-black"
                  : "aspect-video w-full overflow-hidden rounded-xl bg-black"
              }
              style={theater ? { height: "min(85vh, 56.25vw)" } : undefined}
            >
              <div ref={hostRef} className="h-full w-full" />
            </div>
            <h1
              className={cn(
                "text-lg font-semibold leading-snug",
                theater ? "mt-4 px-4" : "mt-3"
              )}
            >
              {video.t}
            </h1>
            <div
              className={cn(
                "mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground",
                theater && "px-4"
              )}
            >
              <span className="font-medium text-foreground">
                {video.up || chan?.n}
              </span>
              <Badge
                style={{
                  backgroundColor: TIER_COLORS[(chan?.tier ?? "D") as Tier],
                  color: "#111",
                }}
                className="border-0"
              >
                {chan?.tier} tier
              </Badge>
              {fmtViews(video.v) && <span>{fmtViews(video.v)}</span>}
              {fmtAge(video.ts) && <span>{fmtAge(video.ts)}</span>}
              {fmtDur(video.d) && <span>{fmtDur(video.d)}</span>}
            </div>
          </div>

          {theater ? (
            // Theater: Up next becomes a horizontal strip below the player.
            <div className="mt-5 px-4">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Up next
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {upNext.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onSelect(u)}
                    className="w-64 shrink-0 rounded-lg p-2 text-left hover:bg-accent"
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                      <img
                        src={thumbUrl(u.id)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {fmtDur(u.d) && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                          {fmtDur(u.d)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-sm font-medium">
                      {u.t}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {metaJoin(chanName(u, channels), fmtViews(u.v), fmtAge(u.ts))}
                    </div>
                  </button>
                ))}
                {upNext.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    End of queue.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                Up next
              </h2>
              <ScrollArea className="h-[420px] rounded-xl lg:h-[calc(100vh-190px)]">
                <div className="flex flex-col gap-1 pr-3">
                  {upNext.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => onSelect(u)}
                      className="flex gap-3 rounded-lg p-2 text-left hover:bg-accent"
                    >
                      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-md bg-muted">
                        <img
                          src={thumbUrl(u.id)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {fmtDur(u.d) && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">
                            {fmtDur(u.d)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-medium">
                          {u.t}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {metaJoin(chanName(u, channels), fmtViews(u.v), fmtAge(u.ts))}
                        </div>
                      </div>
                    </button>
                  ))}
                  {upNext.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">
                      End of queue.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
