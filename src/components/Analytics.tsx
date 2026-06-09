"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getVisitorId, getDeviceType } from "@/lib/visitor";

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

  // Heartbeat for active presence
  useEffect(() => {
    const visitor_id = getVisitorId();
    if (!visitor_id) return;

    const sendHeartbeat = () => {
      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id,
          path: window.location.pathname,
        }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60_000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
