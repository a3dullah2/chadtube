import { ImageResponse } from "next/og";

/**
 * Static 1200x630 OG banner for the home page (wired up in layout.tsx as
 * /api/og). Typographic design on the dark background: tier dots echo the
 * tier badges used across the site. Per-video pages don't touch this route —
 * page.tsx points their og:image at the real YouTube thumbnail instead.
 *
 * Stats are real library numbers (333 channels / 30k+ videos) — update if
 * the library changes materially.
 */

const TIERS: Array<[string, string]> = [
  ["S", "#ff7a7a"],
  ["A", "#ffb46b"],
  ["B", "#ffe066"],
  ["C", "#9be38a"],
  ["D", "#7cc4ff"],
];

export async function GET() {
  const img = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#09090b",
          padding: "72px 80px",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {TIERS.map(([tier, color]) => (
            <div
              key={tier}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: color,
                color: "#18181b",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              {tier}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 108,
              fontWeight: 700,
              color: "#fafafa",
              letterSpacing: "-4px",
            }}
          >
            ChadTube
          </div>
          <div style={{ display: "flex", fontSize: 42, color: "#ff7a7a", marginTop: 14 }}>
            your personal nerd TV
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa" }}>
            333 hand-picked channels · 30,000+ videos
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#71717a" }}>
            zero algorithm
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );

  // next/og defaults to `Cache-Control: public, max-age=0, must-revalidate`;
  // override it wholesale (a spread would emit two conflicting directives).
  return new Response(img.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
