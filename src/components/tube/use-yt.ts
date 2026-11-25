"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;

/** Load the YouTube IFrame API once. */
export function loadYTApi(): Promise<any> {
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
        return;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export interface PlayerOpts {
  videoId: string;
  autoplay?: boolean;
  /** Resume position in seconds (mapped to the standard `start` playerVar). */
  start?: number;
  onEnd?: () => void;
  onState?: (state: number) => void;
}

/**
 * Mount a YouTube IFrame player into a div.
 * The host div must live inside a sized container (e.g. aspect-video).
 * A plain mount div is managed manually so React never fights the iframe swap.
 */
export function useYTPlayer(opts: PlayerOpts) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const cbRef = useRef(opts);
  useEffect(() => {
    cbRef.current = opts;
  });

  useEffect(() => {
    let cancelled = false;
    let player: any = null;
    const host = hostRef.current;
    if (!host) return;
    const mount = document.createElement("div");
    mount.style.width = "100%";
    mount.style.height = "100%";
    host.appendChild(mount);

    loadYTApi().then((YT) => {
      if (cancelled || !YT) return;
      player = new YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId: cbRef.current.videoId,
        // Standard embed defaults: YouTube renders its own native controls
        // (controls defaults to 1). No chrome-suppressing params.
        playerVars: {
          autoplay: cbRef.current.autoplay ? 1 : 0,
          rel: 0,
          playsinline: 1,
          ...(cbRef.current.start
            ? { start: Math.floor(cbRef.current.start) }
            : {}),
        },
        events: {
          onStateChange: (e: any) => {
            cbRef.current.onState?.(e.data);
            if (e.data === 0) cbRef.current.onEnd?.();
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      try {
        player?.destroy?.();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      host.innerHTML = "";
    };
  }, []);

  // Swap videos without remounting the player.
  const vidRef = useRef(opts.videoId);
  useEffect(() => {
    if (vidRef.current === opts.videoId) return;
    vidRef.current = opts.videoId;
    const p = playerRef.current;
    if (p && typeof p.loadVideoById === "function") {
      try {
        p.loadVideoById(opts.videoId);
      } catch {
        /* not ready yet */
      }
    }
  }, [opts.videoId]);

  return { hostRef, playerRef };
}
