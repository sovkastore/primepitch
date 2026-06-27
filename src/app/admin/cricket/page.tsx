"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

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
  const [customId, setCustomId] = useState(""); // NEW: Custom ID support

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

  const addCustomId = () => {
    const id = parseInt(customId);
    if (!isNaN(id) && !selectedChannels.includes(id)) {
      setSelectedChannels(prev => [...prev, id]);
      setCustomId("");
    }
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
    setCustomId("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { title, competition, time, status, channel_ids: selectedChannels };
    if (editingMatch?.id) {
      await supabase.from("cricket_streams").update(payload).eq("id", editingMatch.id);
    } else {
      await supabase.from("cricket_streams").insert([payload]);
    }
    resetForm();
    fetchMatches();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    await supabase.from("cricket_streams").delete().eq("id", id);
    fetchMatches();
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-32">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Cricket Stream Manager</h1>
        <div className="flex gap-4">
           <Link href="/admin" className="text-xs font-bold text-gray-400 hover:text-gray-900 uppercase tracking-widest">Dashboard</Link>
           <Link href="/cricket" target="_blank" className="text-xs font-bold text-emerald-600 hover:underline uppercase tracking-widest">View Live ↗</Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-12">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">{editingMatch ? "Edit Match" : "Add New Match"}</h2>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Match Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. England vs New Zealand" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-emerald-500/20 font-bold" />
            </div>
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Competition</label>
              <input value={competition} onChange={e => setCompetition(e.target.value)} required placeholder="e.g. International Cricket" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-emerald-500/20 font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Time / Status</label>
                <input value={time} onChange={e => setTime(e.target.value)} required placeholder="15:30 or LIVE" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 font-bold" />
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Visibility</label>
                <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 font-bold">
                  <option value="live">Live Now</option>
                  <option value="today">Today</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Channels (Already Linked: {selectedChannels.length})</label>
            <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-2 border border-gray-50 rounded-xl bg-gray-50/50">
              {MASTER_CHANNELS.map(ch => (
                <label key={ch.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${selectedChannels.includes(ch.id) ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
                  <input type="checkbox" checked={selectedChannels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="w-4 h-4 accent-emerald-500" />
                  <span className={`text-[10px] font-bold ${selectedChannels.includes(ch.id) ? 'text-emerald-700' : 'text-gray-600'}`}>{ch.name}</span>
                </label>
              ))}
            </div>

            {/* CUSTOM ID ADDER */}
            <div className="mt-4 flex gap-2">
              <input type="number" value={customId} onChange={e => setCustomId(e.target.value)} placeholder="Add Custom ID (e.g. 150)" className="flex-1 px-4 py-2 rounded-xl border border-gray-100 bg-gray-50 text-[11px] font-bold" />
              <button type="button" onClick={addCustomId} className="px-4 py-2 bg-gray-900 text-white text-[10px] font-black rounded-xl uppercase">Add ID</button>
            </div>

            <div className="pt-4 flex gap-3">
              <button type="submit" className="flex-1 btn-gradient py-3 rounded-xl text-white text-[12px] font-black tracking-widest uppercase">Save Match</button>
              {editingMatch && <button type="button" onClick={resetForm} className="px-6 py-3 bg-gray-100 rounded-xl text-[12px] font-bold text-gray-400">Cancel</button>}
            </div>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Current Matches</h2>
        {loading ? (
          <div className="py-20 text-center text-gray-400 font-bold">Loading...</div>
        ) : matches.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group transition-shadow hover:shadow-sm">
            <div className="flex items-center gap-4">
               <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${m.status === 'live' ? 'bg-red-50' : 'bg-emerald-50'}`}>
                 {m.status === 'live' ? "🔴" : "🏏"}
               </div>
               <div>
                  <h4 className="text-[16px] font-black text-gray-900 leading-none mb-1.5">{m.title}</h4>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${m.status === 'live' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{m.status}</span>
                    <span className="text-[10px] text-gray-400 font-bold">{m.competition} • {m.time}</span>
                  </div>
               </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-400 mr-4">{m.channel_ids.length} Channels</span>
              <button onClick={() => handleEdit(m)} className="px-4 py-2 bg-emerald-50 rounded-lg text-emerald-600 text-[11px] font-bold">Edit</button>
              <button onClick={() => handleDelete(m.id!)} className="p-2 bg-red-50 rounded-lg text-red-400 hover:text-red-600"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
