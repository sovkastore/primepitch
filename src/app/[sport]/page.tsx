import { getMatches, getMatchStatus, SPORT_ICONS, SPORT_LABELS } from "@/lib/api";
import MatchCard from "@/components/MatchCard";

export const revalidate = 30;

export default async function SportPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  const matches = await getMatches(sport);
  const matchesWithCategory = matches.map((m) => ({ ...m, category: sport }));

  const live = matchesWithCategory.filter((m) => getMatchStatus(m) === "live");
  const upcoming = matchesWithCategory
    .filter((m) => getMatchStatus(m) === "upcoming")
    .sort((a, b) => a.date - b.date);

  const icon = SPORT_ICONS[sport] || "\u26BD";
  const label = SPORT_LABELS[sport] || sport;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-8">
        {icon} {label}
      </h1>

      {/* Live */}
      {live.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <h2 className="text-lg font-bold text-white">LIVE NOW</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {live.map((m) => (
              <MatchCard key={m.title} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-white mb-4">UPCOMING</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {upcoming.map((m) => (
              <MatchCard key={m.title} match={m} />
            ))}
          </div>
        </section>
      )}

      {matches.length === 0 && (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">
            No matches scheduled right now.
          </p>
          <p className="text-gray-600 text-sm mt-2">
            Check back later for live and upcoming {label.toLowerCase()} matches.
          </p>
        </div>
      )}
    </div>
  );
}
