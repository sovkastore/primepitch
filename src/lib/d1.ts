import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getD1(): Promise<D1Database | undefined> {
  try {
    const { env } = await getCloudflareContext() as any;
    return env.DB as D1Database | undefined;
  } catch (e) {
    // Fallback if not running in the Cloudflare Worker context (e.g. local scripts, build step)
    return (process as any).env.DB as D1Database | undefined;
  }
}
