"use client";

import { PRESETS, type Preset } from "@/components/partner/rangePresets";

export default function RangePicker({
  preset, dateStr, onPreset, onDate,
}: {
  preset: Preset; dateStr: string; onPreset: (p: Preset) => void; onDate: (d: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const btn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${active ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {PRESETS.map((p) => (
        <button key={p.key} onClick={() => onPreset(p.key)} className={btn(preset === p.key)}>{p.label}</button>
      ))}
      <input type="date" value={dateStr} max={today} onChange={(e) => onDate(e.target.value)}
        className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold ${preset === "date" ? "border-blue-600 ring-1 ring-blue-200 text-blue-700" : "border-gray-200 text-gray-600"}`} />
    </div>
  );
}
