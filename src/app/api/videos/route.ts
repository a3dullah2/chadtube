import { createHash } from "crypto";
import { readFile, stat } from "fs/promises";
import path from "path";

/**
 * Serves the video library pre-compressed (gzip) with strong caching.
 *
 * Why not `import raw from "@/data/videos.json"`? That pulls the 5 MB file
 * into the route's JS bundle: every cold start recompiles it and every
 * request re-serializes it uncompressed. Reading a pre-gzipped file from
 * disk instead gives a ~3x smaller transfer, instant 304 revalidation, and
 * fast route compilation.
 *
 * `no-cache` + ETag: the browser revalidates on every visit (a 0-byte 304
 * when nothing changed), so data updates — like new Pakistani-mode flags —
 * reach users on their next normal reload instead of 24 hours later.
 *
 * Regenerate the .gz after changing videos.json:  bash scripts/compress_data.sh
 */

const CACHE = "public, no-cache";
const GZ_PATH = path.join(process.cwd(), "src/data/videos.json.gz");
const RAW_PATH = path.join(process.cwd(), "src/data/videos.json");

let gzBuf: Buffer | null = null;
let rawBuf: Buffer | null = null;
let etag = "";
let loadedMtimeMs = 0;

async function load(): Promise<void> {
  // A stat() per request is ~free and lets the running server pick up data
  // file changes (e.g. re-running scripts/mark_pakistani.py) without a restart.
  const m = await stat(RAW_PATH);
  if (rawBuf && m.mtimeMs === loadedMtimeMs) return;
  rawBuf = await readFile(RAW_PATH);
  etag = `"${createHash("md5").update(rawBuf).digest("hex")}"`;
  try {
    gzBuf = await readFile(GZ_PATH);
  } catch {
    gzBuf = null; // fall back to plain JSON if the .gz hasn't been generated
  }
  loadedMtimeMs = m.mtimeMs;
}

export async function GET(req: Request) {
  try {
    await load();
  } catch {
    return Response.json({ error: "library unavailable" }, { status: 500 });
  }

  const base = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": CACHE,
    ETag: etag,
    Vary: "Accept-Encoding",
  };

  // Client copy unchanged -> no body at all.
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: base });
  }

  const acceptsGzip = (req.headers.get("accept-encoding") ?? "").includes("gzip");
  if (gzBuf && acceptsGzip) {
    return new Response(new Uint8Array(gzBuf.buffer, gzBuf.byteOffset, gzBuf.byteLength), {
      headers: { ...base, "Content-Encoding": "gzip", "Content-Length": String(gzBuf.length) },
    });
  }
  return new Response(new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength), {
    headers: base,
  });
}
