import { NextResponse } from "next/server";

// TEMPORARY diagnostic: does a datacenter IP (Cloudflare's egress) get past a
// referer-locked stream's hotlink protection? Fetches ONLY the tiny playlist —
// never any video segment. Remove once the question is answered.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const referer = searchParams.get("referer") || "";
  const ua =
    searchParams.get("ua") ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const attempt = async (label: string, headers: Record<string, string>) => {
    const started = Date.now();
    try {
      // Bypass the Worker cache: a cached 403 from a previous attempt would
      // otherwise be replayed for the headered request and fake a failure.
      const res = await fetch(url, {
        headers,
        cache: "no-store",
        cf: { cacheTtl: 0, cacheEverything: false },
      } as RequestInit);
      const body = res.ok ? (await res.text()).slice(0, 200) : "";
      return { label, status: res.status, ms: Date.now() - started, bodyStart: body };
    } catch (e: unknown) {
      return { label, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
    }
  };

  return NextResponse.json({
    from: "cloudflare-worker (datacenter IP)",
    colo: req.headers.get("cf-ray") || null,
    results: [
      // headered FIRST so nothing can poison it
      await attempt("with referer + ua", { Referer: referer, "User-Agent": ua }),
      await attempt("no headers", {}),
    ],
  });
}
