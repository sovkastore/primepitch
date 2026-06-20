import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Per-partner flags used by the dashboard data routes.
// - fullStats: may this partner see whole-platform numbers (grandfathered) or
//   only their own referred people? New partners default to false.
// - earned / paid: their running totals (their share already; no split shown).
export async function partnerFlags(
  code: string,
): Promise<{ fullStats: boolean; earned: number; paid: number }> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("partners")
      .select("full_stats, earned_total, paid_total")
      .eq("code", code)
      .maybeSingle();
    return {
      fullStats: data?.full_stats === true,
      earned: Number(data?.earned_total) || 0,
      paid: Number(data?.paid_total) || 0,
    };
  } catch {
    return { fullStats: false, earned: 0, paid: 0 };
  }
}

const SUFFIXES = ["Total", "His", "Yours", "Own"] as const;

// Recursively rewrite EVERY split metric so a limited partner sees ONLY their
// own referred people. For each group {..Total, ..His, ..Yours, ..Own} that has
// a "His" (their own number), the headline (Total) becomes their own count and
// the everyone-else figures (Yours/Own) collapse to 0. Standalone fields with no
// "His" counterpart are left untouched. Used only when fullStats is false, so no
// platform number is ever even sent to a limited partner.
export function scopeToOwn<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => scopeToOwn(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = scopeToOwn(v);

    const prefixes = new Set<string>();
    for (const k of Object.keys(obj)) {
      if (k === "total" || k === "his" || k === "yours" || k === "own") {
        prefixes.add("");
      } else {
        for (const suf of SUFFIXES) {
          if (k.length > suf.length && k.endsWith(suf)) prefixes.add(k.slice(0, -suf.length));
        }
      }
    }
    for (const p of prefixes) {
      const hk = p === "" ? "his" : `${p}His`;
      const tk = p === "" ? "total" : `${p}Total`;
      const yk = p === "" ? "yours" : `${p}Yours`;
      const ok = p === "" ? "own" : `${p}Own`;
      if (typeof obj[hk] === "number") {
        if (tk in out) out[tk] = obj[hk];
        if (yk in out) out[yk] = 0;
        if (ok in out) out[ok] = 0;
      }
    }
    return out as unknown as T;
  }
  return value;
}

// Full money picture for a partner: the four buckets from the live view
// (Earned = Balance + Hold + Paid), plus their saved payout method.
export async function partnerBalances(code: string): Promise<{
  partnerId: string | null; fullStats: boolean;
  earned: number; hold: number; paid: number; balance: number;
  payoutCurrency: string | null; payoutAddress: string | null;
}> {
  const sb = getSupabaseAdmin();
  const { data: p } = await sb
    .from("partners")
    .select("id, full_stats, payout_currency, payout_address")
    .eq("code", code)
    .maybeSingle();
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  if (!p) return { partnerId: null, fullStats: false, earned: 0, hold: 0, paid: 0, balance: 0, payoutCurrency: null, payoutAddress: null };
  const rec = p as { id: string; full_stats: boolean; payout_currency: string | null; payout_address: string | null };
  const { data: b } = await sb
    .from("partner_balances")
    .select("earned, hold, paid, balance")
    .eq("partner_id", rec.id)
    .maybeSingle();
  const bb = (b ?? {}) as { earned?: unknown; hold?: unknown; paid?: unknown; balance?: unknown };
  return {
    partnerId: rec.id,
    fullStats: rec.full_stats === true,
    earned: num(bb.earned), hold: num(bb.hold), paid: num(bb.paid), balance: num(bb.balance),
    payoutCurrency: rec.payout_currency ?? null,
    payoutAddress: rec.payout_address ?? null,
  };
}
