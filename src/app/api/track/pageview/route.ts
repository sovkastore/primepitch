import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { visitor_id, path, referrer, user_agent, device_type } =
      await request.json();

    if (!visitor_id || !path) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await supabaseAdmin.from("page_views").insert({
      visitor_id,
      path,
      referrer: referrer || null,
      user_agent: user_agent || null,
      device_type: device_type || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
