"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("Application error:", error);
    // Also report to a beacon so we can see it server-side
    try {
      navigator.sendBeacon(
        "/api/track/pageview",
        JSON.stringify({ error: error.message, stack: error.stack?.slice(0, 500) })
      );
    } catch {}
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="flex flex-col items-center gap-5 text-center max-w-md">
        <Logo size="md" />
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white">Something went wrong</h2>
          <p className="text-xs text-gray-400">
            We encountered an unexpected issue loading this section.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => reset()}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-lg shadow-emerald-900/30"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-5 py-2 text-xs font-bold text-gray-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
          >
            Go Home
          </Link>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-[10px] text-gray-600 hover:text-gray-400 underline"
        >
          {showDetails ? "Hide" : "Show"} Debug Info
        </button>
        {showDetails && (
          <div className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-left overflow-auto max-h-40">
            <p className="text-[10px] text-red-400 font-mono break-all">{error.message}</p>
            <p className="text-[9px] text-gray-600 font-mono break-all mt-1 whitespace-pre-wrap">{error.stack?.slice(0, 800)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

