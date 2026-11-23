export interface Vid {
  id: string;
  t: string;
  d: number;
  v: number;
  c: number;
  /** Approximate upload timestamp (unix seconds). Absent = unknown. */
  ts?: number;
}

export interface Chan {
  n: string;
  tier: string;
  cid: string;
  count: number;
}

export interface TubeData {
  channels: Chan[];
  videos: Vid[];
}

export type Tier = "S" | "A" | "B" | "C" | "D";

export type SortMode = "newest" | "curated" | "views" | "longest" | "shuffle";

export interface HistEntry {
  id: string;
  ts: number;
}
