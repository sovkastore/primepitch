"use client";

import { useState } from "react";
import { getBadgeUrl } from "@/lib/api";
import { getCountryFlagUrl } from "@/lib/country-flags";

interface TeamBadgeProps {
  badge?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  sport?: string;
}

// Crests from the `badge` endpoint are clean squares, so a fixed square box with
// object-contain keeps every logo consistently sized and never clipped.
const SIZES = {
  sm: { img: "w-8 h-8", text: "text-[10px]", fallback: "w-8 h-8" },
  md: { img: "w-12 h-12", text: "text-sm", fallback: "w-12 h-12" },
  lg: { img: "w-16 h-16", text: "text-lg", fallback: "w-16 h-16" },
};

export default function TeamBadge({ badge, name, size = "md" }: TeamBadgeProps) {
  const [badgeFailed, setBadgeFailed] = useState(false);
  const [flagFailed, setFlagFailed] = useState(false);
  const s = SIZES[size];

  // 1. Try API badge
  if (badge && !badgeFailed) {
    return (
      <img
        src={getBadgeUrl(badge)}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${s.img} object-contain shrink-0`}
        onError={() => setBadgeFailed(true)}
      />
    );
  }

  // 2. Try country flag
  const flagUrl = getCountryFlagUrl(name);
  if (flagUrl && !flagFailed) {
    return (
      <img
        src={flagUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${s.img} object-contain shrink-0 rounded-sm`}
        onError={() => setFlagFailed(true)}
      />
    );
  }

  // 3. Fallback: letter in a circle
  return (
    <div className={`${s.fallback} rounded-full bg-gray-100 flex items-center justify-center shrink-0`}>
      <span className={`${s.text} font-bold text-gray-500`}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
