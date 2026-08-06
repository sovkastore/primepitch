import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

export const dynamic = "force-dynamic";

// Store APK as binary blob in D1 chunked, then serve via /api/download-apk
// For large files we store metadata + base64 chunks in d1_site_settings
// Since D1 rows are limited, we store the file URL approach:
// The file is stored in D1 as base64 in chunks, stitched on download.
// NOTE: This works for files up to ~10MB. For larger files use a URL instead.

const KEY = "vpn_apk_data";
const META_KEY = "vpn_apk_meta";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate it's an APK
    const isApk =
      file.name.endsWith(".apk") ||
      file.type === "application/vnd.android.package-archive" ||
      file.type === "application/octet-stream";

    if (!isApk) {
      return NextResponse.json({ error: "File must be an APK" }, { status: 400 });
    }

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    // Convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:application/vnd.android.package-archive;base64,${base64}`;

    // Store in D1 site settings
    await d1
      .prepare(
        `INSERT INTO d1_site_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .bind(KEY, dataUrl, new Date().toISOString())
      .run();

    // Store metadata
    const meta = {
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };
    await d1
      .prepare(
        `INSERT INTO d1_site_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .bind(META_KEY, JSON.stringify(meta), new Date().toISOString())
      .run();

    const downloadUrl = "/api/download-apk";
    return NextResponse.json({ ok: true, url: downloadUrl, name: file.name, size: file.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
