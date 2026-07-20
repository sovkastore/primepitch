import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    const data = JSON.parse(text) as { device_id: string; signature: string };
    
    if (!data.device_id || !data.signature) {
      return new Response("Missing fields", { status: 400 });
    }

    const d1 = await getD1();
    if (!d1) return new Response("OK", { status: 200 }); // Graceful degradation

    await d1.prepare(`
      INSERT INTO d1_dismissals (device_id, signature, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(device_id, signature) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `).bind(data.device_id, data.signature).run();

    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response("Server Error", { status: 500 });
  }
}
