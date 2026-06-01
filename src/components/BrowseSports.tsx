import Link from "next/link";
import { SPORT_ICONS, SPORT_LABELS } from "@/lib/api";

const SPORTS_LIST = [
  "football",
  "basketball",
  "fight",
  "motor-sports",
  "tennis",
  "cricket",
  "american-football",
  "baseball",
  "hockey",
  "rugby",
  "golf",
  "darts",
];

export default function BrowseSports() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-8">
      <h2 className="text-xl font-bold text-white mb-4">BROWSE SPORTS</h2>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {SPORTS_LIST.map((id) => (
          <Link key={id} href={`/${id}`}>
            <div className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-900/50 border border-white/5 rounded-xl hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all group cursor-pointer">
              <span className="text-3xl">
                {SPORT_ICONS[id] || "\uD83C\uDFC6"}
              </span>
              <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors text-center">
                {SPORT_LABELS[id] || id}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
