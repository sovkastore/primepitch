import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE, USER_COOKIE_OPTS, resolveUser, toMe } from "@/lib/user-auth";
import { isVipLive } from "@/lib/vip-live";

export const dynamic = "force-dynamic";

// Who am I? Also the heartbeat the single-session rule rides on: when the
// cookie no longer matches the account's live session, this answers
// `replaced` and clears the cookie, so the device that was signed in
// elsewhere drops out. `live` says whether VIP has launched (menus hide it
// until then).
export async function GET(request: NextRequest) {
  const live = await isVipLive();
  const token = request.cookies.get(USER_COOKIE)?.value;
  const r = await resolveUser(token);
  if (r.ok) {
    return NextResponse.json({ me: toMe(r.user), live }, { headers: { "Cache-Control": "no-store" } });
  }
  const res = NextResponse.json({ me: null, reason: r.reason, live }, { headers: { "Cache-Control": "no-store" } });
  if (token) res.cookies.set(USER_COOKIE, "", { ...USER_COOKIE_OPTS, maxAge: 0 });
  return res;
}
