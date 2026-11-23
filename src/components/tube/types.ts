export interface Vid {
  id: string;
  t: string;
  d: number;
  v: number;
  c: number;
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

export type SortMode = "curated" | "views" | "longest" | "shuffle";

export interface HistEntry {
  id: string;
  ts: number;
}
