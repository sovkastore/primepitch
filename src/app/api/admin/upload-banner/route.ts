import { NextRequest, NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d1 = await getD1();
  if (!d1) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

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
    
    const fileName = `promo-${Date.now()}.${ext}`;

    try {
      await d1.prepare("INSERT INTO d1_banners (name, mime, data) VALUES (?, ?, ?)").bind(fileName, mime, image).run();
      const publicUrl = `/api/banners/${fileName}`;
      return NextResponse.json({ ok: true, url: publicUrl });
    } catch (error: any) {
       return NextResponse.json({ error: "Upload failed: " + error.message }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
