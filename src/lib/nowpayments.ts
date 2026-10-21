import { getCloudflareContext } from "@opennextjs/cloudflare";

// Thin client for the NOWPayments API (api.nowpayments.io/v1).
// Keys live as Worker secrets: NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET.

const BASE = "https://api.nowpayments.io/v1";

export type NpPayment = {
  payment_id: number | string;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid?: number;
  order_id?: string;
  order_description?: string;
  network?: string;
  expiration_estimate_date?: string;
  created_at?: string;
  updated_at?: string;
};

export type NpStatus =
  | "waiting" | "confirming" | "confirmed" | "sending" | "partially_paid"
  | "finished" | "failed" | "refunded" | "expired";

export class NpError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function secrets(): Promise<{ apiKey: string; ipnSecret: string }> {
  let env: any = {};
  try {
    env = ((await getCloudflareContext()) as any).env || {};
  } catch {
    env = (process as any).env || {};
  }
  return {
    apiKey: String(env.NOWPAYMENTS_API_KEY || ""),
    ipnSecret: String(env.NOWPAYMENTS_IPN_SECRET || ""),
  };
}

export async function npConfigured(): Promise<boolean> {
  const s = await secrets();
  return !!s.apiKey && !!s.ipnSecret;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { apiKey } = await secrets();
  if (!apiKey) throw new NpError("Payments are not configured yet.", 503, "NOT_CONFIGURED");
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method || "GET",
    headers: {
      "x-api-key": apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) {
    const msg = String(data?.message || data?.error || data?.statusText || `NOWPayments error ${res.status}`);
    throw new NpError(msg, res.status, data?.code);
  }
  return data as T;
}

export function npStatus() {
  return call<{ message: string }>("/status");
}

export function npCurrencies() {
  return call<{ currencies: string[] }>("/currencies");
}

// How much of `coin` is `usd` right now (NOWPayments' own rate).
export async function npEstimate(usd: number, coin: string): Promise<number> {
  const r = await call<{ estimated_amount: number | string }>(
    `/estimate?amount=${encodeURIComponent(usd)}&currency_from=usd&currency_to=${encodeURIComponent(coin)}`
  );
  return Number(r.estimated_amount);
}

// Smallest payment NOWPayments accepts in `coin`, paid out in the same coin
// (we hold a payout wallet for every coin we offer, so nothing is converted).
// `fiatEquivalent` is that minimum in USD.
export async function npMinAmount(coin: string): Promise<{ min: number; usd: number }> {
  const r = await call<{ min_amount: number | string; fiat_equivalent?: number | string }>(
    `/min-amount?currency_from=${encodeURIComponent(coin)}&currency_to=${encodeURIComponent(coin)}&fiat_equivalent=usd`
  );
  return { min: Number(r.min_amount), usd: Number(r.fiat_equivalent ?? NaN) };
}

export function npCreatePayment(input: {
  priceUsd: number;
  payCurrency: string;
  orderId: string;
  description: string;
  ipnUrl: string;
}) {
  return call<NpPayment>("/payment", {
    method: "POST",
    body: {
      price_amount: input.priceUsd,
      price_currency: "usd",
      pay_currency: input.payCurrency,
      order_id: input.orderId,
      order_description: input.description,
      ipn_callback_url: input.ipnUrl,
      // The customer covers NOWPayments' fee on top of the price, so the full
      // price lands in our wallet.
      is_fee_paid_by_user: true,
    },
  });
}

export function npGetPayment(paymentId: string | number) {
  return call<NpPayment>(`/payment/${encodeURIComponent(String(paymentId))}`);
}

// ---- IPN signature --------------------------------------------------------
// NOWPayments signs the JSON body with HMAC-SHA512 over the body re-serialised
// with every object's keys sorted alphabetically (recursively), hex digest,
// in the `x-nowpayments-sig` header.
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

export async function npVerifyIpn(rawBody: string, signature: string | null): Promise<{ ok: boolean; payload: any }> {
  const { ipnSecret } = await secrets();
  if (!ipnSecret || !signature) return { ok: false, payload: null };
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return { ok: false, payload: null }; }
  const msg = JSON.stringify(sortKeys(payload));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(ipnSecret),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  const given = signature.trim().toLowerCase();
  if (hex.length !== given.length) return { ok: false, payload };
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return { ok: diff === 0, payload };
}

// A payment that means "money arrived in full".
export function npIsPaid(status: string): boolean {
  return status === "finished" || status === "confirmed" || status === "sending";
}
