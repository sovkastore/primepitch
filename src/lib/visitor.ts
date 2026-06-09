"use client";

export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("pp_vid");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pp_vid", id);
  }
  return id;
}

export function getDeviceType(): string {
  if (typeof window === "undefined") return "unknown";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}
