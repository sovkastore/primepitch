export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1";

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64Lines = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const b64 = atob(b64Lines);
  const buf = new Uint8Array(b64.length);
  for (let i = 0; i < b64.length; i++) {
    buf[i] = b64.charCodeAt(i);
  }
  return buf.buffer;
}

async function getGa4AccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat
  };

  const encHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = new TextEncoder().encode(`${encHeader}.${encPayload}`);

  const privateKeyDer = pemToArrayBuffer(privateKeyPem);
  const key = await subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );

  const signature = await subtle.sign('RSASSA-PKCS1-v1_5', key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${encHeader}.${encPayload}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  if (!res.ok) {
    throw new Error(`Failed to get Google access token: ${await res.text()}`);
  }
  const tokenData = await res.json();
  return tokenData.access_token;
}

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

  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    const accessToken = await getGa4AccessToken(clientEmail, privateKey);

    const runReport = async (body: any) => {
      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        throw new Error(`GA4 API Error: ${await res.text()}`);
      }
      return res.json();
    };

    const d1 = await getD1();
    if (!d1) return NextResponse.json({ error: "D1 not available" }, { status: 500 });

    // ?days=N (1-90) backfills the last N days in one run; default is today
    // only, which is what the hourly cron uses. Every report carries the date
    // dimension so multi-day responses split into per-day rows.
    const daysParam = Number(new URL(req.url).searchParams.get("days") || 1);
    const days = Math.min(90, Math.max(1, Number.isFinite(daysParam) ? daysParam : 1));
    const range = { startDate: days > 1 ? `${days - 1}daysAgo` : "today", endDate: "today" };
    const fmtDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

    const response = await runReport({
      dateRanges: [range],
      dimensions: [{ name: "date" }, { name: "customEvent:ref_code" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "activeUsers" },
        { name: "newUsers" },
      ],
    });

    const [devicesRes, referrersRes, pagesRes] = await Promise.all([
      runReport({
        dateRanges: [range],
        dimensions: [{ name: "date" }, { name: "customEvent:ref_code" }, { name: "deviceCategory" }],
        metrics: [{ name: "screenPageViews" }],
      }),
      runReport({
        dateRanges: [range],
        dimensions: [{ name: "date" }, { name: "customEvent:ref_code" }, { name: "sessionSource" }],
        metrics: [{ name: "screenPageViews" }],
      }),
      runReport({
        dateRanges: [range],
        dimensions: [{ name: "date" }, { name: "customEvent:ref_code" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
      })
    ]);

    const devicesMap: Record<string, Record<string, number>> = {};
    const referrersMap: Record<string, Record<string, number>> = {};
    const pagesMap: Record<string, Record<string, number>> = {};

    // Maps are keyed by `${date}|${refCode}` so multi-day backfills stay separated
    const processAdvanced = (res: any, map: Record<string, Record<string, number>>) => {
      if (res.rows) {
        for (const row of res.rows) {
          const date = fmtDate(row.dimensionValues?.[0]?.value || '');
          let refCode = row.dimensionValues?.[1]?.value || 'none';
          if (refCode === '(not set)') refCode = 'none';
          const dimVal = row.dimensionValues?.[2]?.value || 'unknown';
          const views = parseInt(row.metricValues?.[0]?.value || '0');
          const key = `${date}|${refCode}`;
          if (!map[key]) map[key] = {};
          map[key][dimVal] = (map[key][dimVal] || 0) + views;
        }
      }
    };

    processAdvanced(devicesRes, devicesMap);
    processAdvanced(referrersRes, referrersMap);
    processAdvanced(pagesRes, pagesMap);

    const rowsToInsert = [];

    if (response.rows) {
      for (const row of response.rows) {
        const dateStr = fmtDate(row.dimensionValues?.[0]?.value || '');
        let refCode = row.dimensionValues?.[1]?.value || 'none';
        if (refCode === '(not set)') refCode = 'none';

        const pageViews = parseInt(row.metricValues?.[0]?.value || '0');
        const activeUsers = parseInt(row.metricValues?.[1]?.value || '0');
        const newUsers = parseInt(row.metricValues?.[2]?.value || '0');
        const returningUsers = Math.max(0, activeUsers - newUsers);

        const key = `${dateStr}|${refCode}`;
        const devJson = JSON.stringify(devicesMap[key] || {});
        const refJson = JSON.stringify(referrersMap[key] || {});
        const pgJson = JSON.stringify(pagesMap[key] || {});

        const id = `${dateStr}-${refCode}`;

        rowsToInsert.push(
          d1.prepare(`
            INSERT INTO d1_ga4_cache (id, date, ref_code, page_views, unique_visitors, new_visitors, returning_visitors, devices_json, referrers_json, pages_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET 
              page_views=excluded.page_views,
              unique_visitors=excluded.unique_visitors,
              new_visitors=excluded.new_visitors,
              returning_visitors=excluded.returning_visitors,
              devices_json=excluded.devices_json,
              referrers_json=excluded.referrers_json,
              pages_json=excluded.pages_json,
              updated_at=CURRENT_TIMESTAMP
          `).bind(id, dateStr, refCode, pageViews, activeUsers, newUsers, returningUsers, devJson, refJson, pgJson)
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
