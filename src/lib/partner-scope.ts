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
    // Safe default: own-people-only.
    return { fullStats: false, earned: 0, paid: 0 };
  }
}

// Recursively rewrite every {total, his, yours?, own?} metric so the partner
// sees ONLY their own referred people: the headline (total) becomes their own
// count, and the "everyone else" figures collapse to 0. Every other field is
// left exactly as-is. Used only when fullStats is false.
export function scopeToOwn<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => scopeToOwn(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const isMetric = typeof obj.total === "number" && typeof obj.his === "number";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = scopeToOwn(v);
    if (isMetric) {
      out.total = obj.his; // headline = their own people
      out.his = obj.his;
      if ("yours" in obj) out.yours = 0;
      if ("own" in obj) out.own = 0;
    }
    return out as unknown as T;
  }
  return value;
}
