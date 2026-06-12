import Link from "next/link";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-16 hidden md:block">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Logo size="md" />

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
