"use client";

import { useEffect, useState } from "react";

interface HelpContent {
  hero: { title: string; subtitle: string; tag: string };
  waitBox: { title: string; message: string };
  vpnSteps: { title: string; subtitle: string; steps: string[] };
  vpnLookup: { title: string; subtitle: string };
  visualIssues: {
    title: string;
    subtitle: string;
    cards: { title: string; desc: string; img: string }[];
  };
  whySection: { title: string; text: string };
  quickFixes: {
    title: string;
    list: { title: string; desc: string }[];
  };
  footerTips: { title: string; tips: string[] };
}

const DEFAULT_CONTENT: HelpContent = {
  hero: {
    tag: "STREAMING HELP",
    title: "Can't watch the stream?",
    subtitle: "If a match won't play for you, it's almost always your network or region blocking the video — not PrimePitch. Here's how to fix it in a couple of minutes."
  },
  waitBox: {
    title: "First — did you wait for it to load?",
    message: "Streams can take 30–60 seconds to start, especially on a slower or restricted connection. Stay on the player and don't tap anything while it loads."
  },
  vpnSteps: {
    title: "The reliable fix: use a VPN",
    subtitle: "A VPN makes your connection look like it's coming from another country, so the block no longer applies. It takes about two minutes.",
    steps: [
      "Install a VPN app from your app store (any reputable one works).",
      "Connect to the country we recommend for you — search yours just below.",
      "Come back and fully refresh / reopen the match page.",
      "Press play. If it still won’t start, try another source or a backup country."
    ]
  },
  vpnLookup: {
    title: "Find your VPN country",
    subtitle: "Search your country to see which location to set your VPN to. Try the first one — if it doesn't work, use a backup."
  },
  visualIssues: {
    title: "What you might be seeing",
    subtitle: "Recognise either of these? Your connection is being blocked from the stream — the fix below works.",
    cards: [
      { title: "Stuck on “Loading…”", desc: "The page never finishes loading.", img: "/help-stuck-loading.jpg" },
      { title: "A grey box, no video", desc: "Scores load, but the player can't.", img: "/help-broken-player.jpg" }
    ]
  },
  whySection: {
    title: "Why this happens",
    text: "Some internet providers and countries block the servers that carry the live video. Everything else on PrimePitch still works — which is exactly why you can see the match list and scores, but the video won't play."
  },
  quickFixes: {
    title: "Quick things to try first",
    list: [
      { title: "Try another source", desc: "Tap a different option under “Choose stream”. Each one is a separate server — one may not be blocked." },
      { title: "Refresh fully", desc: "Wait a few seconds, then reload or reopen the match page." },
      { title: "Switch network", desc: "Flip between Wi-Fi and mobile data — one is sometimes less restricted." }
    ]
  },
  footerTips: {
    title: "A few tips for a smooth stream",
    tips: [
      "A paid VPN is usually faster and more reliable than free ones.",
      "After connecting the VPN, always fully refresh or reopen the match page.",
      "These are general recommendations, not guarantees."
    ]
  }
};

export default function AdminHelpPage() {
  const [content, setContent] = useState<HelpContent>(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/help-content")
      .then(r => r.json())
      .then(d => {
        if (d) setContent({ ...DEFAULT_CONTENT, ...d });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/help-content", {
      method: "POST",
      body: JSON.stringify(content)
    });
    if (res.ok) setMsg("Saved successfully!");
    else setMsg("Failed to save.");
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  if (loading) return <div className="p-10 text-center font-bold">Loading Help Editor...</div>;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-12 pb-32">
      <div className="flex items-center justify-between sticky top-0 bg-gray-50/80 backdrop-blur-md py-4 z-10">
        <h1 className="text-2xl font-black text-gray-900 uppercase">Help Page Editor</h1>
        <div className="flex items-center gap-4">
          {msg && <span className="text-emerald-600 font-bold text-sm tracking-widest uppercase">{msg}</span>}
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-emerald-600 shadow-lg shadow-emerald-600/20 text-white rounded-xl font-bold uppercase text-[12px] tracking-widest disabled:opacity-50">
            {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Hero Section */}
        <Section title="Hero Section">
          <Input label="Tag (Small Green Text)" value={content.hero.tag} onChange={v => setContent({...content, hero: {...content.hero, tag: v}})} />
          <Input label="Main Title" value={content.hero.title} onChange={v => setContent({...content, hero: {...content.hero, title: v}})} />
          <Textarea label="Subtitle" value={content.hero.subtitle} onChange={v => setContent({...content, hero: {...content.hero, subtitle: v}})} />
        </Section>

        {/* Wait Alert Box */}
        <Section title="Waiting Alert Box (Amber)">
          <Input label="Title" value={content.waitBox.title} onChange={v => setContent({...content, waitBox: {...content.waitBox, title: v}})} />
          <Textarea label="Message" value={content.waitBox.message} onChange={v => setContent({...content, waitBox: {...content.waitBox, message: v}})} />
        </Section>

        {/* VPN Steps */}
        <Section title="VPN Implementation Steps">
          <Input label="Title" value={content.vpnSteps.title} onChange={v => setContent({...content, vpnSteps: {...content.vpnSteps, title: v}})} />
          <Textarea label="Subtitle" value={content.vpnSteps.subtitle} onChange={v => setContent({...content, vpnSteps: {...content.vpnSteps, subtitle: v}})} />
          <ListManager label="Steps List" items={content.vpnSteps.steps} onChange={v => setContent({...content, vpnSteps: {...content.vpnSteps, steps: v}})} />
        </Section>

        {/* Why Happens */}
        <Section title="Why This Happens">
          <Input label="Title" value={content.whySection.title} onChange={v => setContent({...content, whySection: {...content.whySection, title: v}})} />
          <Textarea label="Main Text" value={content.whySection.text} onChange={v => setContent({...content, whySection: {...content.whySection, text: v}})} />
        </Section>

        {/* Footer Tips */}
        <Section title="Footer Tips / Recommendations">
          <Input label="Title" value={content.footerTips.title} onChange={v => setContent({...content, footerTips: {...content.footerTips, title: v}})} />
          <ListManager label="Tips List" items={content.footerTips.tips} onChange={v => setContent({...content, footerTips: {...content.footerTips, tips: v}})} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-6">
      <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">{title}</h3>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-black text-gray-500 uppercase ml-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm text-gray-900 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none" />
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-black text-gray-500 uppercase ml-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm text-gray-900 h-24 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none" />
    </div>
  );
}

function ListManager({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-black text-gray-500 uppercase ml-1">{label}</label>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input value={it} onChange={e => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }} className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl font-bold text-[13px]" />
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:text-red-600">✕</button>
          </div>
        ))}
        <button onClick={() => onChange([...items, ""])} className="text-[10px] font-black text-emerald-600 hover:underline uppercase tracking-widest pl-1">+ Add New Item</button>
      </div>
    </div>
  );
}
