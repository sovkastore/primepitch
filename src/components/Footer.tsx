import Link from "next/link";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/football", label: "Football" },
  { href: "/alt", label: "Alt" },
  { href: "/help", label: "Help" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/dmca", label: "DMCA" },
];

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50 mt-16 hidden md:block">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Logo size="md" />

          {/* Links — every one leads to a real page */}
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-gray-900 transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Copyright */}
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} PrimePitch. All streams are provided by third-party sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
