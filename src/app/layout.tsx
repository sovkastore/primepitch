import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AdsLoader from "@/components/AdsLoader";
import SwCleanup from "@/components/SwCleanup";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "PrimePitch \u2014 Watch Live Sports Free",
    template: "%s | PrimePitch",
  },
  description:
    "Watch live football, basketball, UFC, F1, and more. FIFA World Cup 2026 \u2014 all matches, all free. primepitch.live",
  keywords: [
    "live sports", "free sports streaming", "football live", "FIFA World Cup 2026",
    "basketball live", "UFC live", "F1 live", "watch sports free", "PrimePitch",
  ],
  authors: [{ name: "PrimePitch" }],
  creator: "PrimePitch",
  other: {
    // HilltopAds site-ownership verification meta tag.
    "aa161e4bfc7e68a64d454d1786941ab1601e90c2": "aa161e4bfc7e68a64d454d1786941ab1601e90c2",
    // Clickadu site-ownership verification meta tag.
    "clckd": "bec62467cc0ca72c56d8b42ad6c12dcb",
  },
  metadataBase: new URL("https://primepitch.live"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://primepitch.live",
    siteName: "PrimePitch",
    title: "PrimePitch \u2014 Watch Live Sports Free",
    description:
      "Watch live football, basketball, UFC, F1, and more. FIFA World Cup 2026 \u2014 all matches, all free.",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "PrimePitch Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "PrimePitch \u2014 Watch Live Sports Free",
    description:
      "Watch live football, basketball, UFC, F1, and more. FIFA World Cup 2026 \u2014 all matches, all free.",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  robots: {
    index: true,
    follow: true,
  },
};

import { GoogleAnalytics } from "@next/third-parties/google";
import GATracker from "@/components/GATracker";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="clckd" content="bec62467cc0ca72c56d8b42ad6c12dcb" />
        <meta name="aa161e4bfc7e68a64d454d1786941ab1601e90c2" content="aa161e4bfc7e68a64d454d1786941ab1601e90c2" />
      </head>
      <body className={`${inter.className} antialiased min-h-screen flex flex-col bg-white text-gray-900`}>
        {children}
        <AdsLoader />
        <SwCleanup />
        <GoogleAnalytics gaId="G-EQQ7ZNW2EJ" />
        <GATracker />
      </body>
    </html>
  );
}
