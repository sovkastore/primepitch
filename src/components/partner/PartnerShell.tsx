"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";

const NAV = [
  { label: "Overview", href: "/partner", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" },
  { label: "Matches", href: "/partner/matches", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Analytics", href: "/partner/analytics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { label: "Visitors", href: "/partner/visitors", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-9a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z" },
  { label: "Pulse", href: "/partner/pulse", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" },
  { label: "Payouts", href: "/partner/payouts", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "History", href: "/partner/history", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { label: "Support", href: "/partner/support", icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" },
  { label: "Guide", href: "/partner/guide", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
];

const money = (n: number) => "$" + (Number(n) || 0).toFixed(2);

type Notif = { failures: { id: string; amount: number; reason: string; at: string }[]; supportUnread: number };

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
  const [notif, setNotif] = useState<Notif>({ failures: [], supportUnread: 0 });
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/partner/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setNotif({ failures: d.failures ?? [], supportUnread: d.supportUnread ?? 0 }); })
      .catch(() => {});
    return () => { active = false; };
  }, [pathname]);

  const activeFailures = notif.failures.filter((f) => !dismissed.includes(f.id));

  const isActive = (href: string) =>
    href === "/partner" ? pathname === "/partner" : pathname.startsWith(href);

  const initial = (name || "P").trim().charAt(0).toUpperCase() || "P";

  async function logout() {
    await fetch("/api/partner/logout", { method: "POST" });
    router.push("/partner/login");
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {open && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-50 flex flex-col transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 shrink-0">
          <Logo size="sm" />
          <span className="text-[9px] font-bold text-[#3cac3b] bg-[#3cac3b]/10 px-1.5 py-0.5 rounded">PARTNER</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold text-gray-300 uppercase tracking-wider">Menu</p>
          <div className="space-y-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                  isActive(item.href)
                    ? "bg-[#3cac3b]/10 text-[#3cac3b]"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span className="flex-1">{item.label}</span>
                {item.href === "/partner/support" && notif.supportUnread > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-500" aria-label="New reply" />
                )}
              </Link>
            ))}
          </div>
        </nav>

        <div className="p-3 border-t border-gray-100 shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <button className="lg:hidden text-gray-500" onClick={() => setOpen(true)} aria-label="Menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5 ml-auto">
            <span className="hidden sm:block text-[13px] font-semibold text-gray-500">
              Signed in as <span className="text-gray-900 font-bold">{name}</span>
            </span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3cac3b] to-[#22c55e] flex items-center justify-center text-white font-black text-[13px] shrink-0">{initial}</div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {activeFailures.length > 0 && (
            <div className="max-w-5xl mx-auto mb-4 space-y-2">
              {activeFailures.map((f) => (
                <div key={f.id} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-3.5">
                  <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-red-700">A payout of {money(f.amount)} couldn’t be sent</p>
                    <p className="text-[12px] text-red-600 mt-0.5">{f.reason}</p>
                    <Link href="/partner/payouts" className="text-[12px] font-bold text-red-700 underline mt-1 inline-block">Check your payout details</Link>
                  </div>
                  <button onClick={() => setDismissed((d) => [...d, f.id])} className="text-red-400 hover:text-red-600 shrink-0" aria-label="Dismiss">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
