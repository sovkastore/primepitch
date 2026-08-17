# Adsterra Publishers API — v3.0.0

Reference captured from the official Stoplight docs (screenshots, Aug 2026).

## Basics

- **Base URL:** `https://api3.adsterratools.com/publisher`
- **Auth:** header `X-API-Key: <token>` (token from the API page inside the Adsterra
  user panel; only one valid token at a time, valid until manually invalidated).
  Note: v3 moved the key from the URL into the header.
- **Rate limit:** 1200 requests per minute, per user.
- **`{format}`** path parameter on every endpoint: `json` | `xml` | `csv` (default `json`).

## Endpoints

### Domains
`GET /domains.{format}`

Returns `{ items: [{ id, title }], itemCount }`.

### Publisher placements
`GET /placements.{format}`

Returns `{ items: [{ id, domain_id, title, alias, direct_url }], itemCount }`.

### Domain placements
`GET /domain/{domain_id}/placements.{format}`

Same item shape minus `domain_id`. `domain_id` is required in the path.

### SmartLinks
`GET /smart-links.{format}`

Query params:
- `status` — `3` Active, `4` Inactive
- `traffic_type` — `1` Mainstream, `2` Adult

Returns `{ data: { items: [{ id, title, alias, url, traffic_type, status }] } }`
(note: SmartLinks nests under `data`, unlike the other endpoints).

### Statistics — the important one
`GET /stats.{format}`

**Required query params:**
- `start_date` — `YYYY-MM-DD`, on/after 2016-12-17
- `finish_date` — `YYYY-MM-DD`, on/after 2016-12-17, range ≤ 366 days
- `group_by` — array of 1–3 values. **Allowed: `date`, `domain`, `placement`,
  `country`, `placement_sub_id`.** Single values also accepted
  (`?group_by=date` as well as `?group_by[]=date`).

**Optional filters:**
- `country` — two-letter ISO code
- `domain` — domain id
- `placement` — deprecated, use `placement_ids`
- `placement_ids` — array, < 500 ids, e.g. `placement_ids[]=1&placement_ids[]=2`

**Response:**
```json
{
  "items": [
    { "date": "2018-10-04", "impression": 3014, "clicks": 175,
      "ctr": 5.806, "cpm": 0.383, "revenue": 1.154 }
  ],
  "itemCount": 2,
  "dbLastUpdateTime": "2018-10-08 14:47:49",
  "dbDateTime": "2018-10-08 14:47:54"
}
```

Response codes across endpoints: 200, 401, 403, 404, 405, 422.

## Why `placement_sub_id` matters for us

`group_by=placement_sub_id` means Adsterra tracks a **sub-id dimension inside a
single placement** and can report revenue broken down by it. That is the
mechanism for per-partner earnings **without creating one zone per partner** —
one popunder placement, a different sub-id per referral code.

Open question to confirm with Adsterra support: exactly how to set the sub-id on
the **popunder JS tag** (their docs show sub-ids clearly for Direct Links /
SmartLinks; the script-tag syntax needs confirming before we build on it).

## Example request

```bash
curl --request GET \
  --url 'https://api3.adsterratools.com/publisher/stats.json?start_date=2026-08-01&finish_date=2026-08-17&group_by[]=date&group_by[]=placement_sub_id' \
  --header 'Accept: application/json' \
  --header 'X-API-Key: <token>'
```
