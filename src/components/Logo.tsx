// PrimePitch brand mark + wordmark. The mark is the monogram "P" with a
// play-triangle counter (negative space) on an emerald gradient tile.

const MARK_PATH =
  "M158 112 h156 a120 120 0 0 1 0 240 h-92 v48 h-64 z " +
  "M236 176 c0-13 14-21 25-14 l116 73 c11 6 11 22 0 29 l-116 73 c-11 7-25-1-25-14 z";

export function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="PrimePitch">
      <defs>
        <linearGradient id="ppMarkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="60%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#ppMarkGrad)" />
      <path fill="#ffffff" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

const SIZES = {
  sm: { mark: "w-6 h-6", text: "text-sm" },
  md: { mark: "w-7 h-7", text: "text-lg" },
  lg: { mark: "w-9 h-9", text: "text-xl" },
};

export default function Logo({
  size = "md",
  wordmark = true,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  wordmark?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={`${s.mark} shrink-0`} />
      {wordmark && (
        <span className={`font-extrabold tracking-tight leading-none ${s.text}`}>
          <span className="text-gray-900">PRIME</span>
          <span className="text-gradient">PITCH</span>
        </span>
      )}
    </span>
  );
}
