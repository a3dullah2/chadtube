import type { BookmarkEntry, ProgressEntry } from "./types";

/**
 * Local persistence for saved videos (bookmarks) and watch progress.
 *
 * Everything lives in localStorage — no accounts, no server round-trips,
 * nothing leaves the browser. Keys follow the existing conventions
 * ("mytube.hist", "chadtube.pk") so one origin keeps one coherent profile.
 */

const SAVED_KEY = "chadtube.saved";
const PROGRESS_KEY = "chadtube.progress";

/** Keep the saved list finite so it never bloats the 5 MB localStorage quota. */
const SAVED_CAP = 1000;
/** Watch-progress entries are tiny but still LRU-pruned. */
const PROGRESS_CAP = 3000;

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage disabled — degrade silently */
  }
}

/** Saved list, newest first, hard-capped. */
export function loadSaved(): BookmarkEntry[] {
  const list = loadJSON<BookmarkEntry[]>(SAVED_KEY, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string") : [];
}

export function saveSaved(list: BookmarkEntry[]): void {
  saveJSON(SAVED_KEY, list.slice(0, SAVED_CAP));
}

/**
 * Progress map keyed by video id. Positions under ~5s are noise (autoplay
 * flash), anything past 95% means "finished" — both collapse to no entry so
 * finished videos stop showing resume bars.
 */
export function loadProgress(): Record<string, ProgressEntry> {
  const map = loadJSON<Record<string, ProgressEntry>>(PROGRESS_KEY, {});
  if (!map || typeof map !== "object") return {};
  const out: Record<string, ProgressEntry> = {};
  for (const [id, e] of Object.entries(map)) {
    if (e && typeof e.pos === "number" && typeof e.dur === "number" && e.pos > 0 && e.dur > 0) {
      out[id] = e;
    }
  }
  return out;
}

export function saveProgress(map: Record<string, ProgressEntry>): void {
  // LRU prune by last-watched time, newest first.
  const entries = Object.entries(map)
    .sort((a, b) => (b[1].ts ?? 0) - (a[1].ts ?? 0))
    .slice(0, PROGRESS_CAP);
  saveJSON(PROGRESS_KEY, Object.fromEntries(entries));
}

const RESUME_BACKOFF = 5; // re-enter a few seconds before where you stopped
const RESUME_MIN_POS = 5; // < 5s in: not worth resuming, just start over
const FINISHED_RATIO = 0.95; // past 95%: treat as watched, start over

/** Resume position in seconds, or undefined when the video should start fresh. */
export function resumeStart(e?: ProgressEntry): number | undefined {
  if (!e || !e.dur) return undefined;
  if (e.pos < RESUME_MIN_POS || e.pos / e.dur >= FINISHED_RATIO) return undefined;
  return Math.max(0, Math.floor(e.pos - RESUME_BACKOFF));
}

/** Watched ratio 0..1 for thumbnail progress bars, or 0 when not meaningful. */
export function progressRatio(e?: ProgressEntry): number {
  if (!e || !e.dur) return 0;
  const r = e.pos / e.dur;
  if (r < 0.05 || r >= FINISHED_RATIO) return 0;
  return Math.min(r, 1);
}

/** A video counts as "continue watching" when it sits in the resume window. */
export function isResumable(e?: ProgressEntry): boolean {
  return progressRatio(e) > 0;
}
