import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Verifies the caller is a signed-in admin (same rule as the /admin middleware:
// a valid Supabase session whose email is in ADMIN_EMAILS). Used to guard
// sensitive admin write endpoints that the middleware doesn't cover.
export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll() { /* read-only check; no cookie refresh needed */ },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase());
    return adminEmails.includes(user.email?.toLowerCase() || "");
  } catch {
    return false;
  }
}
