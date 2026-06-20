"use client";

// Today / Yesterday quick buttons + a calendar, matching the main admin.
// allowAll adds an "All time" option (used on Matches). "" = all time.
export default function DayPicker({
  date, onChange, allowAll,
}: {
  date: string; onChange: (d: string) => void; allowAll?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const btn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${active ? "bg-[#3cac3b] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`;
  const customActive = !!date && date !== today && date !== yesterday;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {allowAll && <button onClick={() => onChange("")} className={btn(date === "")}>All time</button>}
      <button onClick={() => onChange(today)} className={btn(date === today)}>Today</button>
      <button onClick={() => onChange(yesterday)} className={btn(date === yesterday)}>Yesterday</button>
      <input type="date" value={date || today} max={today} onChange={(e) => onChange(e.target.value)}
        className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold ${customActive ? "border-[#3cac3b] ring-1 ring-[#3cac3b]/30 text-[#2e8e2d]" : "border-gray-200 text-gray-600"}`} />
    </div>
  );
}
