"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, RectangleHorizontal, SkipForward, Tv } from "lucide-react";
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
  onAutoplayChange: (v: boolean) => void;
  onTheaterChange: (v: boolean) => void;
  onBack: () => void;
  onSelect: (v: Vid) => void;
  onTv: () => void;
}

export function WatchView({
  video,
  queue,
  channels,
  autoplay,
  theater,
  onAutoplayChange,
  onTheaterChange,
  onBack,
  onSelect,
  onTv,
}: WatchViewProps) {
  const idx = queue.findIndex((v) => v.id === video.id);
  const next =
    idx >= 0 && idx + 1 < queue.length ? queue[idx + 1] : (queue[0] ?? null);
  const chan = channels[video.c];
  const upNext = idx >= 0 ? queue.slice(idx + 1, idx + 26) : queue.slice(0, 25);
  const endRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (endRef.current) clearTimeout(endRef.current);
    },
    []
  );

  // "t" toggles theater mode, like YouTube's keyboard shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      onTheaterChange(!theater);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theater, onTheaterChange]);

  const { hostRef } = useYTPlayer({
    videoId: video.id,
    autoplay: true,
    onEnd: () => {
      if (autoplay && next) {
        endRef.current = setTimeout(() => onSelect(next), 1500);
      }
    },
  });

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
            onClick={() => onTheaterChange(!theater)}
            aria-pressed={theater}
            title="Theater mode (t)"
            className="gap-2"
          >
            <RectangleHorizontal className="h-4 w-4" /> Theater
          </Button>
          <Button variant="outline" size="sm" onClick={onTv} className="gap-2">
            <Tv className="h-4 w-4" /> TV mode
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
        {/*
          Theater collapses the two-column grid to a plain block so the player
          bleeds edge-to-edge. The player host div keeps the exact same tree
          position in both modes — swapping only its classes/size — so the
          YouTube iframe is never unmounted and playback continues seamlessly.
        */}
        <div
          className={
            theater
              ? ""
              : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]"
          }
        >
          <div className="min-w-0">
            <div
              className={cn(
                "overflow-hidden bg-black",
                theater ? "w-full" : "aspect-video w-full rounded-xl"
              )}
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
