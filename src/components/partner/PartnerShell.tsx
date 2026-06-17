"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { label: "Overview", href: "/partner" },
  { label: "Matches", href: "/partner/matches" },
  { label: "Analytics", href: "/partner/analytics" },
  { label: "Visitors", href: "/partner/visitors" },
  { label: "Pulse", href: "/partner/pulse" },
  { label: "Guide", href: "/partner/guide" },
];

export default function PartnerShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/partner" ? pathname === "/partner" : pathname.startsWith(href);

  async function logout() {
    await fetch("/api/partner/logout", { method: "POST" });
    router.push("/partner/login");
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-50 transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-14 flex items-center px-5 border-b border-gray-100">
          <span className="font-black text-gray-900 tracking-tight">PrimePitch</span>
          <span className="ml-2 text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">PARTNER</span>
        </div>
        <nav className="p-3 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                isActive(item.href)
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
          <button className="lg:hidden text-gray-500" onClick={() => setOpen(true)} aria-label="Menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-[13px] font-semibold text-gray-500">
            Signed in as <span className="text-gray-900 font-bold">{name}</span>
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
