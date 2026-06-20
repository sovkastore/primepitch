"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { label: "Overview", href: "/partner" },
  { label: "Matches", href: "/partner/matches" },
  { label: "Analytics", href: "/partner/analytics" },
  { label: "Visitors", href: "/partner/visitors" },
  { label: "Pulse", href: "/partner/pulse" },
  { label: "Payouts", href: "/partner/payouts" },
  { label: "Support", href: "/partner/support" },
  { label: "Guide", href: "/partner/guide" },
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
          <span className="ml-2 text-[9px] font-bold text-[#3cac3b] bg-[#3cac3b]/10 px-1.5 py-0.5 rounded">PARTNER</span>
        </div>
        <nav className="p-3 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                isActive(item.href)
                  ? "bg-[#3cac3b]/10 text-[#3cac3b]"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <span>{item.label}</span>
              {item.href === "/partner/support" && notif.supportUnread > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500" aria-label="New reply" />
              )}
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
                    <a href="/partner/payouts" className="text-[12px] font-bold text-red-700 underline mt-1 inline-block">Check your payout details</a>
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
