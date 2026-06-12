// Runs `fn` now, then every `ms` — but only while the tab is visible, so background
// tabs stop hitting the API (the main source of wasted Cloudflare requests). Re-runs
// immediately when the tab becomes visible again. Returns a cleanup for useEffect.
export function visibleInterval(fn: () => void, ms: number): () => void {
  if (typeof window === "undefined") return () => {};
  const run = () => { if (!document.hidden) fn(); };
  run();
  const timer = setInterval(run, ms);
  const onVisible = () => { if (!document.hidden) fn(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
