import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-16 hidden md:block">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
            <span className="text-lg font-extrabold text-gray-900">PRIME</span>
            <span className="text-lg font-extrabold text-gradient">PITCH</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-8 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-900 transition-colors">Home</Link>
            <Link href="/football" className="hover:text-gray-900 transition-colors">Football</Link>
            <span className="hover:text-gray-900 transition-colors cursor-pointer">About</span>
            <span className="hover:text-gray-900 transition-colors cursor-pointer">DMCA</span>
          </div>

          {/* Copyright */}
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} PrimePitch. All streams are provided by third-party sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
