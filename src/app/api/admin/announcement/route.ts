import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY = "announcement";

type Variant = "info" | "success" | "warning";
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: Variant;
};

const DEFAULTS: Announcement = {
  enabled: false,
  message: "",
  linkUrl: "",
  linkLabel: "",
  variant: "info",
};

const ALLOWED_VARIANTS = new Set(["info", "success", "warning"]);

// Only allow internal paths ("/...") or absolute http(s) URLs. This blocks
// javascript: and other script-bearing schemes from ever reaching an <a href>.
function cleanUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  if (s.startsWith("/")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

function cleanString(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanAnnouncement(input: unknown): Announcement {
  const a = (input ?? {}) as Record<string, unknown>;
  return {
    enabled: a.enabled === true,
    message: cleanString(a.message, 500),
    linkUrl: cleanUrl(a.linkUrl),
    linkLabel: cleanString(a.linkLabel, 60),
    variant: ALLOWED_VARIANTS.has(a.variant as string)
      ? (a.variant as Variant)
      : "info",
  };
}

export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    return NextResponse.json({ ...DEFAULTS, ...(data?.value ?? {}) });
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = cleanAnnouncement(body);
    const { error } = await getSupabaseAdmin()
      .from("site_settings")
      .upsert(
        { key: KEY, value: config, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true, config });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
