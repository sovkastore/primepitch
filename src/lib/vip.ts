// VIP plans and the coins people can pay with. Shared by the /vip page, the
// checkout API and the admin panel so they never disagree.

export const VIP_PLANS = {
  "1m": { id: "1m", label: "1 month", months: 1, priceUsd: 5, days: 30 },
  "3m": { id: "3m", label: "3 months", months: 3, priceUsd: 10, days: 90 },
} as const;

export type PlanId = keyof typeof VIP_PLANS;

export function planById(id: unknown): (typeof VIP_PLANS)[PlanId] | null {
  return typeof id === "string" && id in VIP_PLANS ? VIP_PLANS[id as PlanId] : null;
}

// NOWPayments tickers. `network` is what we show next to the coin so people
// send on the right chain.
export const VIP_COINS = [
  { id: "usdttrc20", name: "USDT", network: "TRC20 · Tron", symbol: "USDT" },
  { id: "usdterc20", name: "USDT", network: "ERC20 · Ethereum", symbol: "USDT" },
  { id: "usdtbsc", name: "USDT", network: "BEP20 · BNB Chain", symbol: "USDT" },
  { id: "usdc", name: "USDC", network: "ERC20 · Ethereum", symbol: "USDC" },
  { id: "btc", name: "Bitcoin", network: "Bitcoin", symbol: "BTC" },
  { id: "eth", name: "Ethereum", network: "ERC20 · Ethereum", symbol: "ETH" },
  { id: "trx", name: "Tron", network: "TRC20 · Tron", symbol: "TRX" },
  { id: "bnbbsc", name: "BNB", network: "BEP20 · BNB Chain", symbol: "BNB" },
  { id: "sol", name: "Solana", network: "Solana", symbol: "SOL" },
  { id: "ltc", name: "Litecoin", network: "Litecoin", symbol: "LTC" },
] as const;

export type CoinId = (typeof VIP_COINS)[number]["id"];

export function coinById(id: unknown) {
  return VIP_COINS.find((c) => c.id === id) || null;
}

export const VIP_CONTACT = {
  telegram: "https://t.me/zomp_beta",
  telegramHandle: "@zomp_beta",
  whatsapp: "https://wa.me/351966952221",
};

// Where payment words live on the page. Kept verbatim from the owner.
export const VIP_COPY = {
  headline: "PrimePitch VIP — watch without the ads.",
  lines: [
    {
      title: "No ads from PrimePitch, anywhere.",
      body: "No pop-ups, no redirects, no banners, no waiting screens — on every page.",
    },
    {
      title: "VIP Streams: 100% ad-free.",
      body: "Our own hand-picked servers for the big matches. Nothing opens, ever.",
      href: "/alt",
    },
    {
      title: "All other sports: almost ad-free.",
      body:
        "The main site covers every sport using free third-party servers. Those servers are not ours, and a tap inside the video player may open one tab — tap play once, go back, and watch; nothing else interrupts you.",
    },
  ],
};
