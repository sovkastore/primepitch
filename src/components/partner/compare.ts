// Admin-only comparison toggle for the p/ pages.
//   "all" → selected partner (blue) vs everyone else (you + all other partners).
//   "me"  → selected partner (blue) vs your OWN organic traffic only (no partner).
//
// The stat functions now return `own` (organic / no-partner) alongside total/his/yours.
// In "me" mode we rewrite, on every split-shaped object in the payload:
//   total  → his + own        (big number = partner + you)
//   yours  → own              (grey = just you)
// plus the peak* and unique* field families used in the match tables.
// This keeps every panel, table and chart correct without per-component plumbing.
export type CompareMode = "all" | "me";

type AnyObj = Record<string, unknown>;
const isNum = (o: AnyObj, k: string) => typeof o[k] === "number";

function rewrite(o: AnyObj) {
  if (isNum(o, "his") && isNum(o, "own")) {
    if (isNum(o, "total")) o.total = (o.his as number) + (o.own as number);
    if (isNum(o, "yours")) o.yours = o.own as number;
  }
  if (isNum(o, "peakHis") && isNum(o, "peakOwn")) {
    if (isNum(o, "peakTotal")) o.peakTotal = (o.peakHis as number) + (o.peakOwn as number);
    if (isNum(o, "peakYours")) o.peakYours = o.peakOwn as number;
  }
  if (isNum(o, "uniqueHis") && isNum(o, "uniqueOwn")) {
    if (isNum(o, "uniqueTotal")) o.uniqueTotal = (o.uniqueHis as number) + (o.uniqueOwn as number);
    if (isNum(o, "uniqueYours")) o.uniqueYours = o.uniqueOwn as number;
  }
}

function walk(v: unknown) {
  if (Array.isArray(v)) { v.forEach(walk); return; }
  if (v && typeof v === "object") {
    rewrite(v as AnyObj);
    Object.values(v as AnyObj).forEach(walk);
  }
}

export function applyCompare<T>(data: T, mode: CompareMode): T {
  if (mode !== "me" || data == null) return data;
  const clone = JSON.parse(JSON.stringify(data));
  walk(clone);
  return clone as T;
}
