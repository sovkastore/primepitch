import { getD1 } from "@/lib/d1";

// Counts every outbound RapidAPI HTTP call (per key attempt — the same way
// RapidAPI meters quota), broken down by day and source. Counting must never
// break the request itself, so all failures are swallowed.
export async function countRapidRequest(source: string): Promise<void> {
  try {
    const d1 = await getD1();
    if (!d1) return;
    const day = new Date().toISOString().split("T")[0];
    await d1
      .prepare(
        `CREATE TABLE IF NOT EXISTS d1_rapid_usage (
          day TEXT NOT NULL,
          source TEXT NOT NULL,
          n INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (day, source)
        )`
      )
      .run();
    await d1
      .prepare(
        `INSERT INTO d1_rapid_usage (day, source, n) VALUES (?, ?, 1)
         ON CONFLICT(day, source) DO UPDATE SET n = n + 1`
      )
      .bind(day, source)
      .run();
  } catch {
    /* never let usage counting break the actual request */
  }
}
