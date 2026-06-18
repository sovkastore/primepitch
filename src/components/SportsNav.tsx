"use client";

import { SPORT_LABELS } from "@/lib/api";

const SPORTS = [
  "football", "basketball", "american-football", "ufc", "wwe", "boxing",
  "motor-sports", "cricket", "tennis", "hockey", "baseball", "rugby",
];

// Football now uses the generic ball icon (/icons/sports/football.svg via the
// fallback); the FIFA logo is repurposed for the World Cup tab.
const BRAND_ICONS: Record<string, string> = {
  basketball: "/icons/brands/nba.svg",
  ufc: "/icons/brands/ufc.svg",
  wwe: "/icons/brands/wwe.svg",
  "motor-sports": "/icons/brands/f1.svg",
  hockey: "/icons/brands/nhl.svg",
  baseball: "/icons/brands/mlb.svg",
};

function getSportIcon(id: string): string {
  return BRAND_ICONS[id] || `/icons/sports/${id}.svg`;
}

interface SportsNavProps {
  activeSport: string | null;
  onSelect: (sport: string | null) => void;
  /** True on the World Cup page: highlights the WC tab like an active category. */
  worldCupActive?: boolean;
}

export default function SportsNav({ activeSport, onSelect }: SportsNavProps) {
  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {SPORTS.map((id) => {
          const active = activeSport === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                  active
                    ? "bg-emerald-500 shadow-lg shadow-emerald-500/25"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                <img
                  src={getSportIcon(id)}
                  alt={SPORT_LABELS[id] || id}
                  className={`w-6 h-6 object-contain ${id === "football" ? "" : active ? "" : "invert opacity-60"}`}
                />
              </div>
              <span
                className={`text-[10px] font-bold transition-colors whitespace-nowrap ${
                  active ? "text-emerald-600" : "text-gray-500"
                }`}
              >
                {SPORT_LABELS[id] || id}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
