// Shared his/yours/total stat card. Blue always = the partner's referred people.
export interface Split { total: number; his: number; yours: number }

export function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function asSplit(s: Partial<Split> | undefined | null): Split {
  return { total: n(s?.total), his: n(s?.his), yours: n(s?.yours) };
}

export function SplitStat({ label, data, hint }: { label: string; data?: Partial<Split>; hint?: string }) {
  const d = asSplit(data);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 tracking-wider uppercase">{label}</p>
      <p className="text-2xl sm:text-3xl font-black mt-2 tabular-nums text-gray-900">{d.total.toLocaleString()}</p>
      <div className="flex items-center gap-2.5 mt-2 text-[12px] font-bold">
        <span className="text-blue-600">{d.his.toLocaleString()} his</span>
        <span className="text-gray-300">•</span>
        <span className="text-gray-500">{d.yours.toLocaleString()} yours</span>
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{hint}</p>}
    </div>
  );
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
