import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Stores (or removes) a browser's Web Push subscription. Server-only table,
// reached with the service role.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sub = body?.subscription;
    const endpoint: unknown = sub?.endpoint;
    const p256dh: unknown = sub?.keys?.p256dh;
    const auth: unknown = sub?.keys?.auth;
    if (
      typeof endpoint !== "string" ||
      typeof p256dh !== "string" ||
      typeof auth !== "string"
    ) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const topics = Array.isArray(body?.topics)
      ? (body.topics as unknown[])
          .filter((t): t is string => typeof t === "string")
          .slice(0, 50)
      : [];
    const { error } = await getSupabaseAdmin()
      .from("push_subscriptions")
      .upsert(
        {
          endpoint,
          p256dh,
          auth,
          topics,
          user_agent:
            typeof body?.ua === "string" ? (body.ua as string).slice(0, 300) : null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await getSupabaseAdmin()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
