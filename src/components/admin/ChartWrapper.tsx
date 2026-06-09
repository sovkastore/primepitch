interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function ChartWrapper({
  title,
  children,
  className = "",
}: ChartWrapperProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 p-5 ${className}`}
    >
      <h3 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}
