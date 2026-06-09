const WRESTLING_KEYWORDS = ["WWE", "AEW", "TNA", "SmackDown", "NXT", "RAW", "Impact"];
const MMA_KEYWORDS = ["UFC", "MMA", "PFL", "LFC", "Bellator", "ONE Championship"];

export type FightSubcategory = "wrestling" | "mma" | "boxing";

export function classifyFight(title: string): FightSubcategory {
  const upper = title.toUpperCase();
  if (WRESTLING_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()))) return "wrestling";
  if (MMA_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()))) return "mma";
  return "boxing";
}

export const FIGHT_SUB_LABELS: Record<FightSubcategory, string> = {
  wrestling: "Pro Wrestling",
  mma: "MMA / UFC",
  boxing: "Boxing",
};

export const FIGHT_SUB_ICONS: Record<FightSubcategory, string> = {
  wrestling: "\uD83C\uDFAD",
  mma: "\uD83E\uDD4A",
  boxing: "\uD83E\uDD4A",
};
