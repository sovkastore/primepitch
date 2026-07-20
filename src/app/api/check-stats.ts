import { getD1 } from "../../lib/d1";

export async function GET() {
  const d1 = await getD1();
  if (!d1) return Response.json([]);
  const { results } = await d1.prepare("SELECT match_title, unique_viewers, peak_viewers FROM d1_match_stats ORDER BY unique_viewers DESC LIMIT 5").all();
  return Response.json(results);
}
