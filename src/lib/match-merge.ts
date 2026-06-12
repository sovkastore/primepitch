// Shared title-normalization for merging duplicate match listings.
// Used by the admin Matches page and Live Monitor traction panel.
// Add a new alias whenever providers word the same match differently.

export const TITLE_ALIASES: [RegExp, string][] = [
  // Team-name spellings
  [/czechrepublic/g, "czechia"],
  [/korearepublic/g, "southkorea"],
  [/unitedstatesofamerica/g, "unitedstates"],
  [/\busa\b/g, "unitedstates"],
  [/ivorycoast/g, "cotedivoire"],
  [/holland/g, "netherlands"],
  [/bosniaherzegovina/g, "bosnia"],
  [/bosniaandherzegovina/g, "bosnia"],
  // Tournament wording: "FIFA World Cup", "World Cup 2026", "FIFA World Cup 2026"
  // all become plain "worldcup"
  [/fifaworldcup(2026)?/g, "worldcup"],
  [/worldcup2026/g, "worldcup"],
];

export function normTitle(t: string): string {
  let n = (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  n = n.replace(/^ppv/, ""); // admin ppv listings are the same match
  for (const [re, sub] of TITLE_ALIASES) n = n.replace(re, sub);
  return n;
}
