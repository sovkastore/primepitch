"use client";

import MatchesPanel from "@/components/partner/MatchesPanel";

export default function PartnerMatches() {
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Matches</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        Every match people watched through your link. Filter by day, status, sport.
      </p>
      <MatchesPanel src="/api/partner/matches" mine />
    </div>
  );
}
