import type { Tier } from "./types";

/** Tier accent colors (TristanTube palette). */
export const TIER_COLORS: Record<Tier, string> = {
  S: "#ff7a7a",
  A: "#ffb46b",
  B: "#ffe066",
  C: "#9be38a",
  D: "#7cc4ff",
  "★": "#ffd166",
};

export const TIER_LABELS: Record<Tier, string> = {
  S: "Masterpieces",
  A: "Binge the back catalog",
  B: "Basically every video is great",
  C: "Great watching",
  D: "Good quality stuff",
  "★": "Your playlist",
};

/** Attribution: playlist videos show their real uploader. */
export function chanName(v: { up?: string; c: number }, channels: { n: string }[]): string {
  return v.up || channels[v.c]?.n || "";
}

export function thumbUrl(id: string, big = false): string {
  return `https://i.ytimg.com/vi/${id}/${big ? "hqdefault" : "mqdefault"}.jpg`;
}

export function fmtViews(v: number): string {
  if (!v || v <= 0) return "";
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B views";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M views";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K views";
  return `${v} views`;
}

/** "3 days ago"-style upload age from a unix-seconds timestamp. */
export function fmtAge(ts?: number): string {
  if (!ts) return "";
  const d = Math.max(0, Math.floor(Date.now() / 1000 - ts) / 86400);
  const days = Math.floor(d);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const m = Math.round(days / 30);
    return m <= 1 ? "1 month ago" : `${m} months ago`;
  }
  const y = Math.round(days / 365);
  return y <= 1 ? "1 year ago" : `${y} years ago`;
}

/** Join non-empty meta parts with " · ". */
export function metaJoin(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

export function fmtDur(d: number): string {
  if (!d || d <= 0) return "";
  const h = Math.floor(d / 3600);
  const m = Math.floor((d % 3600) / 60);
  const s = Math.floor(d % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtTimeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Deterministic seeded PRNG shuffle (mulberry32). */
export function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let a = seed >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
