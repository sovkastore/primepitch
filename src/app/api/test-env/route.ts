import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = (process as any).env;
    return NextResponse.json({
      process_exists: typeof process !== "undefined",
      env_keys: Object.keys(env || {}),
      db_exists: !!(env && env.DB),
      time: new Date().toISOString()
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack });
  }
}
