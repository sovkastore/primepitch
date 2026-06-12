"use client";

// Tiny stale-while-revalidate cache on sessionStorage: pages paint instantly
// from the last known data, then refresh quietly in the background. Makes
// switching between Home and World Cup feel as instant as the in-page tabs.

export function readPageCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writePageCache(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures are fine — cache is purely an optimization.
  }
}
