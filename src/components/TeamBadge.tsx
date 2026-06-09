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

const SIZES = {
  sm: { img: "max-w-8 max-h-8 min-w-6", text: "text-[10px]", fallback: "w-8 h-8" },
  md: { img: "max-w-12 max-h-12 min-w-8", text: "text-sm", fallback: "w-12 h-12" },
  lg: { img: "max-w-16 max-h-16 min-w-10", text: "text-lg", fallback: "w-16 h-16" },
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
