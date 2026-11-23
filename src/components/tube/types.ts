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
