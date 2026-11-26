import { getApiPayload, getCorePayload } from "@/lib/library";

/**
 * Serves the cleaned video library (nested duplicates stripped, ids deduped)
 * pre-gzipped with edge caching, in two variants selected by query param:
 *
 *   /api/videos            -> the full library (~31k videos)
 *   /api/videos?shard=core -> the curated core only (S & A tier videos with
 *                             the full channel list and a `shard: "core"`
 *                             marker). ~2k videos, a fraction of the bytes —
 *                             the landing page's default "Curated" filter
 *                             never needs more, and the bootstrap fetch in
 *                             layout.tsx uses this variant.
 *
 * The client swaps in the full library lazily once a non-curated tier
 * filter, a search or an out-of-core deep link needs it (tube-app.tsx).
 *
 * Cleaning + gzip happen in src/lib/library.ts, once per data-file mtime —
 * the payload drops ~30% (the 9,432 nested duplicate records) and the gzip
 * copy can never drift out of sync with the ETag again.
 *
 * Caching: s-maxage keeps each variant at the CDN edge for a day (cheap,
 * fast TTFB worldwide) with stale-while-revalidate covering refreshes;
 * max-age=0 + must-revalidate keeps browsers revalidating via ETag (the
 * Vercel CDN refuses to cache responses marked `no-cache`, so the explicit
 * zero-max-age form is used instead) so a data update reaches users on
 * their next normal reload instead of up to a day later.
 */
export async function GET(req: Request) {
  const shard = new URL(req.url).searchParams.get("shard");
  let payload: Awaited<ReturnType<typeof getApiPayload>>;
  try {
    payload = shard === "core" ? await getCorePayload() : await getApiPayload();
  } catch {
    return Response.json({ error: "library unavailable" }, { status: 500 });
  }

  const base = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=86400, stale-while-revalidate=86400",
    ETag: payload.etag,
    Vary: "Accept-Encoding",
  };

  // Client copy unchanged -> no body at all.
  if (req.headers.get("if-none-match") === payload.etag) {
    return new Response(null, { status: 304, headers: base });
  }

  const acceptsGzip = (req.headers.get("accept-encoding") ?? "").includes("gzip");
  if (acceptsGzip) {
    return new Response(new Uint8Array(payload.gz), {
      headers: { ...base, "Content-Encoding": "gzip", "Content-Length": String(payload.gz.length) },
    });
  }
  return new Response(new Uint8Array(payload.body), { headers: base });
}
