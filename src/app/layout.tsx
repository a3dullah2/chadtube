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

export const metadata: Metadata = {
  title: "ChadTube — your personal nerd TV",
  description:
    "A personal, algorithm-free video site: curated channels, thousands of videos, and a TV mode for lean-back watching.",
  keywords: ["ChadTube", "TV mode", "curated", "YouTube", "nerd TV"],
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
          fresh request, so the 1.6 MB payload downloads in parallel with the
          JS chunks instead of after them. ?v=2 busts the pre-flag cache entry.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.__chadtubeData=fetch('/api/videos?v=2').then(function(r){if(!r.ok)throw new Error('bad response');return r.json()});",
          }}
        />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
