import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SocialLink = { id: string; label: string; enabled: boolean; url: string };

// Public: only the links that are toggled on AND have a URL.
export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "social_links")
      .maybeSingle();
    const all = (data?.value as SocialLink[] | undefined) ?? [];
    const links = all
      .filter((l) => l.enabled && typeof l.url === "string" && l.url.trim())
      .map((l) => ({ id: l.id, label: l.label, url: l.url.trim() }));
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ links: [] });
  }
}
