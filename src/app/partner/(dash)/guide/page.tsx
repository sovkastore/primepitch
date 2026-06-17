"use client";

import { useMemo, useState } from "react";

const ENTRIES: { term: string; desc: string }[] = [
  { term: "Me / Others / Total", desc: "Every number is split three ways. 'Me' (shown in blue) is the people who first arrived through your referral link. 'Others' is everyone else on PrimePitch. 'Total' (the big number) is both combined." },
  { term: "Referred member", desc: "Anyone whose very first visit to the site came through your link. Once tagged to you, they stay yours forever — even if they come back later by typing the address directly." },
  { term: "Online now", desc: "People active on the site in the last few minutes — anywhere, not only on a match." },
  { term: "Watching live now", desc: "People who are on a match page right now." },
  { term: "Joined (today / that day)", desc: "Brand-new members whose first-ever visit happened in that period." },
  { term: "Returned today", desc: "Existing members (who first joined on an earlier day) who came back today." },
  { term: "Unique visitors", desc: "The count of distinct people in the window. Someone who visits ten times still counts once." },
  { term: "Page views", desc: "Total page loads in the window. Repeats count — one person can add many page views." },
  { term: "Match views", desc: "Total times a match page was opened. Repeats count." },
  { term: "Unique watchers", desc: "Distinct people who opened at least one match — each counted once." },
  { term: "Peak", desc: "The most people watching a match at the same moment. 'Peak me' and 'peak others' are each side's own busiest moment, so they usually don't add up to the total peak (the busiest moments can happen at different times)." },
  { term: "Why peaks don't add up", desc: "Total peak is the single busiest instant overall. 'Me' peak is your side's busiest instant; 'others' is the rest's busiest instant. Those three instants can be different times, so me + others rarely equals total." },
  { term: "Match filters", desc: "On the Matches page you can filter by status (All / Live / Played / Upcoming), sort by most-watched or most-recent, and narrow to a single sport — the same controls the main site uses." },
  { term: "Pages people are on now", desc: "On Pulse, the live list of which pages people are currently sitting on, split me vs others." },
  { term: "Total members (all time)", desc: "Everyone who has ever joined the site, split by who came from you." },
];

export default function PartnerGuide() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ENTRIES;
    return ENTRIES.filter((e) => e.term.toLowerCase().includes(s) || e.desc.toLowerCase().includes(s));
  }, [q]);
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-gray-900">Guide</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-4">
        What every number means. Search if you&apos;re unsure about something.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search… e.g. peak, returned, unique"
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="space-y-2.5">
        {filtered.map((e) => (
          <div key={e.term} className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="font-black text-gray-900 text-[14px]">{e.term}</p>
            <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{e.desc}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-400">No matches for “{q}”.</p>}
      </div>
    </div>
  );
}
