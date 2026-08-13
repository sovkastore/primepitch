import { getD1 } from "@/lib/d1";

// Upsert a d1_match_flags row touching only alt_visible (+ match_data when given).
export async function setMatchFlag(
  d1: D1Database,
  matchId: string,
  altVisible: boolean,
  matchData?: object
) {
  const row: Record<string, unknown> = {
    match_id: matchId,
    alt_visible: altVisible,
    updated_at: new Date().toISOString(),
  };
  if (matchData) row.match_data = JSON.stringify(matchData);
  const keys = Object.keys(row);
  await d1
    .prepare(
      `INSERT INTO d1_match_flags (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})
       ON CONFLICT(match_id) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(", ")}`
    )
    .bind(...Object.values(row))
    .run();
}

export { getD1 };
