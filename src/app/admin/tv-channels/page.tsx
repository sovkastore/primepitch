"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Channel {
  id?: string;
  name: string;
  category: string;
  logo_url: string;
  channel_id: number | null;
  embed_url: string;
  is_active: boolean;
  display_order: number;
}

interface Config {
  page_title: string;
  meta_description: string;
  banner_json: { enabled?: boolean; text?: string; link?: string; style?: string };
  notification_json: { enabled?: boolean; message?: string; type?: string };
}

export default function AdminTVChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [config, setConfig] = useState<Config>({
    page_title: "Live TV Channels",
    meta_description: "",
    banner_json: {},
    notification_json: {}
  });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Sports");
  const [logoUrl, setLogoUrl] = useState("");
  const [channelId, setChannelId] = useState<string>("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(null), 5000);
      return () => clearTimeout(t);
    }
  }, [msg]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cRes, cfgRes] = await Promise.all([
        fetch("/api/tv-channels"),
        fetch("/api/tv-channels/config")
      ]);
      const cData = await cRes.json();
      const cfgData = await cfgRes.json();
      setChannels(cData.channels || []);
      if (cfgData) setConfig(cfgData);
    } catch {
      setMsg({ text: "Failed to load data", type: "error" });
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCategory("Sports");
    setLogoUrl("");
    setChannelId("");
    setEmbedUrl("");
    setIsActive(true);
    setDisplayOrder(0);
  };

  const handleEdit = (ch: Channel) => {
    setEditingId(ch.id!);
    setName(ch.name);
    setCategory(ch.category);
    setLogoUrl(ch.logo_url);
    setChannelId(ch.channel_id?.toString() || "");
    setEmbedUrl(ch.embed_url);
    setIsActive(ch.is_active);
    setDisplayOrder(ch.display_order);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ text: "Saving...", type: "info" });
    const payload = {
      id: editingId,
      name,
      category,
      logo_url: logoUrl,
      channel_id: channelId ? parseInt(channelId) : null,
      embed_url: embedUrl,
      is_active: isActive,
      display_order: displayOrder
    };

    const res = await fetch("/api/tv-channels", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      setMsg({ text: "Channel saved successfully", type: "success" });
      resetForm();
      fetchData();
    } else {
      setMsg({ text: "Failed to save channel", type: "error" });
    }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    const res = await fetch(`/api/tv-channels?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMsg({ text: "Channel deleted", type: "success" });
      fetchData();
    }
  };

  const saveConfig = async () => {
    const res = await fetch("/api/tv-channels/config", {
      method: "POST",
      body: JSON.stringify(config)
    });
    if (res.ok) setMsg({ text: "Configuration saved", type: "success" });
  };

  if (loading) return <div className="p-12 text-center font-bold">Loading TV Dashboard...</div>;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-12 pb-32">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter italic">Live TV Admin</h1>
        <Link href="/tv-channels" target="_blank" className="text-sm font-bold text-blue-600 hover:underline">View Live Page ↗</Link>
      </div>

      {msg && (
        <div className={`p-4 rounded-2xl font-bold text-sm border shadow-sm ${
          msg.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
          msg.type === "info" ? "bg-blue-50 border-blue-100 text-blue-600" : "bg-red-50 border-red-100 text-red-600"
        }`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden p-6">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Channel Editor</h2>
            <form onSubmit={saveChannel} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Channel Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} required placeholder="Sky Sports Premier League" className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Category</label>
                  <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Sports" className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Logo URL (Icon)</label>
                  <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold" />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Internal Stream ID (Optional)</label>
                  <input type="number" value={channelId} onChange={e => setChannelId(e.target.value)} placeholder="2" className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Direct Embed URL (Optional)</label>
                  <input value={embedUrl} onChange={e => setEmbedUrl(e.target.value)} placeholder="https://..." className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <button type="submit" className="w-full py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                    {editingId ? "Update" : "Add"}
                  </button>
                  <button type="button" onClick={resetForm} className="w-full py-3 bg-gray-100 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="space-y-3">
             <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Registered Channels ({channels.length})</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               {channels.map(ch => (
                 <div key={ch.id} className="bg-white border border-gray-100 p-4 rounded-3xl flex items-center justify-between group hover:border-gray-300 transition-all">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden border border-gray-50">
                        {ch.logo_url ? <img src={ch.logo_url} className="w-full h-full object-contain" alt="" /> : <span className="text-xl">📺</span>}
                     </div>
                     <div>
                       <h4 className="text-sm font-black text-gray-900 leading-none mb-1">{ch.name}</h4>
                       <span className="text-[10px] font-bold text-gray-400 uppercase">{ch.category} • ID: {ch.channel_id || 'URL'}</span>
                     </div>
                   </div>
                   <div className="flex gap-2">
                     <button onClick={() => handleEdit(ch)} className="p-2 bg-gray-50 rounded-xl text-gray-400 hover:text-blue-600 transition-colors">Edit</button>
                     <button onClick={() => deleteChannel(ch.id!)} className="p-2 bg-red-50 rounded-xl text-red-400 hover:text-red-600 transition-colors">Del</button>
                   </div>
                 </div>
               ))}
             </div>
          </section>
        </div>

        <div className="space-y-8">
           <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
              <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Page Settings</h2>
              
              <div className="space-y-4">
                 <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Page Title</label>
                    <input value={config.page_title} onChange={e => setConfig({...config, page_title: e.target.value})} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold" />
                 </div>
                 
                 <div className="border-t border-gray-50 pt-4">
                    <label className="flex items-center gap-2 mb-3">
                       <input type="checkbox" checked={config.banner_json?.enabled} onChange={e => setConfig({...config, banner_json: {...config.banner_json, enabled: e.target.checked}})} className="w-4 h-4 rounded accent-blue-600" />
                       <span className="text-[11px] font-black uppercase text-gray-900">Show Banner</span>
                    </label>
                    <textarea value={config.banner_json?.text} onChange={e => setConfig({...config, banner_json: {...config.banner_json, text: e.target.value}})} placeholder="Banner text..." className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold h-20" />
                 </div>

                 <div className="border-t border-gray-50 pt-4">
                    <label className="flex items-center gap-2 mb-3">
                       <input type="checkbox" checked={config.notification_json?.enabled} onChange={e => setConfig({...config, notification_json: {...config.notification_json, enabled: e.target.checked}})} className="w-4 h-4 rounded accent-blue-600" />
                       <span className="text-[11px] font-black uppercase text-gray-900">Show Notification</span>
                    </label>
                    <textarea value={config.notification_json?.message} onChange={e => setConfig({...config, notification_json: {...config.notification_json, message: e.target.value}})} placeholder="Notification message..." className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold h-20" />
                 </div>

                 <button onClick={saveConfig} className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all">
                    Save Page Config
                 </button>
              </div>
           </section>
        </div>
      </div>
    </div>
  );
}
