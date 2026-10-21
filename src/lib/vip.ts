// VIP plans and the coins people can pay with. Shared by the /vip page, the
// checkout API and the admin panel so they never disagree.

export const VIP_PLANS = {
  "2m": { id: "2m", label: "2 months", months: 2, priceUsd: 10, days: 60 },
  "4m": { id: "4m", label: "4 months", months: 4, priceUsd: 15, days: 120 },
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
      body: "Every European competition and every match in the top 5 leagues, on our own servers. Nothing opens, ever.",
      href: "/alt",
      more: {
        title: "What you get on VIP Streams",
        intro: "Our own hand-picked servers. No pop-ups, no redirects, no new tabs — 100% guaranteed for:",
        items: [
          "UEFA Champions League, Europa League and Conference League — every match",
          "Premier League, La Liga, Serie A, Bundesliga and Ligue 1 — every match",
          "Domestic cups in the top 5 leagues — FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France",
          "National teams — World Cup, Euros, Nations League and qualifiers",
          "Big matches in other leagues — Saudi Pro League, MLS, Turkish Süper Lig, Portuguese Liga, Eredivisie and more",
        ],
        outro: "Open VIP Streams and the match is there before kickoff.",
      },
    },
    {
      title: "Other sports: ad-free too.",
      body:
        "Basketball, tennis, cricket, UFC, F1 and every other sport on the main site — 95% ad-free. PrimePitch shows you nothing. Those streams run on third-party players, so your first tap on play may open one tab: close it, go back, and the whole match plays with nothing else interrupting you.",
    },
  ],
};
