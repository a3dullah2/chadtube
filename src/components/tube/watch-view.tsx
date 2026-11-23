"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  RectangleHorizontal,
  SkipForward,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
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
  const endIntRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  // True while a video is loading and until its first frame actually plays.
  // The YouTube iframe is REUSED across videos (loadVideoById), and it keeps
  // painting the previous video's last frame — or, if that one ended, its
  // full end screen (share / watch-later / "More videos" / logo) — through
  // the unstarted(-1), cued(5) and buffering(3) states. An opaque cover
  // hides all of that; it starts true so even the very first video opens on
  // a clean loading screen instead of stale iframe content.
  const [swapping, setSwapping] = useState(true);

  // ----- custom player chrome (hover-only controls) -----
  const shellRef = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchRef = useRef(false);
  const pstateRef = useRef(-1);
  const prevStateRef = useRef(-1); // player state before the current one
  const playedRef = useRef(false); // current video has actually started playing
  const [pstate, setPstate] = useState(-1); // YT player state (-1 unstarted .. 3 buffering)
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(100);
  const [hover, setHover] = useState(false);
  const [touchUi, setTouchUi] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [fs, setFs] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null); // seek fraction while dragging

  // Controls follow YouTube's rules: visible while the mouse is over the
  // video (or after a touch tap), hidden the moment it leaves, and during
  // playback they fade out after 3s without mouse movement. All visibility
  // changes are driven by events (player state, mouse) — never by effects.
  // Reset-style: every call clears any pending hide, so continuous mouse
  // movement keeps controls up and only true 3s idleness hides them.
  // (The old guard-against-re-schedule version hid the bar mid-hover because
  // the first-scheduled timeout was never extended by later movement.)
  const scheduleHide = (ms = 3000) => {
    cancelHide();
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null;
      setControlsHidden(true);
    }, ms);
  };

  const cancelHide = () => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  // Auto-advance bookkeeping for the ended overlay. Cancelled whenever the
  // user navigates elsewhere, replays, or leaves the watch page.
  const clearEnd = () => {
    if (endRef.current) {
      clearTimeout(endRef.current);
      endRef.current = null;
    }
    if (endIntRef.current) {
      clearInterval(endIntRef.current);
      endIntRef.current = null;
    }
    setCountdown(null);
  };

  const replay = () => {
    clearEnd();
    setSwapping(true); // cover the old end screen while it re-buffers
    const p = playerRef.current;
    try {
      p?.seekTo(0, true);
      p?.playVideo();
    } catch {
      /* not ready */
    }
  };

  // Navigate to another video. Always raise the swap cover: loadVideoById
  // keeps the old iframe content — end screen if the video had ended, else
  // its last frame — visible until the new video's first frame renders.
  // (The [video.id] effect below raises it too; this covers the same-tick
  // render so the end card never flashes on the way out.)
  const selectVideo = (v: Vid) => {
    setSwapping(true);
    clearEnd();
    onSelect(v);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.getPlayerState?.() === 1) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* not ready */
    }
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (p.isMuted?.()) p.unMute();
      else p.mute();
    } catch {
      /* not ready */
    }
  };

  const changeVol = (v: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume(v);
      if (v > 0 && p.isMuted?.()) p.unMute();
    } catch {
      /* not ready */
    }
    setVol(v);
  };

  const toggleFs = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  const seekTo = (frac: number) => {
    const p = playerRef.current;
    if (!p || !dur) return;
    try {
      p.seekTo(frac * dur, true);
    } catch {
      /* not ready */
    }
  };

  // Click on the video toggles playback; double-click goes fullscreen.
  // The pending click is cancelled when a double-click lands.
  const onShellClick = () => {
    if (touchRef.current) {
      // Mobile-style: tap toggles the chrome; auto-hide only while playing.
      if (controlsHidden) {
        setControlsHidden(false);
        setTouchUi(true);
        if (pstateRef.current === 1) scheduleHide();
      } else {
        cancelHide();
        setControlsHidden(true);
      }
      return;
    }
    if (clickTimer.current) return;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      togglePlay();
    }, 250);
  };

  const onShellDoubleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    toggleFs();
  };

  const onOverlayMouseMove = (e: React.MouseEvent) => {
    setHover(true);
    const inBar = !!(e.target as HTMLElement | null)?.closest?.("[data-ct-bar]");
    if (inBar) {
      // Interacting with the bar itself: pin controls, never fade mid-drag.
      cancelHide();
      setControlsHidden(false);
    } else if (pstateRef.current === 1) {
      setControlsHidden(false);
      scheduleHide(); // reset on every move -> only true idleness hides
    } else {
      // paused / buffering / ended -> controls stay up while hovered
      cancelHide();
      setControlsHidden(false);
    }
  };

  const onShellMouseLeave = () => {
    setHover(false);
    setTouchUi(false);
    cancelHide();
    setControlsHidden(true); // mouse off the video -> always hide
  };

  const { hostRef, playerRef } = useYTPlayer({
    videoId: video.id,
    autoplay: true,
    onState: (s) => {
      prevStateRef.current = pstateRef.current;
      pstateRef.current = s;
      setPstate(s);
      if (s === 1) {
        playedRef.current = true;
        setSwapping(false); // the new video's first frame is on screen
        scheduleHide();
      } else {
        if (s === 2 && playedRef.current) setSwapping(false);
        cancelHide();
        setControlsHidden(false); // paused/buffering/ended -> show while hovered
      }
    },
    onEnd: () => {
      if (autoplay && next) {
        // Our own end card replaces YouTube's end screen; advance after 5s.
        setCountdown(5);
        endIntRef.current = setInterval(() => {
          setCountdown((c) => (c !== null && c > 1 ? c - 1 : null));
        }, 1000);
        endRef.current = setTimeout(() => {
          clearEnd();
          selectVideo(next);
        }, 5000);
      }
    },
  });

  useEffect(
    () => () => {
      if (endRef.current) clearTimeout(endRef.current);
      if (endIntRef.current) clearInterval(endIntRef.current);
    },
    []
  );

  // A pending auto-advance belongs to the video that just ended — navigating
  // to any other video must cancel it instead of hijacking the navigation.
  // Every video change also re-raises the swap cover: the reused iframe keeps
  // showing the old video's end screen / last frame through the -1/5/3 load
  // states until the new one actually plays (onState clears it then; a user
  // pause of an already-started video clears it too).
  useEffect(() => {
    clearEnd();
    playedRef.current = false;
    setSwapping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  // Player-state polling + controls visibility machinery.
  useEffect(() => {
    try {
      touchRef.current = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    } catch {
      /* noop */
    }
    const poll = setInterval(() => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      try {
        setCur(p.getCurrentTime() || 0);
        setDur(p.getDuration() || 0);
        setBuf(p.getVideoLoadedFraction() || 0);
        setMuted(!!p.isMuted?.());
        const v = p.getVolume?.();
        if (typeof v === "number") setVol(v);
      } catch {
        /* player mid-swap */
      }
    }, 250);
    const onFs = () => setFs(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearInterval(poll);
      document.removeEventListener("fullscreenchange", onFs);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  // YouTube-style shortcuts (t = theater, f = fullscreen, m = mute,
  // space/k = play-pause, arrows = seek). Inline player calls keep this
  // effect's dependencies to just the theater props.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "t") {
        onTheaterChange(!theater);
        return;
      }
      const p = playerRef.current;
      if (!p) return;
      try {
        if (e.key === " " || e.key === "k") {
          e.preventDefault();
          if (p.getPlayerState?.() === 1) p.pauseVideo();
          else p.playVideo();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          p.seekTo(p.getCurrentTime() + 5, true);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          p.seekTo(Math.max(0, p.getCurrentTime() - 5), true);
        } else if (e.key === "m") {
          if (p.isMuted?.()) p.unMute();
          else p.mute();
        } else if (e.key === "f") {
          toggleFs();
        }
      } catch {
        /* not ready */
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theater, onTheaterChange, playerRef]);

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
              onClick={() => selectVideo(next)}
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
            {(() => {
              const show = (hover || touchUi) && !controlsHidden;
              // Paused (or paused-then-rebuffering): YouTube paints its own
              // pause overlay (center play button, share / watch-later,
              // "More videos" row, logo) over a paused embed and offers no
              // playerVar to turn it off — so a paused embed is never shown;
              // it is covered by the poster + our own play glyph instead.
              const coverPaused =
                pstate === 2 || (pstate === 3 && prevStateRef.current === 2);
              const playedPct = dur ? (scrub ?? cur / dur) * 100 : 0;
              const bufPct = Math.max(playedPct, buf * 100);
              const seekGrad = `linear-gradient(to right, #e5484d 0%, #e5484d ${playedPct}%, rgba(255,255,255,.55) ${playedPct}%, rgba(255,255,255,.55) ${bufPct}%, rgba(255,255,255,.25) ${bufPct}%)`;
              const volPct = muted ? 0 : vol;
              const volGrad = `linear-gradient(to right, #fff 0%, #fff ${volPct}%, rgba(255,255,255,.25) ${volPct}%)`;
              return (
                <div
                  ref={shellRef}
                  className={cn(
                    "relative overflow-hidden bg-black",
                    theater ? "w-full" : "aspect-video w-full rounded-xl"
                  )}
                  style={theater ? { height: "min(85vh, 56.25vw)" } : undefined}
                >
                  <div ref={hostRef} className="h-full w-full" />

                  {/*
                    Event-capture overlay: the cross-origin YouTube iframe is
                    out-of-process and never reports mouse movement to this
                    page, so a transparent layer above it drives hover
                    detection, click-to-pause and double-click fullscreen.
                    Playback itself is driven through the IFrame API.
                  */}
                  <div
                    className={cn("absolute inset-0", !show && "cursor-none")}
                    onMouseEnter={() => {
                      setHover(true);
                      setControlsHidden(false); // show instantly, no wiggle needed
                      if (pstateRef.current === 1) scheduleHide();
                    }}
                    onMouseMove={onOverlayMouseMove}
                    onMouseLeave={onShellMouseLeave}
                    onClick={onShellClick}
                    onDoubleClick={onShellDoubleClick}
                  >
                    {/* Hover-only control bar — YouTube-style. The bar lives
                        inside the overlay so moving onto it keeps controls up. */}
                    <div
                      data-ct-bar
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className={cn(
                        "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent pb-1 pt-8 transition-opacity duration-200",
                        show ? "opacity-100" : "pointer-events-none opacity-0"
                      )}
                    >
                    <div className="px-3">
                      <input
                        type="range"
                        min={0}
                        max={1000}
                        step={1}
                        aria-label="Seek"
                        className="ct-range h-1 w-full"
                        style={{ background: seekGrad }}
                        value={Math.round((scrub ?? (dur ? cur / dur : 0)) * 1000)}
                        onChange={(e) => {
                          const frac = Number(e.target.value) / 1000;
                          setScrub(frac);
                          seekTo(frac);
                        }}
                        onPointerDown={() => {
                          if (touchRef.current) setTouchUi(true);
                        }}
                        onPointerUp={() => setScrub(null)}
                        onKeyUp={() => setScrub(null)}
                        onBlur={() => setScrub(null)}
                      />
                    </div>
                    <div className="flex items-center gap-0.5 px-1.5 text-white">
                      <button
                        onClick={togglePlay}
                        aria-label={pstate === 1 ? "Pause" : "Play"}
                        className="ct-cbtn"
                      >
                        {pstate === 1 ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={toggleMute}
                        aria-label={muted ? "Unmute" : "Mute"}
                        className="ct-cbtn"
                      >
                        {muted || vol === 0 ? (
                          <VolumeX className="h-5 w-5" />
                        ) : vol < 50 ? (
                          <Volume1 className="h-5 w-5" />
                        ) : (
                          <Volume2 className="h-5 w-5" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        aria-label="Volume"
                        className="ct-range h-1 w-16"
                        style={{ background: volGrad }}
                        value={muted ? 0 : vol}
                        onChange={(e) => changeVol(Number(e.target.value))}
                      />
                      <span className="ml-1.5 text-xs tabular-nums text-white/90">
                        {fmtDur(scrub !== null ? scrub * dur : cur) || "0:00"} /{" "}
                        {fmtDur(dur) || "0:00"}
                      </span>
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          onClick={() => onTheaterChange(!theater)}
                          aria-pressed={theater}
                          title="Theater mode (t)"
                          aria-label="Theater mode"
                          className="ct-cbtn"
                        >
                          <RectangleHorizontal className="h-5 w-5" />
                        </button>
                        <button
                          onClick={toggleFs}
                          aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
                          title="Fullscreen (f)"
                          className="ct-cbtn"
                        >
                          {fs ? (
                            <Minimize className="h-5 w-5" />
                          ) : (
                            <Maximize className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  </div>

                  {coverPaused && (
                    /* Paused cover — the video's poster (maxres → hq720 →
                       hqdefault fallback chain) dimmed, with our own play
                       button. Sits at z-[5]: above the iframe (hiding YouTube's
                       pause overlay) but below the control bar (z-10), which
                       stays usable while paused. pointer-events-none keeps
                       every click hitting the overlay below (click = resume). */
                    <div className="pointer-events-none absolute inset-0 z-[5]">
                      <img
                        key={video.id}
                        src={`https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`}
                        onError={(e) => {
                          const img = e.currentTarget;
                          const step = Number(img.dataset.pstep ?? 0);
                          if (step === 0) {
                            img.dataset.pstep = "1";
                            img.src = `https://i.ytimg.com/vi/${video.id}/hq720.jpg`;
                          } else if (step === 1) {
                            img.dataset.pstep = "2";
                            img.src = thumbUrl(video.id, true);
                          }
                        }}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40" />
                      <div className="absolute inset-0 grid place-items-center">
                        <div className="grid h-16 w-16 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/30">
                          <Play className="h-7 w-7 translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  )}

                  {pstate === 3 && (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                    </div>
                  )}
                  {(pstate === -1 || pstate === 5) && (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white">
                        <Play className="h-7 w-7 translate-x-0.5" />
                      </div>
                    </div>
                  )}

                  {swapping && pstate !== 1 && (
                    /* Swap cover: until the new video's first frame renders,
                       the reused iframe still paints the previous video's
                       YouTube end screen (share / "More videos" / logo), its
                       last frame, or its PAUSE overlay if the user navigated
                       while paused. Cover EVERY non-playing state — unstarted
                       (-1), cued (5), buffering (3), paused (2), ended (0)
                       mid-swap: YT walks through -1/5 on loadVideoById and
                       the old content leaks exactly there. Clicks pass
                       through to the shell so the video can still be started
                       by hand if autoplay is blocked. */
                    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black text-white">
                      {pstate === 0 || pstate === 3 ? (
                        <div className="flex flex-col items-center gap-4">
                          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                          <div className="text-xs uppercase tracking-widest text-white/60">
                            Loading…
                          </div>
                        </div>
                      ) : (
                        <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/25">
                          <Play className="h-7 w-7 translate-x-0.5" />
                        </div>
                      )}
                    </div>
                  )}

                  {pstate === 0 && !swapping && (
                    /* Opaque end card: fully covers YouTube's own end screen
                       (share / watch-later buttons, "More videos" row, logo). */
                    <div className="absolute inset-0 z-20 grid place-items-center bg-black text-white">
                      <div className="flex flex-col items-center gap-4 px-6 text-center">
                        {next && (
                          <>
                            <div className="text-xs uppercase tracking-widest text-white/60">
                              {countdown !== null
                                ? `Up next in ${countdown}s`
                                : "Up next"}
                            </div>
                            <button
                              onClick={() => selectVideo(next)}
                              className="w-[440px] max-w-[85vw] rounded-xl bg-white/10 p-4 text-left transition hover:bg-white/15"
                            >
                              <div className="line-clamp-2 font-medium">
                                {next.t}
                              </div>
                              <div className="mt-1 text-xs text-white/60">
                                {chanName(next, channels)}
                              </div>
                            </button>
                          </>
                        )}
                        <div className="flex items-center gap-2">
                          {next && (
                            <Button
                              size="sm"
                              onClick={() => selectVideo(next)}
                              className="gap-2 bg-[#e5484d] text-white hover:bg-[#d23c41]"
                            >
                              <SkipForward className="h-4 w-4" /> Play now
                            </Button>
                          )}
                          {countdown !== null && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={clearEnd}
                              className="border-white/30 bg-transparent text-white hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={replay}
                            className="border-white/30 bg-transparent text-white hover:bg-white/10"
                          >
                            Replay
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
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
                    onClick={() => selectVideo(u)}
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
                      onClick={() => selectVideo(u)}
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
