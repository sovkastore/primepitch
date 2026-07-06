import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Public: the site-wide announcement banner config the client reads. When
// `enabled` is false (the default) nothing shows. The link is sanitised on
// write, but we keep this read tolerant.
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: "info" | "success" | "warning";
  reshowHours: number;
};

const EMPTY: Announcement = {
  enabled: false,
  message: "",
  linkUrl: "",
  linkLabel: "",
  variant: "info",
  reshowHours: 0,
};

export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "announcement")
      .maybeSingle();
    const cfg = { ...EMPTY, ...(data?.value ?? {}) } as Announcement;
    // Never advertise an enabled banner with no text.
    if (!cfg.message.trim()) cfg.enabled = false;
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json(EMPTY);
  }
}
