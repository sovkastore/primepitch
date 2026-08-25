# Kadam Pub API — publisher documentation

Transcribed from the Swagger UI (`kadam-api-spec.json`, **v1.0.0 / OAS3**) on 2026-08-18.
Second ad network alongside Adsterra. See `docs/adsterra/publisher-api.md` for the other one.

## Access

| | |
|---|---|
| Base URL | `https://pub.kadam.net/api` |
| Auth | "Authorize" (lock icon on every endpoint) — scheme not shown in the UI |
| Getting access | **"To get access, please contact your manager."** — API access is not self-serve |

> Kadam's own note: *"API methods available for publishers. For ease of understanding and
> forming requests, you can perform the same operations in the dashboard and view the sent
> requests in the console."* — i.e. the dashboard's network console is the best way to learn
> the exact request shapes.

## Site verification (our account)

Kadam issues an HTML verification file that must be reachable at the site root:

```
file : kadam0094e9558e25dd519a03467b1350f4b2.html
body : kadam0094e9558e25dd519a03467b1350f4b2
URL  : https://primepitch.cc/kadam0094e9558e25dd519a03467b1350f4b2.html
```

In this project that means dropping the file in `public/` — Next.js serves `public/*`
verbatim at the domain root. NOT YET ADDED (awaiting go-ahead).

## Endpoints

### sources — Sites
| Method | Path | Purpose |
|---|---|---|
| POST | `/sources/sources-table` | List sites with brief statistics |
| POST | `/sources` | Create a site |
| GET | `/sources/{id}` | Site information |
| POST | `/sources/{id}` | Update the site |
| POST | `/sources/archive/{id}` | Archive a site |
| POST | `/sources/un-archive/{id}` | Restore site from archive |
| POST | `/sources/{id}/deactivate` | Pause the site |
| POST | `/sources/{id}/activate` | Activate the site |

### places — Blocks (ad units)
| Method | Path | Purpose |
|---|---|---|
| POST | `/places/places-table/{id}` | List blocks with brief statistics |
| POST | `/places/places-table/table-filters` | Parameters for table filters |
| DELETE | `/places/{id}` | Archive the block |
| POST | `/places/{id}/restore` | Restore block from archive |
| POST | `/places/{id}/deactivate` | Pause the block |
| POST | `/places/{id}/activate` | Activate the block |

### users — User
| Method | Path | Purpose |
|---|---|---|
| POST | `/users/check-upd` | User information |

### custom-reports — Statistics  ← the money data
| Method | Path | Purpose |
|---|---|---|
| OPTIONS | `/custom-reports` | **List of available groupings / metrics / periods** |
| POST | `/custom-reports/data` | Retrieve statistics |
| POST | `/custom-reports/filter-data` | Parameters for table filters |

### AdSpyGlass — mediation
| Method | Path | Purpose |
|---|---|---|
| GET | `/partners/asg/blocks` | List of active blocks |
| GET | `/partners/asg/block` | Block data (embed code) |

## Schemas (as shown)

**TableFilters** — `perPage` (int, min 1, default 20, e.g. 100), `page` (int, min 1, default 1),
`sort` (array, e.g. `{"domain":"asc","url":"desc"}`), `filters` (array, e.g.
`{"dateFrom":"2022-09-01","dateTo":"2022-09-07","archive":false,"timezone":+10}`)

**TableFilterInfo** — `column` (e.g. `type`), `field` (e.g. `BlockType`)

**BaseResponse** — `code` (int, e.g. 200), `msg`, `success` (bool). Envelope shared by
`BaseTableResponse`, `TableFiltersResponse`, `SourcesTableResponse`, `Source`,
`CreatedSource`, `UpdatedSource`, `PlacesTableResponse`, `UsersUpdatedInfo`,
`CustomReportsInfo`, `CustomReportsDataResponse`, `CustomReportsFilterDataResponse`
(each adds `data`).

**CreateSource** — `name` (e.g. "Site name"), `url` (e.g. `https://www.kadam.net`),
`state` (enum; *"When creating, always pass `onEdit`"*)

**UpdateSource** — *"Updating the name of the verified site."* `name`, `url` (**"can only be
updated when there are no active blocks"**), `state` (*"To update the name, specify
`accepted`"*)

**CustomReportsData** — `compare`, `groups`, `metrics`, `filters`, `page` (e.g. 1),
`perPage` (e.g. 20), `sort`

**CustomReportsFilterData** — `id` (e.g. `trafficBlockFormat`, *"column name for which the
list of elements is needed for the filter"*), `searchQuery` (*"if the filter has
filterSync = true, specify the desired value to get the required element"*)

**AdSpyGlassBlockList** — `zone_id` (int), `zone_name`, `zone_adtype` (enum, 3 values), `site`
(*"site domain without scheme"*)

**AdSpyGlassBlockData** — `zone_id`, `zone_code` (*"embed code for block"*), `zone_sw`
(*"(only for push) service worker code"*), `zone_sw_name` (*"(only for push) service worker
filename"*)

## Open questions for us

1. **Per-partner revenue split.** With Adsterra we proved a sub-id works via the popunder
   tag's `data-domain` attribute. Kadam's equivalent is unknown — the place to look is
   `OPTIONS /custom-reports`, which returns the list of **groupings**. If a sub-id / custom
   parameter grouping exists there, the same one-block/many-labels trick applies.
2. **API access requires a manager**, so none of the above is callable until Kadam grants it.
3. `zone_code` from `/partners/asg/block` is the embed snippet — useful for wiring a Kadam
   block into the existing ads config (same mechanism as the Adsterra formats).
