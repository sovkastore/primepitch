"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getVisitorId, getDeviceType } from "@/lib/visitor";
import { visibleInterval } from "@/lib/poll";

export default function Analytics() {
  const pathname = usePathname();
  const lastPath = useRef("");

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    const visitor_id = getVisitorId();
    if (!visitor_id) return;

    fetch("/api/track/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id,
        path: pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        device_type: getDeviceType(),
      }),
    }).catch(() => {});
  }, [pathname]);

  // Heartbeat for active presence — the ONLY heartbeat on the site (the watch
  // page no longer runs its own). Every 2.5 min to keep request usage low; when
  // on a watch page it includes the match_id so per-match presence still works.
  useEffect(() => {
    const visitor_id = getVisitorId();
    if (!visitor_id) return;

    const sendHeartbeat = () => {
      const path = window.location.pathname;
      const watchMatch = path.match(/^\/watch\/([^/]+)/);
      // The watch page raises this flag once its match has ended, so a person
      // returning to an old tab counts as online — not as watching a stream.
      const ended = (window as unknown as { __ppMatchEnded?: boolean }).__ppMatchEnded === true;
      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id,
          path,
          match_id: watchMatch && !ended ? decodeURIComponent(watchMatch[1]) : null,
        }),
      }).catch(() => {});
    };

    return visibleInterval(sendHeartbeat, 300_000);
  }, []);

  return null;
}
