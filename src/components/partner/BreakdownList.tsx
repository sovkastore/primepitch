interface Row { label: string; total: number; his: number }

export default function BreakdownList({ title, rows, empty, solo }: { title: string; rows: Row[]; empty?: string; solo?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[12px] text-gray-400">{empty || "No data"}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-gray-700 truncate min-w-0">{r.label}</span>
              <span className="tabular-nums shrink-0">
                {solo ? (
                  <span className="font-bold text-gray-900">{r.his.toLocaleString()}</span>
                ) : (
                  <>
                    <span className="font-bold text-gray-900">{r.total.toLocaleString()}</span>
                    <span className="text-[#3cac3b] font-semibold ml-2">{r.his.toLocaleString()}</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
