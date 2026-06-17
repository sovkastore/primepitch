"use client";

import { useCallback, useEffect, useState } from "react";

export function usePartnerData<T>(url: string, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as T);
      setError(null);
    } catch {
      setError("Couldn't load data");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    if (intervalMs) {
      const id = setInterval(load, intervalMs);
      return () => clearInterval(id);
    }
  }, [load, intervalMs]);

  return { data, loading, error, reload: load };
}
