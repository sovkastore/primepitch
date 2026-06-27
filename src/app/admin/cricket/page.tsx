"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js"; // Using basic client for admin
import Link from "next/link";

// Shared Channel list for the Admin toggles
const MASTER_CHANNELS = [
  { name: "Sky Sports Cricket", id: 2 },
  { name: "Willow Cricket", id: 29 },
  { name: "Star Sports 1", id: 25 },
  { name: "Star Sports 1 Hindi", id: 26 },
  { name: "Sky Sports Main Event", id: 1 },
  { name: "Sky Sports Action", id: 3 },
  { name: "TNT Sports 1", id: 12 },
  { name: "TNT Sports 2", id: 13 },
  { name: "TNT Sports 3", id: 14 },
  { name: "TNT Sports 4", id: 22 },
];

interface CricketMatch {
  id?: string;
  title: string;
  competition: string;
  time: string;
  status: "live" | "today" | "tomorrow" | "hidden";
  channel_ids: number[];
  created_at?: string;
}

export default function AdminCricketPage() {
  const [matches, setMatches] = useState<CricketMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMatch, setEditingMatch] = useState<CricketMatch | null>(null);
  
  // Form State
  const [title, setTitle] = useState("");
  const [competition, setCompetition] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<CricketMatch["status"]>("live");
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);

  // Initialize Supabase (assuming env vars exist)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchMatches();
  }, []);

  async function fetchMatches() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cricket_streams")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setMatches(data);
    setLoading(false);
  }

  const toggleChannel = (id: number) => {
    setSelectedChannels(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleEdit = (match: CricketMatch) => {
    setEditingMatch(match);
    setTitle(match.title);
    setCompetition(match.competition);
    setTime(match.time);
    setStatus(match.status);
    setSelectedChannels(match.channel_ids);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingMatch(null);
    setTitle("");
    setCompetition("");
    setTime("");
    setStatus("live");
    setSelectedChannels([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { title, competition, time, status, channel_ids: selectedChannels };

    if (editingMatch?.id) {
      const { error } = await supabase.from("cricket_streams").update(payload).eq("id", editingMatch.id);
      if (error) alert("Error updating: " + error.message);
    } else {
      const { error } = await supabase.from("cricket_streams").insert([payload]);
      if (error) alert("Error inserting: " + error.message);
    }

    resetForm();
    fetchMatches();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this match?")) return;
    await supabase.from("cricket_streams").delete().eq("id", id);
    fetchMatches();
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-32">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Cricket Stream Manager</h1>
        <Link href="/cricket" target="_blank" className="text-xs font-bold text-emerald-600 hover:underline">View Live Page ↗</Link>
      </div>

      {/* MATCH FORM */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-12">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">
          {editingMatch ? "Edit Match" : "Add New Match"}
        </h2>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Match Title (e.g. India vs Pak)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold" />
            </div>
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Competition (e.g. IPL T20)</label>
              <input value={competition} onChange={e => setCompetition(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Time / LIVE</label>
                <input value={time} onChange={e => setTime(e.target.value)} required placeholder="e.g. 15:30 or LIVE" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold" />
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Page Visibility</label>
                <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold">
                  <option value="live">Live Now</option>
                  <option value="today">Today Section</option>
                  <option value="tomorrow">Tomorrow Section</option>
                  <option value="hidden">Hidden from Site</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Assign Channels (Check all that apply)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-2 border border-gray-50 rounded-xl bg-gray-50/50">
              {MASTER_CHANNELS.map(ch => (
                <label key={ch.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100 cursor-pointer hover:border-emerald-500 transition-colors">
                  <input type="checkbox" checked={selectedChannels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="w-4 h-4 accent-emerald-500" />
                  <span className="text-[11px] font-bold text-gray-700">{ch.name}</span>
                </label>
              ))}
            </div>
            <div className="pt-4 flex gap-3">
              <button type="submit" className="flex-1 btn-gradient py-3 rounded-xl text-white text-[12px] font-black tracking-widest uppercase shadow-lg shadow-emerald-500/20">
                {editingMatch ? "Update Match" : "Create Match"}
              </button>
              {editingMatch && <button type="button" onClick={resetForm} className="px-6 py-3 bg-gray-100 rounded-xl text-[12px] font-bold text-gray-400">Cancel</button>}
            </div>
          </div>
        </form>
      </div>

      {/* MATCH LIST */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Manage Existing Matches ({matches.length})</h2>
        {loading ? (
          <div className="py-20 text-center text-gray-400 font-bold animate-pulse">Loading matches...</div>
        ) : matches.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group">
            <div className="flex items-center gap-4">
               <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${m.status === 'live' ? 'bg-red-50' : 'bg-gray-50'}`}>
                 {m.status === 'live' ? "🔴" : "⏳"}
               </div>
               <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 rounded uppercase tracking-tighter text-gray-500">{m.status}</span>
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{m.competition}</span>
                  </div>
                  <h4 className="text-[15px] font-black text-gray-900">{m.title}</h4>
                  <p className="text-[11px] text-gray-400 font-medium">Kickoff: {m.time} • {m.channel_ids.length} Channels linked</p>
               </div>
            </div>
            <div className="flex items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(m)} className="px-4 py-2 bg-emerald-50 rounded-lg text-emerald-600 text-[11px] font-bold hover:bg-emerald-100">Edit</button>
              <button onClick={() => handleDelete(m.id!)} className="px-4 py-2 bg-red-50 rounded-lg text-red-600 text-[11px] font-bold hover:bg-red-100">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
