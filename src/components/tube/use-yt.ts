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
  onEnd?: () => void;
  onState?: (state: number) => void;
}

/**
 * Mount a YouTube IFrame player into a div.
 * The host div must live inside a sized container (e.g. aspect-video).
 * A plain mount div is managed manually so React never fights the iframe swap.
 *
 * A FRESH player is created for every videoId. Reusing one iframe via
 * loadVideoById keeps painting the previous video's last frame — or its whole
 * YouTube end screen — until the new video's first frame decodes, which
 * leaked for seconds after every navigation. Destroying the iframe removes
 * that stale content instantly; the new one starts on its own thumbnail,
 * exactly like a fresh embed. No cover layers needed anywhere.
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
    // A new mount div per player: YT.Player consumes the element it is given
    // (replaces it with the iframe) and destroy() does not restore it.
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
        playerVars: {
          autoplay: cbRef.current.autoplay ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          // Native chrome off: the app renders its own hover control bar.
          controls: 0,
          disablekb: 1,
          iv_load_policy: 3,
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
      if (playerRef.current === player) playerRef.current = null;
      host.innerHTML = "";
    };
    // Re-create the whole player whenever the video changes (see doc above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.videoId]);

  return { hostRef, playerRef };
}
