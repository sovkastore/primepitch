"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const MASTER_CHANNELS = [
  { name: "Sky Sports Cricket", id: 2 },
  { name: "Willow Cricket", id: 11 },
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
  time: string; // Keep for fallback/legacy display
  starts_at: string; // Real UTC Timestamp
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
  const [startsAt, setStartsAt] = useState("");
  const [status, setStatus] = useState<CricketMatch["status"]>("live");
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const [customId, setCustomId] = useState("");
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Player appearance state
  const [playerDescription, setPlayerDescription] = useState("Stream opens in a new window for the best viewing experience");
  const [playerButtonText, setPlayerButtonText] = useState("Launch Stream");
  const [playerBottomText, setPlayerBottomText] = useState("Click above to start watching");

  useEffect(() => {
    fetchMatches();
    fetchAppearanceSettings();
  }, []);

  async function fetchAppearanceSettings() {
    try {
      const res = await fetch("/api/cricket?type=player-text");
      const data = await res.json();
      if (data?.value) {
        const val = data.value;
        if (val.description) setPlayerDescription(val.description);
        if (val.button_text) setPlayerButtonText(val.button_text);
        if (val.bottom_text) setPlayerBottomText(val.bottom_text);
      }
    } catch (e: any) {
      console.error("Error loading appearance settings:", e.message);
    }
  }

  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(null), 6000);
      return () => clearTimeout(t);
    }
  }, [msg]);

  async function fetchMatches() {
    setLoading(true);
    try {
      const res = await fetch("/api/cricket?admin=true");
      const data = await res.json();
      if (Array.isArray(data)) {
        setMatches(data);
      } else {
        setMsg({ text: "Fetch Error: " + (data.error || "Unknown error"), type: "error" });
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
    // Convert timestamp to local datetime format for input (YYYY-MM-DDThh:mm)
    const date = new Date(match.starts_at || Date.now());
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
    setStartsAt(localISOTime);
    setStatus(match.status);
    setSelectedChannels(match.channel_ids);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingMatch(null);
    setTitle("");
    setCompetition("");
    setStartsAt("");
    setStatus("live");
    setSelectedChannels([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ text: "Saving to database...", type: "info" });

    // Ensure we send a valid UTC timestamp
    const utcTime = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
    // Helper formatted time for legacy display (HH:mm)
    const shortTime = startsAt ? new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : "LIVE";

    const payload = { 
        id: editingMatch?.id,
        title, 
        competition, 
        starts_at: utcTime,
        time: shortTime, 
        status, 
        channel_ids: selectedChannels 
    };

    try {
        const res = await fetch("/api/cricket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.error) {
            setMsg({ text: "SAVE FAILED: " + result.error, type: "error" });
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
    try {
        const res = await fetch(`/api/cricket?id=${id}`, { method: "DELETE" });
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

  const handleSaveAppearance = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ text: "Saving appearance settings...", type: "info" });
    try {
      const payload = {
        description: playerDescription,
        button_text: playerButtonText,
        bottom_text: playerBottomText,
      };

      const res = await fetch("/api/cricket?type=player-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.error) {
        setMsg({ text: "Appearance save failed: " + data.error, type: "error" });
      } else {
        setMsg({ text: "SUCCESS! Player appearance settings saved.", type: "success" });
      }
    } catch (err: any) {
      setMsg({ text: "Error saving appearance settings: " + err.message, type: "error" });
    }
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
                 <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Kickoff Time (UTC)</label>
                 <input 
                   type="datetime-local"
                   value={startsAt} 
                   onChange={e => setStartsAt(e.target.value)} 
                   required 
                   className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 font-bold" 
                 />
               </div>
               <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Override Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 font-bold">
                    <option value="today">Scheduled (Auto-Live)</option>
                    <option value="live">Force LIVE Now</option>
                    <option value="tomorrow">Tomorrow / Future</option>
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

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-12">
        <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-4">Player Appearance Settings</h2>
        <form onSubmit={handleSaveAppearance} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Launch Button Text</label>
            <input value={playerButtonText} onChange={e => setPlayerButtonText(e.target.value)} required placeholder="Launch Stream" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-emerald-500/20 font-bold" />
          </div>
          <div>
            <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Stream Description</label>
            <input value={playerDescription} onChange={e => setPlayerDescription(e.target.value)} required placeholder="Stream opens in a new window for the best viewing experience" className="w-full px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-emerald-500/20 font-bold" />
          </div>
          <div className="flex flex-col justify-end">
            <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">Bottom Helper Text</label>
            <div className="flex gap-2">
              <input value={playerBottomText} onChange={e => setPlayerBottomText(e.target.value)} required placeholder="Click above to start watching" className="flex-1 px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 focus:ring-2 focus:ring-emerald-500/20 font-bold" />
              <button type="submit" className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-colors shadow-md">SAVE</button>
            </div>
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
                <p className="text-[10px] text-gray-400 font-bold uppercase">
                  {m.competition} • {m.starts_at ? new Date(m.starts_at).toLocaleString() : m.status}
                </p>
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
