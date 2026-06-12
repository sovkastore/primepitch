interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  color?: "emerald" | "blue" | "red" | "amber";
}

const COLORS = {
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
};

export default function MetricCard({
  title,
  value,
  subtitle,
  trend,
  color = "emerald",
}: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 tracking-wider uppercase">
        {title}
      </p>
      <p className="text-2xl sm:text-3xl font-black text-gray-900 mt-2 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <div className="flex items-center gap-2 mt-2">
        {trend && (
          <span
            className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
              trend.value >= 0 ? COLORS.emerald : COLORS.red
            }`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}%
          </span>
        )}
        {subtitle && (
          <span className="text-[11px] text-gray-400 font-medium">
            {subtitle}
          </span>
        )}
        {!trend && !subtitle && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${COLORS[color]}`}>
            Live
          </span>
        )}
      </div>
    </div>
  );
}
