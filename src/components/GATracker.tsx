"use client";

import { useEffect } from "react";
import { sendGAEvent } from "@next/third-parties/google";

export default function GATracker() {
  useEffect(() => {
    // Read the partner referral cookie if it exists
    const match = document.cookie.match(new RegExp("(^| )pp_ref=([^;]+)"));
    if (match && match[2]) {
      const ref = decodeURIComponent(match[2]);
      
      // Send a custom event to GA4 that also sets user properties for the session
      // For this to persist, you may also need to register 'partner_code' as a Custom Dimension in the GA4 admin dashboard.
      try {
        if (typeof window !== "undefined" && (window as any).gtag) {
          (window as any).gtag("set", "user_properties", {
            partner_code: ref,
          });
        }
      } catch (e) {
        // Ignore GA errors
      }
    }
  }, []);

  return null;
}
