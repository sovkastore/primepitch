"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

interface StreamSource {
  label: string;
  url: string;
  type: "hls" | "embed";
}

interface ManualMatch {
  id?: string;
  title: string;
  category: string;
  starts_at: string;
  status: "live" | "today" | "tomorrow" | "hidden";
  streams: StreamSource[];
  created_at?: string;
}

const CATEGORIES = [
  "Football", "Basketball", "UFC", "Boxing", "Formula 1", 
  "Tennis", "Cricket", "NFL", "Rugby", "Golf", "Other"
];

export default function AdminSportsLivePage() {
  const [matches, setMatches] = useState<ManualMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMatch, setEditingMatch] = useState<ManualMatch | null>(null);
  
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Football");
  const [startsAt, setStartsAt] = useState("");
  const [status, setStatus] = useState<ManualMatch["status"]>("live");
  const [streams, setStreams] = useState<StreamSource[]>([]);
  
  // New stream form state
  const [newStreamLabel, setNewStreamLabel] = useState("");
  const [newStreamUrl, setNewStreamUrl] = useState("");
  const [newStreamType, setNewStreamType] = useState<"hls" | "embed">("hls");

  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchMatches();
  }, []);

  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(null), 6000);
      return () => clearTimeout(t);
    }
  }, [msg]);

  async function fetchMatches() {
    setLoading(true);
    try {
      const res = await fetch("/api/sports-live");
      const d = await res.json();
      if (d.error) {
        setMsg({ text: "Fetch Error: " + d.error, type: "error" });
      } else {
        setMatches(d.matches || []);
      }
    } catch (e: any) {
      setMsg({ text: "System Error: " + e.message, type: "error" });
    }
    setLoading(false);
  }

  const addStream = () => {
    if (!newStreamLabel || !newStreamUrl) return;
    setStreams(prev => [...prev, { label: newStreamLabel, url: newStreamUrl, type: newStreamType }]);
    setNewStreamLabel("");
    setNewStreamUrl("");
  };

  const removeStream = (idx: number) => {
    setStreams(prev => prev.filter((_, i) => i !== idx));
  };

  const handleEdit = (match: ManualMatch) => {
    setEditingMatch(match);
    setTitle(match.title);
    setCategory(match.category);
    // Convert timestamp to local datetime format for input (YYYY-MM-DDThh:mm)
    const date = new Date(match.starts_at || Date.now());
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
    setStartsAt(localISOTime);
    setStatus(match.status);
    setStreams(match.streams || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingMatch(null);
    setTitle("");
    setCategory("Football");
    setStartsAt("");
    setStatus("live");
    setStreams([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (streams.length === 0) {
      setMsg({ text: "Please add at least one stream source.", type: "error" });
      return;
    }

    setMsg({ text: "Saving match...", type: "info" });
    const utcTime = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();

    const payload = { 
        id: editingMatch?.id,
        title, 
        category, 
        starts_at: utcTime,
        status, 
        streams 
    };

    try {
        const res = await fetch("/api/sports-live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.error) {
            setMsg({ text: "SAVE FAILED: " + result.error, type: "error" });
        } else {
            setMsg({ text: "SUCCESS! Match saved.", type: "success" });
            resetForm();
            fetchMatches();
        }
    } catch (err: any) {
        setMsg({ text: "CRITICAL ERROR: " + err.message, type: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this match?")) return;
    try {
        const res = await fetch(`/api/sports-live?id=${id}`, { method: "DELETE" });
        const result = await res.json();
        if (result.error) setMsg({ text: "Delete Error: " + result.error, type: "error" });
        else {
            setMsg({ text: "Match deleted.", type: "success" });
            fetchMatches();
        }
    } catch (err: any) {
        setMsg({ text: "System Error: " + err.message, type: "error" });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-32">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Manual Streams Manager</h1>
          <p className="text-[12px] text-gray-500 font-bold uppercase tracking-widest mt-1">SPORTS LIVE • ADMIN CONTROL</p>
        </div>
        <div className="flex gap-4">
           <Link href="/sports-live" target="_blank" className="text-xs font-bold text-emerald-600 hover:underline uppercase tracking-widest">Preview Page ↗</Link>
        </div>
      </div>

      {msg && (
        <div className={`mb-6 p-4 rounded-2xl font-bold text-[13px] border shadow-sm ${
          msg.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
          msg.type === "info" ? "bg-blue-50 border-blue-100 text-blue-600" :
          "bg-red-50 border-red-100 text-red-600"
        }`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase mb-2 tracking-widest">Match Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Manchester City vs Arsenal" className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 font-bold text-gray-900 transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase mb-2 tracking-widest">Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold text-gray-900 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                   <label className="block text-[11px] font-black text-gray-400 uppercase mb-2 tracking-widest">Starts At (Local Time)</label>
                   <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 font-bold text-gray-900 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all" />
                 </div>
                 <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase mb-2 tracking-widest">Display Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["live", "today", "tomorrow", "hidden"] as ManualMatch["status"][]).map(s => (
                        <button 
                          key={s} 
                          type="button" 
                          onClick={() => setStatus(s)}
                          className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${status === s ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                 </div>
              </div>

              <div className="pt-4 border-t border-gray-50">
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-4 tracking-widest">Add Stream Source</label>
                <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input value={newStreamLabel} onChange={e => setNewStreamLabel(e.target.value)} placeholder="Label (e.g. Server 1)" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold" />
                    <select value={newStreamType} onChange={e => setNewStreamType(e.target.value as any)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold">
                      <option value="hls">HLS / M3U8</option>
                      <option value="embed">Standard Embed</option>
                    </select>
                    <button type="button" onClick={addStream} className="bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-colors">Add to List</button>
                  </div>
                  <input value={newStreamUrl} onChange={e => setNewStreamUrl(e.target.value)} placeholder="URL (https://...)" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-[12px] font-medium" />
                </div>
              </div>

              {streams.length > 0 && (
                <div className="space-y-2">
                   <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Configured Sources ({streams.length})</label>
                   <div className="divide-y divide-gray-50 bg-white border border-gray-100 rounded-2xl overflow-hidden">
                      {streams.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 group">
                           <div className="flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span className="text-[13px] font-bold text-gray-700">{s.label}</span>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase">{s.type}</span>
                           </div>
                           <button type="button" onClick={() => removeStream(idx)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>
                           </button>
                        </div>
                      ))}
                   </div>
                </div>
              )}

              <div className="pt-4 flex gap-4">
                 <button type="submit" className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 transition-all">
                   {editingMatch ? "Update Match Data" : "Save Manual Match"}
                 </button>
                 {editingMatch && (
                   <button type="button" onClick={resetForm} className="px-6 py-4 bg-gray-100 text-gray-500 rounded-2xl text-[13px] font-black uppercase tracking-widest">Cancel</button>
                 )}
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar / List Column */}
        <div className="space-y-4">
          <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">Currently Managing ({matches.length})</h2>
          {loading ? (
            <div className="p-8 text-center animate-pulse text-gray-300 font-bold">Loading...</div>
          ) : matches.length === 0 ? (
            <div className="p-12 text-center text-gray-300 font-bold border-4 border-dashed border-gray-100 rounded-3xl">No manual matches.<br/>Start by adding one on the left.</div>
          ) : (
            <div className="space-y-3">
               {matches.map(m => (
                 <div key={m.id} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm hover:border-emerald-200 transition-colors group">
                    <div className="flex justify-between items-start mb-3">
                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${
                         m.status === 'live' ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500'
                       }`}>
                         {m.status}
                       </span>
                       <span className="text-[9px] font-black text-gray-300 uppercase">{m.category}</span>
                    </div>
                    <h4 className="text-[16px] font-black text-gray-900 leading-tight mb-2 group-hover:text-emerald-600 transition-colors">{m.title}</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-4">
                      {new Date(m.starts_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex gap-2 pt-3 border-t border-gray-50">
                       <button onClick={() => handleEdit(m)} className="flex-1 py-2 bg-gray-50 rounded-xl text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 hover:text-emerald-600 transition-all transition-colors">Edit</button>
                       <button onClick={() => handleDelete(m.id!)} className="px-3 py-2 bg-red-50 text-red-500 rounded-xl transition-colors hover:bg-red-100">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
                       </button>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
