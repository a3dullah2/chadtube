"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, SkipForward, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useYTPlayer } from "./use-yt";
import { fmtDur, fmtViews, TIER_COLORS, thumbUrl } from "./utils";
import type { Chan, Tier, Vid } from "./types";

interface WatchViewProps {
  video: Vid;
  queue: Vid[];
  channels: Chan[];
  autoplay: boolean;
  onAutoplayChange: (v: boolean) => void;
  onBack: () => void;
  onSelect: (v: Vid) => void;
  onTv: () => void;
}

export function WatchView({
  video,
  queue,
  channels,
  autoplay,
  onAutoplayChange,
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
    <div className="mx-auto max-w-[1700px] px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <div ref={hostRef} className="h-full w-full" />
          </div>
          <h1 className="mt-3 text-lg font-semibold leading-snug">{video.t}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{chan?.n}</span>
            <Badge
              style={{
                backgroundColor: TIER_COLORS[(chan?.tier ?? "D") as Tier],
                color: "#111",
              }}
              className="border-0"
            >
              {chan?.tier} tier
            </Badge>
            <span>{fmtViews(video.v)}</span>
            {fmtDur(video.d) && <span>{fmtDur(video.d)}</span>}
          </div>
        </div>

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
                    <div className="line-clamp-2 text-sm font-medium">{u.t}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {channels[u.c]?.n} · {fmtViews(u.v)}
                    </div>
                  </div>
                </button>
              ))}
              {upNext.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">End of queue.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
