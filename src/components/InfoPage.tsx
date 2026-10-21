import Link from "next/link";
import type { ReactNode } from "react";

// Shared layout for the written pages (About, Privacy, Terms, DMCA): a title,
// an intro, dated sections of plain prose, and a row of links to the sister
// pages so a visitor can move between them without going back to the footer.
export const INFO_LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/dmca", label: "DMCA" },
  { href: "/contact", label: "Contact" },
];

export const CONTACT_EMAIL = "primepitchdmca@gmail.com";
export const LAST_UPDATED = "21 October 2026";

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[15px] font-black text-gray-900">{title}</h2>
      <div className="space-y-2.5 text-[14px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export default function InfoPage({
  title,
  intro,
  current,
  children,
}: {
  title: string;
  intro: string;
  current: string; // href of this page, so it isn't linked to itself
  children: ReactNode;
}) {
  return (
    <div className="max-w-[720px] mx-auto px-4 lg:px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-semibold">Home</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">{title}</h1>
        <p className="text-[14px] leading-relaxed text-gray-600">{intro}</p>
        <p className="text-[12px] font-semibold text-gray-400">Last updated {LAST_UPDATED}</p>
      </header>

      <div className="space-y-7">{children}</div>

      <nav className="pt-6 border-t border-gray-200 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold">
        {INFO_LINKS.filter((l) => l.href !== current).map((l) => (
          <Link key={l.href} href={l.href} className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 decoration-emerald-200">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
