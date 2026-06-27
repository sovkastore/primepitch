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
  
  const [title, setTitle] = useState("");
  const [competition, setCompetition] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<CricketMatch["status"]>("live");
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const [customId, setCustomId] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Initialize client outside to ensure it's fresh
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
      const { data, error } = await supabase
        .from("cricket_streams")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) {
        setMsg({ text: "Fetch Error: " + error.message, type: "error" });
      } else if (data) {
        setMatches(data);
      }
    } catch (e: any) {
      setMsg({ text: "System Error: " + e.message, type: "error" });
    }
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
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ text: "Saving to database...", type: "info" });

    const payload = { 
        title, 
        competition, 
        time, 
        status, 
        channel_ids: selectedChannels 
    };

    try {
        let result;
        if (editingMatch?.id) {
            result = await supabase.from("cricket_streams").update(payload).eq("id", editingMatch.id);
        } else {
            result = await supabase.from("cricket_streams").insert([payload]);
        }

        if (result.error) {
            setMsg({ text: "SAVE FAILED: " + result.error.message, type: "error" });
            console.error(result.error);
        } else {
            setMsg({ text: "SUCCESS! Match saved to database.", type: "success" });
            resetForm();
            fetchMatches();
        }
    } catch (err: any) {
        setMsg({ text: "CRITICAL ERROR: " + err.message, type: "error" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    const { error } = await supabase.from("cricket_streams").delete().eq("id", id);
    if (error) setMsg({ text: "Delete Error: " + error.message, type: "error" });
    else fetchMatches();
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-32">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Cricket Stream Manager</h1>
        <div className="flex gap-4">
           <Link href="/cricket-live" target="_blank" className="text-xs font-bold text-emerald-600 hover:underline uppercase tracking-widest">Open Live Page ↗</Link>
        </div>
      </div>

      {msg && (
        <div className={`mb-6 p-4 rounded-xl font-bold text-[13px] border shadow-sm ${
          msg.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
          msg.type === "info" ? "bg-blue-50 border-blue-100 text-blue-600" :
          "bg-red-50 border-red-100 text-red-600"
        }`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-12">
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Match Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="India vs Australia" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-emerald-500/20 font-bold" />
            </div>
            <div>
              <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Competition</label>
              <input value={competition} onChange={e => setCompetition(e.target.value)} required placeholder="T20 World Cup" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Time / LIVE</label>
                 <input value={time} onChange={e => setTime(e.target.value)} required placeholder="14:00 or LIVE" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 font-bold" />
               </div>
               <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Section</label>
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
            <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Select Channels ({selectedChannels.length})</label>
            <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-2 bg-gray-50 rounded-xl">
               {MASTER_CHANNELS.map(ch => (
                 <label key={ch.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${selectedChannels.includes(ch.id) ? 'bg-white border-emerald-500' : 'bg-white border-transparent'}`}>
                    <input type="checkbox" checked={selectedChannels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="w-4 h-4 accent-emerald-500" />
                    <span className="text-[10px] font-bold text-gray-600">{ch.name}</span>
                 </label>
               ))}
            </div>
            <div className="flex gap-2">
               <input type="number" value={customId} onChange={e => setCustomId(e.target.value)} placeholder="Custom ID" className="flex-1 px-4 py-2 rounded-xl border border-gray-100 text-xs font-bold" />
               <button type="button" onClick={addCustomId} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-[10px] font-black">ADD</button>
            </div>
            <button type="submit" className="w-full py-3 bg-emerald-500 text-white rounded-xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
              {editingMatch ? "Update Match" : "Save Match Now"}
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-1">Registered Matches</h2>
        {matches.length === 0 ? (
            <div className="p-8 text-center text-gray-300 font-bold border-2 border-dashed border-gray-100 rounded-2xl">No matches in database. Add one above.</div>
        ) : matches.map(m => (
          <div key={m.id} className="bg-white border border-gray-100 p-4 rounded-xl flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-xl">🏏</div>
              <div>
                <h4 className="text-[15px] font-black text-gray-900 leading-none mb-1">{m.title}</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase">{m.competition} • {m.status}</p>
              </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => handleEdit(m)} className="px-3 py-1.5 bg-gray-100 rounded-lg text-gray-500 text-[10px] font-bold hover:bg-emerald-50 hover:text-emerald-600">Edit</button>
               <button onClick={() => handleDelete(m.id!)} className="px-3 py-1.5 bg-red-50 rounded-lg text-red-500 text-[10px] font-bold">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
