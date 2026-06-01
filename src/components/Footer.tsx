import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/50 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <span className="text-lg font-extrabold text-white">PULSE</span>
            <span className="text-lg font-extrabold text-emerald-400">SPORTS</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
            <span>About</span>
            <span>Contact</span>
            <span>DMCA</span>
          </div>
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Pulse Sports. All streams are provided by third-party sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
