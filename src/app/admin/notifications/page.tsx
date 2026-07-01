"use client";

import { useState, useEffect } from "react";

type Variant = "info" | "success" | "warning";
type Announcement = {
  enabled: boolean;
  message: string;
  linkUrl: string;
  linkLabel: string;
  variant: Variant;
  reshowHours: number;
};

const DEFAULTS_ANNOUNCE: Announcement = {
  enabled: false,
  message: "",
  linkUrl: "",
  linkLabel: "",
  variant: "info",
  reshowHours: 0,
};

type PageNotification = { enabled: boolean; title: string; text: string; };
type PromoBannerConfig = { enabled: boolean; link: string; imagePath: string; };

const RESHOW_OPTIONS = [
  { value: 0, label: "Don't show again (until I change the message)" },
  { value: 1, label: "After 1 hour" },
  { value: 3, label: "After 3 hours" },
  { value: 6, label: "After 6 hours" },
  { value: 24, label: "After 24 hours" },
];

const VARIANT_LABELS: Record<Variant, string> = {
  info: "Info (blue)",
  success: "Success (green)",
  warning: "Attention (amber)",
};

const VARIANT_PREVIEW: Record<Variant, string> = {
  info: "bg-blue-600 text-white",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-500 text-black",
};

export default function NotificationsPage() {
  const [announce, setAnnounce] = useState<Announcement>(DEFAULTS_ANNOUNCE);
  const [adsCfg, setAdsCfg] = useState<any>(null); // We only care about .notifications and .promoBanner
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);

  const toggleOpen = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [msg]);

  async function uploadBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMsg("Please upload an image file.");
      return;
    }

    setUploading(true);
    setMsg("Uploading image...");

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const base64 = await base64Promise;
      const res = await fetch("/api/admin/upload-banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });

      const data = await res.json();
      if (data.ok) {
        setAdsCfg((p: any) => ({
          ...p,
          promoBanner: { ...p.promoBanner, imagePath: data.url }
        }));
        setMsg("Banner uploaded successfully!");
      } else {
        setMsg(data.error || "Upload failed.");
      }
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setUploading(false);
      // Reset input value to allow re-uploading same file
      e.target.value = "";
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/announcement", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/admin/ads-config", { cache: "no-store" }).then(r => r.json())
    ]).then(([announceData, adsData]) => {
      setAnnounce({ ...DEFAULTS_ANNOUNCE, ...announceData });
      setDismissCount(Number(announceData?.dismissCount) || 0);
      setAdsCfg(adsData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function updateAnnounce(patch: Partial<Announcement>) {
    setAnnounce((p) => ({ ...p, ...patch }));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      // Save top announcement
      await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(announce),
      });

      // Save ads config (banners)
      if (adsCfg) {
        await fetch("/api/admin/ads-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adsCfg),
        });
      }

      setMsg("Saved.");
    } catch {
      setMsg("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function headerRow(id: string, title: string, desc: string, enabled: boolean, toggle: () => void) {
    const isOpen = !!open[id];
    return (
      <div className={`p-5 transition-colors ${isOpen ? "bg-gray-50/50" : "bg-white hover:bg-gray-50/30"}`}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleOpen(id)}>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>
            </div>
            <p className="text-[12px] text-gray-500 mt-1">{desc}</p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            className={`relative w-[42px] h-[24px] rounded-full transition-colors shrink-0 ${enabled ? "bg-emerald-500" : "bg-gray-200"}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? "left-[24px]" : "left-1"}`} />
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8">
      {/* Top Bar Announcement */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Top Bar Announcement</h1>
          <p className="text-[13px] text-gray-600 mt-1">
            Show a message bar across the top of the site. Turn it off when you&rsquo;re done.
          </p>
        </div>

        <div className={`rounded-2xl border p-5 space-y-3 ${announce.enabled ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-gray-900">Show the banner</span>
              <p className="text-[13px] text-gray-600 mt-0.5">
                {announce.enabled ? "The banner is LIVE on the site." : "The banner is hidden."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateAnnounce({ enabled: !announce.enabled })}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${announce.enabled ? "bg-emerald-500" : "bg-gray-300"}`}
              aria-label="Toggle banner"
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${announce.enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Message</label>
            <textarea
              value={announce.message}
              onChange={(e) => updateAnnounce({ message: e.target.value })}
              rows={3}
              maxLength={500}
              placeholder="e.g. Welcome! Add us to your home screen to get live goal alerts."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">Link (optional)</label>
              <input
                value={announce.linkUrl}
                onChange={(e) => updateAnnounce({ linkUrl: e.target.value })}
                placeholder="/subscribe  or  https://…"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-800">Link text</label>
              <input
                value={announce.linkLabel}
                onChange={(e) => updateAnnounce({ linkLabel: e.target.value })}
                maxLength={60}
                placeholder="Learn more"
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Color</label>
            <select
              value={announce.variant}
              onChange={(e) => updateAnnounce({ variant: e.target.value as Variant })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
                <option key={v} value={v}>{VARIANT_LABELS[v]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-800">Show again after dismiss</label>
            <select
              value={announce.reshowHours}
              onChange={(e) => updateAnnounce({ reshowHours: Number(e.target.value) })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              {RESHOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Embedded Ads Config Banners */}
      {adsCfg && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Watch & Home Banners</h1>
            <p className="text-[13px] text-gray-600 mt-1">
              Inline promotional banners and stream waiting notifications.
            </p>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100 mb-8">
            {/* Promo Banner */}
            <div className="space-y-0">
              {headerRow(
                "promo_banner",
                 "Promo Banner (Home Page)",
                 "Displays an inline image banner on the home page",
                 !!adsCfg.promoBanner?.enabled,
                 () => setAdsCfg((p: any) => ({
                   ...p,
                   promoBanner: { ...p.promoBanner, enabled: !p.promoBanner?.enabled }
                 }))
              )}
              {open["promo_banner"] && (
                <div className="px-5 pb-5 pt-1 space-y-4 bg-gray-50/50">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Destination URL or Phone Link</label>
                    <input
                      type="text"
                      value={adsCfg.promoBanner?.link || ""}
                      onChange={(e) => setAdsCfg((p: any) => ({
                        ...p, promoBanner: { ...p.promoBanner, link: e.target.value }
                      }))}
                      placeholder="e.g. https://wa.me/1234567890"
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">WhatsApp Pre-filled Message (optional)</label>
                    <textarea
                      value={adsCfg.promoBanner?.whatsappMessage || ""}
                      onChange={(e) => setAdsCfg((p: any) => ({
                        ...p, promoBanner: { ...p.promoBanner, whatsappMessage: e.target.value }
                      }))}
                      rows={3}
                      placeholder="Type your message here..."
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <p className="text-[11px] text-gray-500">If the Destination URL is a wa.me link, this text will automatically be prepared for the user to send.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Banner Image</label>
                    <div className="flex flex-col gap-3">
                      {adsCfg.promoBanner?.imagePath && (
                        <div className="relative w-full aspect-[4/1] bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={adsCfg.promoBanner.imagePath} 
                            alt="Current Banner"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={adsCfg.promoBanner?.imagePath || ""}
                          onChange={(e) => setAdsCfg((p: any) => ({
                            ...p, promoBanner: { ...p.promoBanner, imagePath: e.target.value }
                          }))}
                          placeholder="Image URL or path..."
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                        <label className={`cursor-pointer px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                          {uploading ? 'Uploading...' : 'Replace Image'}
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={uploadBanner}
                            disabled={uploading}
                          />
                        </label>
                      </div>
                      <p className="text-[10px] text-gray-400 italic">You can paste a URL or upload a new image directly.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Wait Banner */}
            <div className="space-y-0">
              {headerRow(
                "notif_wait",
                 adsCfg.notifications?.wait_banner?.title || "Wait Banner",
                 "Tells users to wait for the stream to load",
                 !!adsCfg.notifications?.wait_banner?.enabled,
                 () => setAdsCfg((p: any) => ({
                   ...p, notifications: {
                     ...p.notifications, wait_banner: { ...p.notifications?.wait_banner, enabled: !p.notifications?.wait_banner?.enabled }
                   }
                 }))
              )}
              {open["notif_wait"] && (
                <div className="px-5 pb-5 pt-1 space-y-4 bg-gray-50/50">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Banner Headline</label>
                    <input
                      type="text"
                      value={adsCfg.notifications?.wait_banner?.title || ""}
                      onChange={(e) => setAdsCfg((p: any) => ({
                        ...p, notifications: {
                          ...p.notifications, wait_banner: { ...p.notifications?.wait_banner, title: e.target.value }
                        }
                      }))}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Message Text</label>
                    <textarea
                      value={adsCfg.notifications?.wait_banner?.text || ""}
                      rows={3}
                      onChange={(e) => setAdsCfg((p: any) => ({
                        ...p, notifications: {
                          ...p.notifications, wait_banner: { ...p.notifications?.wait_banner, text: e.target.value }
                        }
                      }))}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-sans"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Tap Warning Overlay */}
            <div className="space-y-0">
              {headerRow(
                "notif_tap",
                 adsCfg.notifications?.tap_warning?.title || "Player Loading Warning",
                 "Text shown on top of the black player while loading",
                 !!adsCfg.notifications?.tap_warning?.enabled,
                 () => setAdsCfg((p: any) => ({
                   ...p, notifications: {
                     ...p.notifications, tap_warning: { ...p.notifications?.tap_warning, enabled: !p.notifications?.tap_warning?.enabled }
                   }
                 }))
              )}
              {open["notif_tap"] && (
                <div className="px-5 pb-5 pt-1 space-y-4 bg-gray-50/50">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-800">Headline Text</label>
                    <input
                      type="text"
                      value={adsCfg.notifications?.tap_warning?.title || ""}
                      onChange={(e) => setAdsCfg((p: any) => ({
                        ...p, notifications: {
                          ...p.notifications, tap_warning: { ...p.notifications?.tap_warning, title: e.target.value }
                        }
                      }))}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-6 py-3 rounded-xl bg-gray-900 hover:bg-black text-white text-[13px] font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? "Saving Changes…" : "Save All Changes"}
        </button>
        {msg && <span className="text-[13px] font-medium text-emerald-600">{msg}</span>}
      </div>
    </div>
  );
}
