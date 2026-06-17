import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Partner referral capture
// A visit to /<partnerCode> (e.g. /gims) sets a long-lived cookie and redirects
// home. Only real, active partner codes are intercepted — everything else falls
// through untouched (so /<sport> etc. behave exactly as before).
// ---------------------------------------------------------------------------
const REF_COOKIE = "pp_ref";
const REF_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Real top-level routes/assets — never treated as a partner code.
const RESERVED = new Set([
  "admin", "api", "watch", "contact", "subscribe", "match-alerts",
  "world-cup", "partner", "_next", "offline", "icons", "alerts",
]);

// Active partner codes, cached per worker isolate to avoid a DB call per request.
let codesCache: { at: number; codes: Set<string> } = { at: 0, codes: new Set() };
const CODES_TTL_MS = 60_000;

async function getActiveCodes(): Promise<Set<string>> {
  const now = Date.now();
  if (now - codesCache.at < CODES_TTL_MS) return codesCache.codes;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${url}/rest/v1/rpc/active_partner_codes`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.ok) {
      const arr = (await res.json()) as string[] | null;
      codesCache = { at: now, codes: new Set((arr || []).map((c) => String(c).toLowerCase())) };
      return codesCache.codes;
    }
  } catch {
    /* keep stale cache on error */
  }
  codesCache.at = now; // don't hammer on repeated failure
  return codesCache.codes;
}

function singleSegment(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  const seg = pathname.slice(1);
  if (seg === "" || seg.includes("/") || seg.includes(".")) return null;
  return seg;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0) Canonical domain. Send the default workers.dev address to the main domain
  // so the whole site — and each visitor's identity — lives on ONE origin.
  // Exact host match only, so versioned preview deploys still work for testing.
  // Temporary (307) so it stays easily reversible.
  const host = request.headers.get("host") || "";
  if (host === "primepitch.daxonicstudios.workers.dev") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "xellnetwork.xyz";
    url.port = "";
    return NextResponse.redirect(url, 307);
  }

  // 1) Referral capture (never blocks the site — any error falls through).
  const seg = singleSegment(pathname);
  if (seg && !pathname.startsWith("/admin")) {
    const code = seg.toLowerCase();
    if (!RESERVED.has(code)) {
      try {
        const codes = await getActiveCodes();
        if (codes.has(code)) {
          const redirect = NextResponse.redirect(new URL("/", request.url));
          redirect.cookies.set(REF_COOKIE, code, {
            maxAge: REF_MAX_AGE, path: "/", httpOnly: true, sameSite: "lax", secure: true,
          });
          return redirect;
        }
      } catch {
        /* ignore — fall through to normal routing */
      }
    }
  }

  // 2) Admin protection (unchanged behaviour).
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (!adminEmails.includes(user.email?.toLowerCase() || "")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // Runs on all pages (for referral capture) + /admin (for auth),
  // excluding api, _next internals, and any file with an extension.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
