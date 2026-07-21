export const runtime = "nodejs"; // Important: @google-analytics/data requires nodejs runtime

import { NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { getD1 } from "@/lib/d1";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET || 'secret'}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const propertyId = process.env.GA_PROPERTY_ID;
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  let privateKey = process.env.GA_PRIVATE_KEY;

  if (!propertyId || !clientEmail || !privateKey) {
    return NextResponse.json({ error: "GA4 credentials not configured" }, { status: 500 });
  }

  // Fix escaped newlines if passed via env
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    const analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      projectId: "primepitch-ga4-sync",
    });

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "D1 not available" }, { status: 500 });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    // Run report grouped by customEvent:ref_code
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        { startDate: "today", endDate: "today" }, // Fetch just today for caching
      ],
      dimensions: [
        { name: "customEvent:ref_code" }
      ],
      metrics: [
        { name: "screenPageViews" },
        { name: "activeUsers" },
        { name: "newUsers" },
      ],
    });

    const rowsToInsert = [];

    if (response.rows) {
      for (const row of response.rows) {
        let refCode = row.dimensionValues?.[0]?.value || 'none';
        if (refCode === '(not set)') refCode = 'none';

        const pageViews = parseInt(row.metricValues?.[0]?.value || '0');
        const activeUsers = parseInt(row.metricValues?.[1]?.value || '0'); // Unique visitors
        const newUsers = parseInt(row.metricValues?.[2]?.value || '0');
        const returningUsers = Math.max(0, activeUsers - newUsers);

        // We could also fetch devices/pages in separate queries and merge them, 
        // but for now, we cache the core metrics.
        const id = `${dateStr}-${refCode}`;

        rowsToInsert.push(
          d1.prepare(`
            INSERT INTO d1_ga4_cache (id, date, ref_code, page_views, unique_visitors, new_visitors, returning_visitors, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET 
              page_views=excluded.page_views,
              unique_visitors=excluded.unique_visitors,
              new_visitors=excluded.new_visitors,
              returning_visitors=excluded.returning_visitors,
              updated_at=CURRENT_TIMESTAMP
          `).bind(id, dateStr, refCode, pageViews, activeUsers, newUsers, returningUsers)
        );
      }
    }

    if (rowsToInsert.length > 0) {
      await d1.batch(rowsToInsert);
    }

    return NextResponse.json({ success: true, cachedRows: rowsToInsert.length });
  } catch (error: any) {
    console.error("GA4 Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
