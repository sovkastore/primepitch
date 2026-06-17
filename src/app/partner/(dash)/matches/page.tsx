"use client";

import { usePartnerData } from "@/components/partner/usePartnerData";
import MatchesPanel, { type PanelMatch } from "@/components/partner/MatchesPanel";

export default function PartnerMatches() {
  const { data, loading, error } = usePartnerData<{ matches: PanelMatch[] }>("/api/partner/matches");
  const matches = data?.matches ?? [];
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Matches</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        Every match people watched. <span className="text-blue-600 font-bold">Blue = me</span> (the people you brought), grey = everyone else.
      </p>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <MatchesPanel matches={matches} mine />
      )}
    </div>
  );
}
