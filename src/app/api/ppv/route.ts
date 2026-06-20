import { NextResponse } from "next/server";

// Standalone PPV.to endpoint, independent of the main stream resolver and its
// gating. Lists live PPV events and resolves one event's embed(s). The list and
// detail are fetched server-side (works regardless of region); only the final
// iframe embed loads in the visitor's browser.

interface PPVEventSource { data?: string; name?: string; type?: string; default?: boolean }
interface PPVEventRaw { id?: number; name?: string; source_tag?: string; poster?: string }
interface PPVCat { category?: string; streams?: PPVEventRaw[] }

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const res = await fetch(`https://api.ppv.to/api/streams/${id}`, { signal: AbortSignal.timeout(9000), headers: UA });
      const j = res.ok ? await res.json() : null;
      const dd = (j && j.data) || {};
      const sources: PPVEventSource[] = Array.isArray(dd.sources) ? dd.sources : [];
      const embeds = sources
        .map((s) => ({ embedUrl: typeof s?.data === "string" ? s.data : "", server: s?.name || dd.source_tag || "PPV" }))
        .filter((s) => /^https?:\/\//.test(s.embedUrl));
      return NextResponse.json({ title: dd.name || "", embeds });
    }
    const res = await fetch("https://api.ppv.to/api/streams", { signal: AbortSignal.timeout(9000), headers: UA });
    const j = res.ok ? await res.json() : null;
    const cats: PPVCat[] = Array.isArray(j?.streams) ? j.streams : [];
    const events: Array<{ id: number; name: string; category: string; poster: string }> = [];
    for (const cat of cats) {
      const label = cat?.category || "Live";
      for (const s of Array.isArray(cat?.streams) ? cat.streams : []) {
        if (s && typeof s.id === "number" && s.name) {
          events.push({ id: s.id, name: s.name, category: label, poster: typeof s.poster === "string" ? s.poster : "" });
        }
      }
    }
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [], embeds: [], error: true });
  }
}
