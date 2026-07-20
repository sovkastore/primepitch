import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getD1 } from "@/lib/d1";
import ApplyForm from "./ApplyForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner Program",
  description: "Bring your football audience to PrimePitch and earn from every viewer. Free live streams, World Cup 2026, twice-monthly cryptocurrency payouts.",
};

async function programOpen(): Promise<boolean> {
  try {
    const d1 = await getD1();
    if (!d1) return false;
    const row = await d1.prepare("SELECT value FROM d1_site_settings WHERE key = ?").bind("partner_public_page").first<{ value: string }>();
    return row?.value === "true" || row?.value === "1";
  } catch {
    return false;
  }
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-6">
      <div className="w-9 h-9 rounded-full bg-[#3cac3b] text-white flex items-center justify-center text-[15px] font-black">{n}</div>
      <h3 className="mt-4 text-[17px] font-black text-gray-900">{title}</h3>
      <p className="mt-1.5 text-[14px] text-gray-500 leading-relaxed">{body}</p>
    </div>
  );
}

export default async function PartnerProgramPage() {
  if (!(await programOpen())) notFound();

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#3cac3b]/10 to-white" />
        <div className="relative max-w-[1100px] mx-auto px-4 lg:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16 text-center">
          <span className="inline-block text-[12px] font-black tracking-[0.2em] text-[#3cac3b] uppercase">PrimePitch Partners</span>
          <h1 className="mt-4 text-[34px] sm:text-[52px] leading-[1.05] font-black text-gray-900">
            Bring the match.<br />Earn from every viewer.
          </h1>
          <p className="mt-5 text-[16px] sm:text-[18px] text-gray-600 max-w-2xl mx-auto leading-relaxed">
            You already have an audience that loves football. Send them to PrimePitch for free live streams — and get paid for the people who watch.
          </p>
          <a href="#apply" className="mt-8 inline-block px-7 py-3.5 rounded-xl bg-[#3cac3b] text-white text-[15px] font-bold hover:bg-[#2e8e2d] transition-colors">
            Apply to join
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-[1100px] mx-auto px-4 lg:px-6 py-12 sm:py-16">
        <h2 className="text-center text-[26px] sm:text-[32px] font-black text-gray-900">How it works</h2>
        <p className="mt-2 text-center text-[15px] text-gray-500">Three steps. No tech needed.</p>
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <Step n="1" title="Get your link" body="We set you up with a personal link and your own dashboard — in minutes." />
          <Step n="2" title="Share the match" body="Drop your link wherever your people are — Telegram, YouTube, TikTok, group chats." />
          <Step n="3" title="Earn as they watch" body="Everyone who watches through your link earns you money, tracked live in your dashboard." />
        </div>
      </section>

      {/* Scale framing — no numbers/percentages, viewer tiers only */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-14 sm:py-20 text-center">
          <h2 className="text-[26px] sm:text-[34px] font-black">The more eyes, the more you earn</h2>
          <p className="mt-5 text-[16px] sm:text-[18px] text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Around a hundred people watching a match? You’re earning. Get five hundred tuned in and it climbs.
            Break a thousand and it climbs again. Stack a full weekend of fixtures and an engaged audience adds up fast.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-3 max-w-xl mx-auto">
            {[
              { k: "~100", v: "watching → earning" },
              { k: "~500", v: "watching → more" },
              { k: "1,000+", v: "watching → even more" },
            ].map((t) => (
              <div key={t.k} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-[22px] sm:text-[26px] font-black">{t.k}</p>
                <p className="mt-1 text-[12px] text-gray-400 leading-snug">{t.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it converts + what you get */}
      <section className="max-w-[1100px] mx-auto px-4 lg:px-6 py-12 sm:py-16 grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-[22px] sm:text-[26px] font-black text-gray-900">Why your audience stays</h2>
          <ul className="mt-5 space-y-3">
            {[
              "Free, every match — FIFA World Cup 2026 and beyond.",
              "Fast streams, no sign-up to watch.",
              "Works on any phone or laptop.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px] text-gray-700">
                <span className="mt-1 text-[#3cac3b] font-black">✓</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[22px] sm:text-[26px] font-black text-gray-900">What you get</h2>
          <ul className="mt-5 space-y-3">
            {[
              "Your own live dashboard.",
              "A real-time view of who’s watching.",
              "Twice-monthly payouts in cryptocurrency.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px] text-gray-700">
                <span className="mt-1 text-[#3cac3b] font-black">✓</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Apply */}
      <section id="apply" className="max-w-[760px] mx-auto px-4 lg:px-6 pb-20 scroll-mt-20">
        <ApplyForm />
      </section>
    </div>
  );
}
