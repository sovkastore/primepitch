import Link from "next/link";
import { Match, getMatchStatus, getTimeInfo, SPORT_ICONS } from "@/lib/api";

export default function Upcoming({ matches }: { matches: Match[] }) {
  const upcoming = matches
    .filter((m) => getMatchStatus(m) === "upcoming")
    .sort((a, b) => a.date - b.date)
    .slice(0, 12);

  if (upcoming.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold text-white mb-4">UPCOMING MATCHES</h2>

      <div className="grid gap-2">
        {upcoming.map((match) => {
          const icon = SPORT_ICONS[match.category] || "\u26BD";
          const firstSource = match.sources?.[0];
          const href = firstSource
            ? `/watch/${encodeURIComponent(firstSource.source)}--${encodeURIComponent(firstSource.id)}`
            : "#";

          return (
            <Link key={`${match.category}-${match.title}`} href={href}>
              <div className="flex items-center justify-between p-3 bg-zinc-900/50 border border-white/5 rounded-lg hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all group">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {match.title}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {match.category.replace("-", " ")}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm text-gray-400">{getTimeInfo(match)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
