import Link from "next/link";
import { Match, getMatchStatus, getTimeInfo } from "@/lib/api";

export default function Hero({ match }: { match: Match | null }) {
  if (!match) return null;

  const status = getMatchStatus(match);
  const timeInfo = getTimeInfo(match);
  const firstSource = match.sources?.[0];
  const watchHref = firstSource
    ? `/watch/${encodeURIComponent(firstSource.source)}--${encodeURIComponent(firstSource.id)}`
    : "#";

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-black to-blue-900/30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20">
        {/* World Cup badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-xs font-bold text-emerald-400 tracking-wider">
            FIFA WORLD CUP 2026&trade;
          </span>
          {status === "live" && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-red-600/20 border border-red-500/30 rounded-full">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-red-400">LIVE</span>
            </span>
          )}
        </div>

        {/* Match title */}
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white leading-tight mb-2">
          {match.title.toUpperCase().replace(" VS ", ""  ).replace(" VS. ", "").split(/\bvs\.?\b/i).length > 1
            ? <>
                {match.title.split(/\s+vs\.?\s+/i)[0]}
                <span className="text-emerald-400"> vs </span>
                {match.title.split(/\s+vs\.?\s+/i)[1]}
              </>
            : match.title
          }
        </h1>

        {/* Time */}
        <p className="text-gray-400 text-lg mb-8">
          {status === "live" ? `${timeInfo} \u2022 Watch Now` : timeInfo}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap gap-3">
          <Link
            href={watchHref}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Watch Live
          </Link>
          <Link
            href="/football"
            className="inline-flex items-center px-6 py-3 border border-white/20 text-white hover:bg-white/10 font-semibold rounded-xl transition-colors"
          >
            View Full Schedule
          </Link>
        </div>
      </div>
    </section>
  );
}
