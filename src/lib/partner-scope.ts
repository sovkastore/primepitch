import { getD1 } from "@/lib/d1";

// Per-partner flags used by the dashboard data routes.
// - fullStats: may this partner see whole-platform numbers (grandfathered) or
//   only their own referred people? New partners default to false.
// - earned / paid: their running totals (their share already; no split shown).
export async function partnerFlags(
  code: string,
): Promise<{ fullStats: boolean; earned: number; paid: number }> {
  try {
    const d1 = await getD1();
    if (!d1) return { fullStats: false, earned: 0, paid: 0 };
    const row = await d1.prepare(
      `SELECT full_stats, earned_total, paid_total FROM d1_partners WHERE code = ?`
    ).bind(code).first<{ full_stats: number; earned_total: number; paid_total: number }>();
    // Fallback: if earned_total / paid_total columns don't exist, try partner_balances
    if (row) {
      return {
        fullStats: row.full_stats === 1,
        earned: Number(row.earned_total) || 0,
        paid: Number(row.paid_total) || 0,
      };
    }
    return { fullStats: false, earned: 0, paid: 0 };
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
  const d1 = await getD1();
  if (!d1) return { partnerId: null, fullStats: false, earned: 0, hold: 0, paid: 0, balance: 0, payoutCurrency: null, payoutAddress: null };

  const p = await d1.prepare(
    `SELECT id, full_stats, payout_currency, payout_address FROM d1_partners WHERE code = ?`
  ).bind(code).first<{ id: string; full_stats: number; payout_currency: string | null; payout_address: string | null }>();

  if (!p) return { partnerId: null, fullStats: false, earned: 0, hold: 0, paid: 0, balance: 0, payoutCurrency: null, payoutAddress: null };

  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const b = await d1.prepare(
    `SELECT earned, approved, hold, paid, balance FROM d1_partner_balances WHERE partner_id = ?`
  ).bind(p.id).first<{ earned: number; approved: number; hold: number; paid: number; balance: number }>();

  return {
    partnerId: p.id,
    fullStats: p.full_stats === 1,
    earned: num(b?.earned), approved: num(b?.approved), hold: num(b?.hold), paid: num(b?.paid), balance: num(b?.balance),
    payoutCurrency: p.payout_currency ?? null,
    payoutAddress: p.payout_address ?? null,
  };
}
