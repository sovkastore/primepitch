import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminRequest, ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";

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
  "cricket", "tv-channels", "ppv",
]);

// Active partner codes, cached per worker isolate to avoid a DB call per request.
let codesCache: { at: number; codes: Set<string> } = { at: 0, codes: new Set() };
const CODES_TTL_MS = 60_000;

async function getActiveCodes(): Promise<Set<string>> {
  const now = Date.now();
  if (now - codesCache.at < CODES_TTL_MS) return codesCache.codes;
  try {
    // Use the D1 REST API through our own API route
    // In middleware, we can't use getD1() directly (edge runtime limitations),
    // so we use a lightweight fetch to our own endpoint
    const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.CF_PAGES_URL || "";
    if (origin) {
      const res = await fetch(`${origin}/api/partner-codes`, { 
        headers: { "x-internal": "1" },
        next: { revalidate: 60 } 
      });
      if (res.ok) {
        const arr = (await res.json()) as string[];
        codesCache = { at: now, codes: new Set((arr || []).map((c) => String(c).toLowerCase())) };
        return codesCache.codes;
      }
    }
  } catch {
    /* keep stale cache on error */
  }
  codesCache.at = now; // don't hammer on repeated failure
  return codesCache.codes;
}

// Maintenance flag, cached per worker isolate so a toggle takes effect within
// ~15s without a DB read on every request.
let maintCache: { at: number; on: boolean; message: string } = { at: 0, on: false, message: "" };
const MAINT_TTL_MS = 15_000;

async function getMaintenance(): Promise<{ on: boolean; message: string }> {
  const now = Date.now();
  if (now - maintCache.at < MAINT_TTL_MS) return maintCache;
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || process.env.CF_PAGES_URL || "";
    if (origin) {
      const res = await fetch(`${origin}/api/maintenance-status`, {
        headers: { "x-internal": "1" },
        next: { revalidate: 15 }
      });
      if (res.ok) {
        const v = (await res.json()) as { on?: boolean; message?: string } | null;
        maintCache = {
          at: now,
          on: !!v?.on,
          message: typeof v?.message === "string" ? v.message : "",
        };
        return maintCache;
      }
    }
  } catch {
    /* keep stale cache on error — never take the site down over a read failure */
  }
  maintCache.at = now; // don't hammer on repeated failure
  return maintCache;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function maintenancePage(message: string): NextResponse {
  const msg =
    message.trim() ||
    "We're doing some quick maintenance and will be back shortly. Please check back in a little while.";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Under maintenance</title><style>` +
    `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;` +
    `justify-content:center;background:#0b0f14;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,` +
    `'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px}.card{max-width:460px;text-align:center}` +
    `.badge{width:64px;height:64px;border-radius:18px;background:#1f2937;display:flex;align-items:center;` +
    `justify-content:center;margin:0 auto 22px;font-size:30px}h1{font-size:24px;font-weight:800;margin:0 0 12px}` +
    `p{font-size:15px;line-height:1.6;color:#9ca3af;margin:0}.status{margin-top:20px;color:#6b7280;font-size:13px}` +
    `.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:8px;` +
    `vertical-align:middle;animation:pulse 1.4s infinite}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}` +
    `</style></head><body><div class="card"><div class="badge">&#128295;</div>` +
    `<h1>We&#39;ll be right back</h1><p>${escapeHtml(msg)}</p>` +
    `<p class="status"><span class="dot"></span>Maintenance in progress</p></div></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Retry-After": "3600",
      "Cache-Control": "no-store",
    },
  });
}

function singleSegment(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  const seg = pathname.slice(1);
  if (seg === "" || seg.includes("/") || seg.includes(".")) return null;
  return seg;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0) Canonical domain. Send xellnetwork.xyz to the workers.dev address so the
  // whole site — and each visitor's identity — lives on ONE origin
  // (primepitch.daxonicstudios.workers.dev). Exact host match only, so versioned
  // preview deploys still work for testing. Temporary (307) = easily reversible.
  const host = request.headers.get("host") || "";
  if (host === "xellnetwork.xyz" || host === "www.xellnetwork.xyz") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "primepitch.daxonicstudios.workers.dev";
    url.port = "";
    return NextResponse.redirect(url, 307);
  }

  // 0.5) Maintenance mode. When ON, only /admin and signed-in admins get through;
  // everyone else gets a lightweight "be right back" page served straight from the
  // edge (no app load). Public visitors have no admin cookie, so they're turned away
  // with zero DB calls — the session check only runs when an auth cookie is present.
  if (!pathname.startsWith("/admin")) {
    const maint = await getMaintenance();
    if (maint.on) {
      const hasAdminCookie = !!request.cookies.get(ADMIN_COOKIE)?.value;
      const admin = hasAdminCookie ? await isAdminRequest(request) : false;
      if (!admin) return maintenancePage(maint.message);
    }
  }

  // 1) Referral capture — original path-based logic (/CODE)
  // A visit to /<partnerCode> (e.g. /gims) sets a long-lived cookie and redirects
  // home. This logic is left completely untouched per requirements.
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

  // 1.5) Silent Query-param Referral (?ref=CODE)
  // New additive mechanism: lets a partner share a link to ANY page (e.g. /ppv?ref=gims)
  // that tags the visitor silently without redirecting them.
  const refParam = request.nextUrl.searchParams.get("ref");
  let pendingRefCode: string | null = null;
  if (refParam && !request.cookies.has(REF_COOKIE)) {
    const code = refParam.toLowerCase();
    try {
      const codes = await getActiveCodes();
      if (codes.has(code)) {
        pendingRefCode = code;
      }
    } catch { /* ignore */ }
  }

  // Helper to attach the pending referral cookie to whatever response we return.
  function withRef(res: NextResponse): NextResponse {
    if (pendingRefCode) {
      res.cookies.set(REF_COOKIE, pendingRefCode, {
        maxAge: REF_MAX_AGE, path: "/", httpOnly: true, sameSite: "lax", secure: true,
      });
    }
    return res;
  }

  // 2) Admin protection
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return withRef(NextResponse.next());
  }

  // Check admin session via HMAC cookie (no Supabase needed)
  const adminToken = request.cookies.get(ADMIN_COOKIE)?.value;
  const session = await verifyAdminSession(adminToken);
  if (!session) {
    return withRef(NextResponse.redirect(new URL("/admin/login", request.url)));
  }

  return withRef(NextResponse.next());
}

export const config = {
  // Runs on all pages (for referral capture) + /admin (for auth),
  // excluding api, _next internals, and any file with an extension.
  matcher: ["/((?!api|_next|.*\\..*).*)" ],
};
