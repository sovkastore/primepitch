import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

const KEY = "announcement";

type Variant = "info" | "success" | "warning";
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: Variant;
  reshowHours: number;
};

const DEFAULTS: Announcement = {
  enabled: false,
  message: "",
  linkUrl: "",
  linkLabel: "",
  variant: "info",
  reshowHours: 0,
};

const ALLOWED_VARIANTS = new Set(["info", "success", "warning"]);
const ALLOWED_RESHOW = new Set([0, 1, 3, 6, 24]);

// Must match AnnouncementBar.signatureOf exactly. reshowHours is intentionally
// excluded so changing the timer never resets who has dismissed.
function signatureOf(a: Announcement): string {
  let h = 0;
  const s = `${a.message}|${a.linkUrl}|${a.linkLabel}|${a.variant}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

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
    reshowHours: ALLOWED_RESHOW.has(Number(a.reshowHours))
      ? Number(a.reshowHours)
      : 0,
  };
}

export async function GET() {
  try {
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ ...DEFAULTS, dismissCount: 0 });

    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind(KEY).first<{ value: string }>();
    const config = { ...DEFAULTS, ...(row?.value ? JSON.parse(row.value) : {}) } as Announcement;

    let dismissCount = 0;
    try {
      const cRow = await d1.prepare("SELECT COUNT(*) as count FROM d1_announcement_dismissals WHERE signature = ?").bind(signatureOf(config)).first() as any;
      dismissCount = cRow?.count ?? 0;
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ...config, dismissCount });
  } catch {
    return NextResponse.json({ ...DEFAULTS, dismissCount: 0 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = cleanAnnouncement(body);
    const d1 = await getD1();
    if (!d1) return NextResponse.json({ ok: false }, { status: 500 });

    await d1.prepare(`
        INSERT INTO d1_site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(KEY, JSON.stringify(config), new Date().toISOString()).run();

    return NextResponse.json({ ok: true, config });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
