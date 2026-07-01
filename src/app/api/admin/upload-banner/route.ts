import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  try {
    const body = await request.json();
    const { image } = body;

    if (!image || !image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    }

    const m = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) {
      return NextResponse.json({ error: "Could not parse image" }, { status: 400 });
    }

    const mime = m[1];
    const ext = mime.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg").split("+")[0];
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    
    // Create bucket if it doesn't exist (attempts to be robust)
    const BUCKET = "banners";
    
    const fileName = `promo-${Date.now()}.${ext}`;
    const filePath = `site/${fileName}`;

    const { data, error } = await sb.storage.from(BUCKET).upload(filePath, bytes, {
      contentType: mime,
      upsert: true,
    });

    if (error) {
       // If bucket doesn't exist, this will fail. 
       // In a real prod env, the bucket 'banners' should be created with Public Access.
       return NextResponse.json({ error: "Upload failed: " + error.message + ". Make sure 'banners' bucket exists in Supabase storage with public access." }, { status: 500 });
    }

    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(filePath);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
