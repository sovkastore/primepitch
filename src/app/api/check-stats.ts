import { getSupabaseAdmin } from "../../lib/supabase/admin";

export async function GET() {
  const { data } = await getSupabaseAdmin()
    .from("match_stats")
    .select("match_title, unique_viewers, peak_viewers")
    .order("unique_viewers", { ascending: false })
    .limit(5);
  return Response.json(data);
}
