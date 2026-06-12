"use client";

import { useEffect, useState } from "react";

// Resize-aware mobile check for tuning chart props (margins, heights, tick intervals).
// Starts false (SSR-safe) and updates on mount + resize.
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}
