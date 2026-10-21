import { NextResponse } from "next/server";
import { VIP_COINS } from "@/lib/vip";
import { npMinAmount } from "@/lib/nowpayments";

export const dynamic = "force-dynamic";

// Each coin's smallest accepted payment in USD, so the page can grey out
// coins that can't take the chosen plan instead of failing at checkout.
// NOWPayments' minimums move with network fees, so this is re-read every
// 10 minutes; a failed lookup leaves the coin ungated (checkout still checks).
type CoinMin = { id: string; minUsd: number | null };
let cache: { at: number; coins: CoinMin[] } | null = null;
const TTL = 10 * 60_000;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    const coins = await Promise.all(VIP_COINS.map(async (c) => {
      try {
        const { usd } = await npMinAmount(c.id);
        return { id: c.id, minUsd: Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) / 100 : null };
      } catch {
        return { id: c.id, minUsd: null };
      }
    }));
    cache = { at: Date.now(), coins };
  }
  return NextResponse.json({ coins: cache.coins }, { headers: { "Cache-Control": "public, max-age=300" } });
}
