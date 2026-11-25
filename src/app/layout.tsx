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
  openGraph: {
    type: "website",
    siteName: "ChadTube",
    title: "ChadTube — your personal nerd TV",
    description:
      "333 curated channels, 30k+ videos, zero algorithm. Bookmarks, watch progress, and a Continue watching rail.",
    images: [{ url: "/chad.png", width: 256, height: 256 }],
  },
  twitter: {
    card: "summary",
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
          JS chunks instead of after them. ?v=3 keys the CDN entry for the
          deduplicated payload.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.__chadtubeData=fetch('/api/videos?v=3').then(function(r){if(!r.ok)throw new Error('bad response');return r.json()});",
          }}
        />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
