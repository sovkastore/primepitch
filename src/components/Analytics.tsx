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

    // Only track the initial landing page view of the session to keep Visitors logs active
    // without bloating the database with every page transition.
    const isSessionTracked = sessionStorage.getItem("pp_session_tracked");
    if (isSessionTracked) return;

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
    })
      .then((res) => {
        if (res.ok) {
          sessionStorage.setItem("pp_session_tracked", "true");
        }
      })
      .catch(() => {});
  }, [pathname]);

  // Heartbeat for active presence — Only runs when actively on a live stream watch page
  // to track people currently watching a live match.
  useEffect(() => {
    const visitor_id = getVisitorId();
    if (!visitor_id) return;

    const sendHeartbeat = () => {
      const path = window.location.pathname;
      const watchMatch = path.match(/^\/watch\/([^/]+)/);
      // The watch page raises this flag once its match has ended.
      const ended = (window as unknown as { __ppMatchEnded?: boolean }).__ppMatchEnded === true;

      // Only send heartbeat if they are on an active watch page
      if (!watchMatch || ended) return;

      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id,
          path,
          match_id: decodeURIComponent(watchMatch[1]),
        }),
      }).catch(() => {});
    };

    return visibleInterval(sendHeartbeat, 300_000);
  }, []);

  return null;
}
