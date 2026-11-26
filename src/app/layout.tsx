import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chadtube.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ChadTube — your personal nerd TV",
  description:
    "A personal, algorithm-free video site: curated channels and thousands of videos.",
  keywords: ["ChadTube", "curated", "YouTube", "nerd TV"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "ChadTube",
    url: "/",
    title: "ChadTube — your personal nerd TV",
    description:
      "333 curated channels, 30k+ videos, zero algorithm. Bookmarks, watch progress, and a Continue watching rail.",
    // 1200x630 banner rendered by src/app/api/og/route.tsx — per-video pages
    // override it with the video's real thumbnail in page.tsx.
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "ChadTube — your personal nerd TV" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ChadTube — your personal nerd TV",
    description:
      "A personal, algorithm-free video site: curated channels and thousands of videos.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/*
          Bootstrap: start the library fetch during HTML parsing, long before
          React hydrates. TubeApp awaits this promise instead of launching a
          fresh request, so the payload downloads in parallel with the
          JS chunks instead of after them. This is the curated-core shard
          (S & A videos only — the landing page's default filter), a fraction
          of the full payload; the full library swaps in lazily only when a
          non-curated view actually needs it. ?v=3 keys the CDN entry.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.__chadtubeData=fetch('/api/videos?v=3&shard=core').then(function(r){if(!r.ok)throw new Error('bad response');return r.json()});",
          }}
        />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
