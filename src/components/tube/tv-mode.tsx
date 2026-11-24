"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useYTPlayer } from "./use-yt";
import { chanName, fmtDur, fmtViews, metaJoin, TIER_COLORS, thumbUrl } from "./utils";
import type { Chan, Tier, Vid } from "./types";

interface TvModeProps {
  queue: Vid[];
  channels: Chan[];
  startIndex: number;
  onExit: () => void;
}

const YT_PLAYING = 1;

export function TvMode({ queue, channels, startIndex, onExit }: TvModeProps) {
  const [idx, setIdx] = useState(startIndex);
  const [muted, setMuted] = useState(false);
  const [osdVisible, setOsdVisible] = useState(true);
  const [progress, setProgress] = useState({ cur: 0, dur: 0 });
  const [pendingDeadline, setPendingDeadline] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const safeIdx = ((idx % queue.length) + queue.length) % Math.max(queue.length, 1);
  const video = queue[safeIdx];
  const nextVid = queue[(safeIdx + 1) % Math.max(queue.length, 1)];
  const chan = video ? channels[video.c] : null;

  const goTo = useCallback(
    (i: number) => {
      setPendingDeadline(null);
      setIdx(((i % queue.length) + queue.length) % queue.length);
      setProgress({ cur: 0, dur: 0 });
    },
    [queue.length]
  );

  const advance = useCallback(() => {
    goTo(safeIdx + 1);
  }, [goTo, safeIdx]);
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  });
  const firedRef = useRef(false);

  const { hostRef, playerRef } = useYTPlayer({
    videoId: video?.id ?? "",
    autoplay: true,
    onEnd: () => {
      firedRef.current = false;
      setPendingDeadline(Date.now() + 5000);
    },
  });

  // Up-next countdown tick
  useEffect(() => {
    if (pendingDeadline === null) return;
    const t = window.setInterval(() => {
      setNowTick(Date.now());
      if (!firedRef.current && Date.now() >= pendingDeadline) {
        firedRef.current = true;
        advanceRef.current();
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [pendingDeadline]);

  // Progress polling
  useEffect(() => {
    const t = window.setInterval(() => {
      const p = playerRef.current;
      if (p && typeof p.getCurrentTime === "function") {
        try {
          setProgress({
            cur: p.getCurrentTime() || 0,
            dur: p.getDuration() || 0,
          });
          setMuted(!!p.isMuted?.());
        } catch {
          /* not ready */
        }
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [playerRef]);

  // Idle OSD auto-hide
  const idleTimer = useRef<number | null>(null);
  const poke = useCallback(() => {
    setOsdVisible(true);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setOsdVisible(false), 3500);
  }, []);
  useEffect(() => {
    window.addEventListener("mousemove", poke);
    idleTimer.current = window.setTimeout(() => setOsdVisible(false), 3500);
    return () => {
      window.removeEventListener("mousemove", poke);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [poke]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.getPlayerState() === YT_PLAYING) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* not ready */
    }
  }, [playerRef]);

  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.isMuted()) p.unMute();
      else p.mute();
      setMuted(!!p.isMuted());
    } catch {
      /* not ready */
    }
  }, [playerRef]);

  const seek = useCallback(
    (delta: number) => {
      const p = playerRef.current;
      if (!p) return;
      try {
        p.seekTo(Math.max(0, p.getCurrentTime() + delta), true);
      } catch {
        /* not ready */
      }
    },
    [playerRef]
  );

  const changeVol = useCallback(
    (delta: number) => {
      const p = playerRef.current;
      if (!p) return;
      try {
        p.setVolume(Math.min(100, Math.max(0, p.getVolume() + delta)));
      } catch {
        /* not ready */
      }
    },
    [playerRef]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const interactive = (e.target as HTMLElement | null)?.closest?.(
        "button, a, input, textarea, select"
      );
      switch (e.key) {
        case "Escape":
          onExit();
          break;
        case " ":
          if (interactive) return;
          e.preventDefault();
          toggle();
          break;
        case "n":
          advance();
          break;
        case "p":
          goTo(safeIdx - 1);
          break;
        case "m":
          toggleMute();
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(-10);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVol(10);
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVol(-10);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, toggle, advance, goTo, safeIdx, toggleMute, seek, changeVol]);

  if (!video) return null;
  const pct = progress.dur > 0 ? (progress.cur / progress.dur) * 100 : 0;
  const countdown =
    pendingDeadline === null
      ? 0
      : Math.max(0, Math.ceil((pendingDeadline - nowTick) / 1000));

  return (
    <div
      className="fixed inset-0 z-[100] bg-black text-white select-none"
      style={{ cursor: osdVisible ? "default" : "none" }}
      role="dialog"
      aria-label="TV mode"
    >
      {/* Player. A fresh iframe is mounted for every video (see use-yt), so
          the previous video's end screen can never linger. The thumbnail
          underneath fills the split second before the new iframe paints. */}
      <div className="absolute inset-0">
        <img
          key={video.id}
          src={thumbUrl(video.id, true)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Click catcher: swallows iframe focus, click toggles play */}
      <div
        className="absolute inset-0 z-10"
        onClick={toggle}
        aria-label="Toggle playback"
      />

      {/* Top bar */}
      <div
        className={`absolute inset-x-0 top-0 z-30 flex justify-end gap-1 bg-gradient-to-b from-black/70 to-transparent p-4 transition-opacity duration-300 ${
          osdVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => goTo(safeIdx - 1)}
          className="text-white hover:bg-white/20"
          aria-label="Previous video"
        >
          <SkipBack className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={advance}
          className="text-white hover:bg-white/20"
          aria-label="Next video"
        >
          <SkipForward className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          className="text-white hover:bg-white/20"
          aria-label="Mute"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onExit}
          className="text-white hover:bg-white/20"
          aria-label="Exit TV mode"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Bottom OSD */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 p-6 pt-24 transition-opacity duration-300 ${
          osdVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(transparent, rgba(0,0,0,.88))",
        }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{video.t}</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-white/70">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-black"
                  style={{
                    backgroundColor:
                      TIER_COLORS[(chan?.tier ?? "D") as Tier],
                  }}
                >
                  {chan?.tier}
                </span>
                {video.up || chan?.n} · {metaJoin(fmtViews(video.v), fmtDur(video.d))}
              </p>
            </div>
            <div className="shrink-0 text-right text-sm text-white/60">
              {safeIdx + 1} / {queue.length}
              <div className="mt-1 hidden text-xs sm:block">
                space play · n next · p prev · m mute · esc exit
              </div>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-[#e5484d] transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Up-next countdown overlay (only after the video actually ended) */}
      {pendingDeadline !== null && nextVid && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm uppercase tracking-widest text-white/60">
              Up next in {countdown}s
            </p>
            <div className="flex items-center gap-4">
              <img
                src={thumbUrl(nextVid.id, true)}
                alt=""
                className="w-52 rounded-lg"
              />
              <div className="max-w-sm text-left">
                <p className="line-clamp-2 font-semibold">{nextVid.t}</p>
                <p className="mt-1 text-sm text-white/60">
                  {metaJoin(chanName(nextVid, channels), fmtViews(nextVid.v))}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={advance}
                className="gap-2 bg-[#e5484d] text-white hover:bg-[#d23c41]"
              >
                <Play className="h-4 w-4" /> Play now
              </Button>
              <Button
                variant="outline"
                onClick={() => setPendingDeadline(null)}
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                Stay here
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
