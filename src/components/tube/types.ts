export interface Vid {
  id: string;
  t: string;
  d: number;
  v: number;
  c: number;
  /** Approximate upload timestamp (unix seconds). Absent = unknown. */
  ts?: number;
  /** Real uploader name (playlist videos). Falls back to the channel name. */
  up?: string;
  /** Flagged as Pakistani media (hidden when Pakistani mode is on). */
  pk?: number;
}

export interface Chan {
  n: string;
  tier: string;
  cid: string;
  count: number;
  /** Flagged as Pakistani media (hidden when Pakistani mode is on). */
  pk?: number;
}

export interface TubeData {
  channels: Chan[];
  videos: Vid[];
}

export type Tier = "S" | "A" | "B" | "C" | "D" | "R" | "★";

export type SortMode = "newest" | "curated" | "views" | "longest" | "shuffle";

export interface HistEntry {
  id: string;
  ts: number;
}

/** A video saved (bookmarked) for later. Newest first when persisted. */
export interface BookmarkEntry {
  id: string;
  /** When the video was saved (unix ms). */
  ts: number;
}

/** Last known playback position of a video (unix-ms `ts` for LRU pruning). */
export interface ProgressEntry {
  /** Position in seconds. */
  pos: number;
  /** Video duration in seconds as reported by the player. */
  dur: number;
  /** When the position was last recorded (unix ms). */
  ts: number;
}
