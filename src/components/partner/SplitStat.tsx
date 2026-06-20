// Shared his/yours/total stat card. Blue always = the partner's referred people.
export interface Split { total: number; his: number; yours: number }

export function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function asSplit(s: Partial<Split> | undefined | null): Split {
  return { total: n(s?.total), his: n(s?.his), yours: n(s?.yours) };
}

// `solo` = own-people-only view: show just the partner's own number, no split.
export function SplitStat({ label, data, hint, mine, solo }: { label: string; data?: Partial<Split>; hint?: string; mine?: boolean; solo?: boolean }) {
  const d = asSplit(data);
  const blueLabel = mine ? "me" : "his";
  const greyLabel = mine ? "others" : "yours";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 tracking-wider uppercase">{label}</p>
      <p className="text-2xl sm:text-3xl font-black mt-2 tabular-nums text-gray-900">{d.total.toLocaleString()}</p>
      {solo ? (
        <div className="mt-2 text-[12px] font-bold text-blue-600">your visitors</div>
      ) : (
        <div className="flex items-center gap-2.5 mt-2 text-[12px] font-bold">
          <span className="text-blue-600">{d.his.toLocaleString()} {blueLabel}</span>
          <span className="text-gray-300">•</span>
          <span className="text-gray-500">{d.yours.toLocaleString()} {greyLabel}</span>
        </div>
      )}
      {hint && <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{hint}</p>}
    </div>
  );
}

// Convenience wrapper for the partner's own dashboard, where blue = "me".
export function MeStat(props: { label: string; data?: Partial<Split>; hint?: string }) {
  return <SplitStat {...props} mine />;
}

// Small inline his/yours pair for use inside table rows.
export function SplitInline({ data }: { data?: Partial<Split> }) {
  const d = asSplit(data);
  return (
    <span className="tabular-nums">
      <span className="text-gray-900 font-bold">{d.total.toLocaleString()}</span>
      <span className="text-blue-600 font-semibold ml-2">{d.his.toLocaleString()}</span>
      <span className="text-gray-400 ml-1.5">/ {d.yours.toLocaleString()}</span>
    </span>
  );
}
