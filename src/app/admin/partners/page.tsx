"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

interface Zone { id: string; zone_id: string; label?: string | null; format: string; full_tag?: string | null }
interface Payout {
  id: string; amount: number; currency: string | null; from_address: string | null; to_address: string | null;
  status: string; proof_link: string | null; proof_image: string | null; note: string | null; created_at: string;
}
interface Partner {
  id: string; code: string; name: string; email: string;
  active: boolean; suspended: boolean; banned: boolean; created_at: string;
  revenue_split: number; full_stats: boolean;
  earned_total: number; paid_total: number; balance: number; hold: number;
  payout_currency?: string | null; payout_address?: string | null;
  zones: Zone[]; payouts: Payout[];
}
interface Application {
  id: string; name: string; email: string; country: string;
  platform: string; audience_size: string; contact_handle: string;
  status: string; created_at: string;
}
interface Settings { partner_public_page: boolean; partner_ads: boolean }
interface Summary { partnerCount: number; pendingCount: number; totalBalance: number; totalHold: number; totalPaid: number }

interface Confirm {
  title: string; body: string; confirmLabel: string; danger?: boolean;
  input?: { label: string; placeholder?: string };
  run: (value: string) => void;
}

const SITE = "https://xellnetwork.xyz";
const money = (n: number) => "$" + (Number(n) || 0).toFixed(2);

const CRYPTO: { id: string; label: string }[] = [
  { id: "usdt_trc20", label: "USDT · TRC20" },
  { id: "usdt_erc20", label: "USDT · ERC20" },
  { id: "usdt_bep20", label: "USDT · BEP20" },
  { id: "ton", label: "Toncoin (TON)" },
  { id: "btc", label: "Bitcoin (BTC)" },
];
const curLabel = (id?: string | null) => CRYPTO.find((c) => c.id === id)?.label || id || "—";
const PSTATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
  sent: { label: "Sent", cls: "bg-violet-50 text-violet-700" },
  completed: { label: "Completed", cls: "bg-[#3cac3b]/10 text-[#3cac3b]" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-600" },
};
const pstatusMeta = (s?: string) => PSTATUS[s || ""] || { label: s || "—", cls: "bg-gray-100 text-gray-500" };

function suggestCode(name: string) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "partner";
}
function suggestPw() {
  return Math.random().toString(36).slice(2, 8) + String(Math.floor(Math.random() * 90 + 10));
}

// Parse a Monetag by-zone CSV (semicolon-separated). Returns null if it has no Zone ID column.
function parseCsv(text: string): { zone_id: string; label: string; impressions: string; profit: string }[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const delim = lines[0].includes(";") ? ";" : ",";
  const clean = (s: string) => s.replace(/^"|"$/g, "").replace(/"$/, "").trim();
  const header = lines[0].split(delim).map((h) => clean(h).toLowerCase());
  const zi = header.findIndex((h) => h.includes("zone") && h.includes("id"));
  const zn = header.findIndex((h) => h === "zone" || (h.includes("zone") && !h.includes("id")));
  const pi = header.findIndex((h) => h.includes("profit") || h.includes("revenue") || h.includes("earning"));
  const ii = header.findIndex((h) => h.includes("impression"));
  if (zi === -1 || pi === -1) return null;
  const rows: { zone_id: string; label: string; impressions: string; profit: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim).map(clean);
    const zone_id = cols[zi] || "";
    if (!zone_id) continue;
    rows.push({
      zone_id,
      label: zn >= 0 ? (cols[zn] || "") : "",
      impressions: ii >= 0 ? (cols[ii] || "") : "",
      profit: cols[pi] || "0",
    });
  }
  return rows;
}

export default function PartnersAdmin() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [settings, setSettings] = useState<Settings>({ partner_public_page: false, partner_ads: false });
  const [summary, setSummary] = useState<Summary>({ partnerCount: 0, pendingCount: 0, totalBalance: 0, totalHold: 0, totalPaid: 0 });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);

  // New-partner form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Confirmation modal (single input / confirmations)
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [modalInput, setModalInput] = useState("");
  const ask = (c: Confirm, initial = "") => { setModalInput(initial); setConfirm(c); };

  // Approve modal (needs code + password + split)
  const [approve, setApprove] = useState<Application | null>(null);
  const [apCode, setApCode] = useState("");
  const [apPw, setApPw] = useState("");
  const [apSplit, setApSplit] = useState("50");

  // Record-a-payout modal
  const [payoutFor, setPayoutFor] = useState<Partner | null>(null);
  const [poAmount, setPoAmount] = useState("");
  const [poCurrency, setPoCurrency] = useState("");
  const [poFrom, setPoFrom] = useState("");
  const [poTo, setPoTo] = useState("");
  const [poStatus, setPoStatus] = useState("in_progress");
  const [poLink, setPoLink] = useState("");
  const [poImage, setPoImage] = useState<string | null>(null);
  const [poNote, setPoNote] = useState("");

  // Filter / sort / expand state for the partner list
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "banned">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "balance" | "earned" | "paid">("newest");
  const [amtMetric, setAmtMetric] = useState<"balance" | "earned" | "paid">("balance");
  const [amtMin, setAmtMin] = useState("");
  const [amtMax, setAmtMax] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/partners", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setPartners(j.partners ?? []);
      setApplications(j.applications ?? []);
      setSettings(j.settings ?? { partner_public_page: false, partner_ads: false });
      setSummary(j.summary ?? { partnerCount: 0, pendingCount: 0, totalBalance: 0, totalHold: 0, totalPaid: 0 });
    } catch {
      setMsg({ type: "err", text: "Couldn't load partners." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/partners", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ type: "err", text: j.error || "Something went wrong" }); return false; }
      setMsg({ type: "ok", text: okText });
      await load();
      return true;
    } catch {
      setMsg({ type: "err", text: "Something went wrong" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createPartner() {
    if (busy) return;
    const ok = await post({ create: true, name, code, email, password, active: true }, `Added ${name || code}.`);
    if (ok) { setName(""); setCode(""); setEmail(""); setPassword(""); setShowAdd(false); }
  }

  // ---- master switches ----
  function flipSetting(key: "partner_public_page" | "partner_ads", to: boolean, label: string) {
    post({ action: "settings", key, value: to }, `${label} turned ${to ? "ON" : "OFF"}.`);
  }

  // ---- CSV import ----
  async function onCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setMsg(null); setImportInfo(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows === null) {
        setMsg({ type: "err", text: "That file has no \u201CZone ID\u201D column. In Monetag, group the report by Zone (not Date) and export again." });
        return;
      }
      if (rows.length === 0) { setMsg({ type: "err", text: "No zone rows found in that file." }); return; }
      const r = await fetch("/api/admin/partners", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ type: "err", text: j.error || "Import failed" }); return; }
      const res = j.result || {};
      setImportInfo(`Matched ${res.rows_matched ?? 0} of ${res.rows_total ?? 0} zones · total profit ${money(res.total_profit ?? 0)}.`);
      setMsg({ type: "ok", text: "Earnings updated from your CSV." });
      await load();
    } catch {
      setMsg({ type: "err", text: "Couldn't read that file." });
    } finally {
      setBusy(false);
    }
  }

  // ---- applications ----
  function openApprove(a: Application) {
    setApCode(suggestCode(a.name)); setApPw(suggestPw()); setApSplit("50"); setApprove(a);
  }
  async function doApprove() {
    if (!approve) return;
    const ok = await post({ action: "approve", app_id: approve.id, code: apCode.trim().toLowerCase(), password: apPw, split: Number(apSplit) || 50 }, `Approved ${approve.name || apCode}. Their login is ready.`);
    if (ok) setApprove(null);
  }
  function rejectApp(a: Application) {
    ask({
      title: `Reject ${a.name || "this application"}?`,
      body: "It moves to rejected and disappears from this list. The same email can't be re-submitted.",
      confirmLabel: "Reject", danger: true,
      run: () => post({ action: "reject", app_id: a.id }, "Application rejected."),
    });
  }

  // ---- per-partner: split / zone / payout / stats ----
  function editSplit(p: Partner) {
    ask({
      title: `Set ${p.name}'s split`,
      body: "Internal only \u2014 the partner never sees this number. Changing it affects only earnings from future uploads; past earnings stay at the old rate.",
      confirmLabel: "Save split",
      input: { label: "Their share (%)", placeholder: "50" },
      run: (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) { setMsg({ type: "err", text: "Enter 0\u2013100" }); return; } post({ action: "split", code: p.code, split: n }, `${p.name}: split set to ${n}%.`); },
    }, String(p.revenue_split ?? 50));
  }
  function setZone(p: Partner) {
    const existing = p.zones.find((z) => z.format === "popunder");
    ask({
      title: existing ? `Update ${p.name}'s popunder zone` : `Add ${p.name}'s popunder zone`,
      body: "Paste the Monetag Zone ID you created for this partner. Their referred traffic's popunder will run this zone, and its earnings flow in through your CSV.",
      confirmLabel: "Save zone",
      input: { label: "Monetag Zone ID", placeholder: "e.g. 11157914" },
      run: (v) => { const z = v.trim(); if (!z) { setConfirm(null); return; } post({ action: "addzone", partner_id: p.id, zone_id: z, format: "popunder" }, `${p.name}: zone saved.`); },
    }, existing?.zone_id || "");
  }
  function removeZone(p: Partner, z: Zone) {
    ask({
      title: `Remove zone ${z.zone_id}?`,
      body: `${p.name}'s referred traffic will fall back to the house popunder until you add a new zone.`,
      confirmLabel: "Remove", danger: true,
      run: () => post({ action: "removezone", zone_id: z.zone_id }, "Zone removed."),
    });
  }
  function openPayout(p: Partner) {
    setPayoutFor(p);
    setPoAmount(p.balance > 0 ? p.balance.toFixed(2) : "");
    setPoCurrency(p.payout_currency || "");
    setPoFrom("");
    setPoTo(p.payout_address || "");
    setPoStatus("in_progress");
    setPoLink("");
    setPoImage(null);
    setPoNote("");
  }
  function onPoImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setMsg({ type: "err", text: "Image too large (max 4MB)." }); return; }
    const reader = new FileReader();
    reader.onload = () => setPoImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }
  async function doPayout() {
    if (!payoutFor || busy) return;
    const amount = Number(poAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setMsg({ type: "err", text: "Enter an amount greater than 0." }); return; }
    const ok = await post({
      action: "payout", partner_id: payoutFor.id, amount,
      currency: poCurrency || null, from_address: poFrom.trim() || null, to_address: poTo.trim() || null,
      status: poStatus, proof_link: poLink.trim() || null, proof_image: poImage || null, note: poNote.trim() || null,
    }, `Payout recorded for ${payoutFor.name}.`);
    if (ok) setPayoutFor(null);
  }
  function changeStatus(id: string, status: string) {
    post({ action: "payout_status", payout_id: id, status }, "Payout status updated.");
  }
  function deletePayout(po: Payout) {
    ask({
      title: "Delete this payout?",
      body: `Removes the ${money(po.amount)} record. This changes the partner's balance, hold and paid totals.`,
      confirmLabel: "Delete", danger: true,
      run: () => post({ action: "payout_delete", payout_id: po.id }, "Payout deleted."),
    });
  }
  function toggleFullStats(p: Partner) {
    ask({
      title: p.full_stats ? `Limit ${p.name} to own people?` : `Show ${p.name} platform-wide stats?`,
      body: p.full_stats
        ? `${p.name} will only see THEIR OWN referred visitors \u2014 not the whole platform's numbers.`
        : `${p.name} will see whole-platform totals next to their own. (Default for new partners is own-people-only.)`,
      confirmLabel: p.full_stats ? "Limit to own" : "Show platform-wide",
      run: () => post({ action: "fullstats", code: p.code, full_stats: !p.full_stats }, `${p.name}: stats view updated.`),
    });
  }

  // ---- existing partner actions ----
  function toggleReferral(p: Partner) {
    ask({
      title: p.active ? "Turn referral link off?" : "Turn referral link on?",
      body: p.active
        ? `${p.name}'s link ${SITE}/${p.code} will stop tagging new visitors. They can still log in.`
        : `${p.name}'s link ${SITE}/${p.code} will start working again.`,
      confirmLabel: p.active ? "Turn off" : "Turn on",
      run: () => post({ action: "state", code: p.code, active: !p.active }, `${p.name}: referral turned ${p.active ? "off" : "on"}.`),
    });
  }
  function toggleSuspend(p: Partner) {
    ask({
      title: p.suspended ? "Restore login?" : "Suspend login?",
      body: p.suspended ? `${p.name} will be able to log in again.` : `${p.name} won't be able to log in. Their referral link keeps working.`,
      confirmLabel: p.suspended ? "Restore login" : "Suspend",
      run: () => post({ action: "state", code: p.code, suspended: !p.suspended }, `${p.name}: ${p.suspended ? "login restored" : "login suspended"}.`),
    });
  }
  function toggleBan(p: Partner) {
    ask({
      title: p.banned ? "Unban partner?" : "Ban partner?",
      body: p.banned
        ? `${p.name} will be restored. Referral returns to ${p.active ? "on" : "off"} and they can log in${p.suspended ? " (still suspended)" : ""}.`
        : `Full cutoff: ${p.name}'s referral link stops AND they can't log in. Reversible.`,
      confirmLabel: p.banned ? "Unban" : "Ban", danger: true,
      run: () => post({ action: "state", code: p.code, banned: !p.banned }, `${p.name}: ${p.banned ? "unbanned" : "banned"}.`),
    });
  }
  function rename(p: Partner) {
    ask({
      title: `Rename ${p.name}?`,
      body: "Changes their display name only \u2014 code and login stay the same.",
      confirmLabel: "Save name", input: { label: "New display name" },
      run: (v) => { const nn = v.trim(); if (!nn || nn === p.name) { setConfirm(null); return; } post({ code: p.code, name: nn, email: p.email, active: p.active }, `Renamed to ${nn}.`); },
    }, p.name);
  }
  function resetPw(p: Partner) {
    ask({
      title: `Reset password for ${p.name}?`,
      body: "They'll need the new password to log in. The current one stops working immediately.",
      confirmLabel: "Reset password", danger: true,
      input: { label: "New password", placeholder: "at least 4 characters" },
      run: (v) => { if (!v || v.length < 4) { setMsg({ type: "err", text: "Password must be at least 4 characters" }); return; } post({ code: p.code, name: p.name, email: p.email, active: p.active, password: v }, `Password updated for ${p.name}.`); },
    });
  }

  const field = "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3cac3b]";
  const btn = "text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60";
  const sel = "px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#3cac3b]";
  const chip = (active: boolean) => `px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${active ? "bg-[#3cac3b] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`;

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return ""; }
  };
  function clearFilters() { setQuery(""); setStatusFilter("all"); setAmtMin(""); setAmtMax(""); }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mn = amtMin === "" ? null : Number(amtMin);
    const mx = amtMax === "" ? null : Number(amtMax);
    const metricVal = (p: Partner) => (amtMetric === "earned" ? p.earned_total : amtMetric === "paid" ? p.paid_total : p.balance);
    const out = partners.filter((p) => {
      if (q && !`${p.name} ${p.code} ${p.email}`.toLowerCase().includes(q)) return false;
      if (statusFilter === "active" && !(p.active && !p.banned && !p.suspended)) return false;
      if (statusFilter === "suspended" && !p.suspended) return false;
      if (statusFilter === "banned" && !p.banned) return false;
      const v = metricVal(p);
      if (mn !== null && Number.isFinite(mn) && v < mn) return false;
      if (mx !== null && Number.isFinite(mx) && v > mx) return false;
      return true;
    });
    return out.sort((a, b) => {
      switch (sortBy) {
        case "oldest": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "balance": return b.balance - a.balance;
        case "earned": return b.earned_total - a.earned_total;
        case "paid": return b.paid_total - a.paid_total;
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [partners, query, statusFilter, sortBy, amtMetric, amtMin, amtMax]);

  function Switch({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-800">{label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
        </div>
        <button onClick={onClick} disabled={busy}
          className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors disabled:opacity-60 ${on ? "bg-emerald-500" : "bg-gray-300"}`}>
          <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-black text-gray-900">Partners</h1>
      <p className="text-[13px] text-gray-400 font-medium mt-0.5 mb-5">
        Manage partners, the public program, applications and payouts.
      </p>

      {msg && (
        <div className={`mb-4 text-[13px] font-semibold px-3 py-2 rounded-xl ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-4">
        <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-1">Partner controls</p>
        <Switch on={settings.partner_public_page} label="Public program page"
          hint="When ON, visitors can reach /partner-program and apply. OFF = hidden (404)."
          onClick={() => flipSetting("partner_public_page", !settings.partner_public_page, "Public program page")} />
        <div className="border-t border-gray-100" />
        <Switch on={settings.partner_ads} label="Partner ads (popunder)"
          hint="ON during live matches: referred traffic's popunder runs the partner's zone. OFF = everyone gets house ads."
          onClick={() => flipSetting("partner_ads", !settings.partner_ads, "Partner ads")} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
        {[
          { label: "Partners", value: String(summary.partnerCount) },
          { label: "Pending apps", value: String(summary.pendingCount) },
          { label: "Balance owed", value: money(summary.totalBalance) },
          { label: "On hold", value: money(summary.totalHold) },
          { label: "Paid to date", value: money(summary.totalPaid) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-3">
            <p className="text-[18px] font-black text-gray-900">{s.value}</p>
            <p className="text-[11px] text-gray-400 font-semibold">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Earnings import */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6">
        <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-1">Earnings upload</p>
        <p className="text-[12px] text-gray-400 mb-3">
          Upload your Monetag <span className="font-semibold">by-zone</span> CSV (all-time). Each zone is matched to its partner and the split is applied to only the new amount since last time.
        </p>
        <label className={`inline-block cursor-pointer ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          <span className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold inline-block">Upload Monetag CSV</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onCsv} />
        </label>
        {importInfo && <p className="text-[12px] text-emerald-700 font-semibold mt-2">{importInfo}</p>}
      </div>

      {/* Applications */}
      {applications.length > 0 && (
        <div className="mb-6">
          <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider mb-2">Applications · {applications.length} pending</p>
          <div className="space-y-2.5">
            {applications.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900">{a.name || "(no name)"}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">{a.email}{a.country ? ` · ${a.country}` : ""}</p>
                    <p className="text-[12px] text-gray-500">{a.platform}{a.audience_size ? ` · ${a.audience_size}` : ""}</p>
                    {a.contact_handle && <p className="text-[12px] text-gray-400 mt-0.5">Contact: {a.contact_handle}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => openApprove(a)} disabled={busy}
                      className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">Approve</button>
                    <button onClick={() => rejectApp(a)} disabled={busy}
                      className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60">Reject</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new */}
      {!showAdd ? (
        <button onClick={() => setShowAdd(true)}
          className="mb-6 px-5 py-2.5 rounded-xl bg-[#3cac3b] text-white text-sm font-bold hover:bg-[#2e8e2d] transition-colors">
          + Add a partner
        </button>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider">Add a partner</p>
            <button onClick={() => setShowAdd(false)} className="text-[12px] font-bold text-gray-400 hover:text-gray-700">Cancel</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Name</label>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gims" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Referral code (their link)</label>
              <input className={field} value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} placeholder="e.g. gims" />
              {code && <p className="text-[11px] text-gray-400 mt-1 font-mono">{SITE}/{code}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Login email</label>
              <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Login password</label>
              <input className={field} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 4 characters" />
            </div>
          </div>
          <button onClick={createPartner} disabled={busy}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#3cac3b] text-white text-sm font-bold hover:bg-[#2e8e2d] disabled:opacity-60 transition-colors">
            {busy ? "Saving\u2026" : "Add partner"}
          </button>
        </div>
      )}

      {/* Existing partners */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-black text-gray-700 uppercase tracking-wider">Existing partners</p>
        <p className="text-[11px] text-gray-400 font-semibold">{shown.length} of {partners.length}</p>
      </div>

      {/* Filter / sort bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, code or email"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#3cac3b] mb-2" />
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={sel}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={sel}>
            <option value="newest">Newest joined</option>
            <option value="oldest">Oldest joined</option>
            <option value="balance">Balance: high to low</option>
            <option value="earned">Earned: high to low</option>
            <option value="paid">Paid: high to low</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Amount</span>
          <select value={amtMetric} onChange={(e) => setAmtMetric(e.target.value as typeof amtMetric)} className={sel}>
            <option value="balance">Balance</option>
            <option value="earned">Earned</option>
            <option value="paid">Paid</option>
          </select>
          <input type="number" inputMode="decimal" value={amtMin} onChange={(e) => setAmtMin(e.target.value)} placeholder="min $"
            className="w-24 px-2.5 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#3cac3b]" />
          <span className="text-gray-300">to</span>
          <input type="number" inputMode="decimal" value={amtMax} onChange={(e) => setAmtMax(e.target.value)} placeholder="max $"
            className="w-24 px-2.5 py-2 rounded-lg border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#3cac3b]" />
          {(query || statusFilter !== "all" || amtMin || amtMax) && (
            <button onClick={clearFilters} className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Clear</button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-gray-400">No partners yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400">No partners match these filters.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => {
            const open = openId === p.id;
            const zone = p.zones.find((z) => z.format === "popunder");
            const pill = p.banned
              ? { t: "Banned", c: "bg-red-50 text-red-600" }
              : !p.active
              ? { t: "Referral off", c: "bg-gray-100 text-gray-500" }
              : p.suspended
              ? { t: "Suspended", c: "bg-amber-50 text-amber-600" }
              : { t: "Active", c: "bg-[#3cac3b]/10 text-[#3cac3b]" };
            return (
              <div key={p.id} className={`bg-white rounded-2xl border overflow-hidden ${p.banned ? "border-red-200" : "border-gray-200"}`}>
                <button onClick={() => setOpenId(open ? null : p.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-gray-900 truncate">{p.name}</span>
                      <span className="text-[10px] font-mono font-bold text-[#3cac3b] bg-[#3cac3b]/10 px-1.5 py-0.5 rounded">/{p.code}</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${pill.c}`}>{pill.t}</span>
                      {p.full_stats && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#3cac3b]/10 text-[#3cac3b]">Full stats</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{p.email} · joined {fmtDate(p.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[17px] font-black text-gray-900 leading-none tabular-nums">{money(p.balance)}</p>
                    <p className="text-[10px] text-gray-400 mt-1 tabular-nums">earned {money(p.earned_total)} · hold {money(p.hold)}</p>
                  </div>
                </button>

                {open && (
                  <div className="px-4 pb-4 pt-3 border-t border-gray-100">
                    <p className="text-[12px] text-gray-400 font-mono mb-3">{SITE}/{p.code}</p>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[
                        { l: "Balance", v: p.balance },
                        { l: "On hold", v: p.hold },
                        { l: "Earned", v: p.earned_total },
                        { l: "Paid", v: p.paid_total, muted: true },
                      ].map((m) => (
                        <div key={m.l} className="bg-gray-50 rounded-xl p-2 text-center">
                          <p className={`text-[14px] font-black tabular-nums ${m.muted ? "text-gray-400" : "text-gray-900"}`}>{money(m.v)}</p>
                          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{m.l}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Popunder zone (shared)</p>
                        {zone ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[13px] text-gray-800">{zone.zone_id}{zone.label ? <span className="text-gray-400"> · {zone.label}</span> : null}</span>
                            <div className="flex gap-1">
                              <button onClick={() => setZone(p)} disabled={busy} className={btn}>Edit</button>
                              <button onClick={() => removeZone(p, zone)} disabled={busy} className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60">Remove</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setZone(p)} disabled={busy} className="text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-[#3cac3b]/10 text-[#2e8e2d] hover:bg-[#3cac3b]/20 disabled:opacity-60">Add zone ID</button>
                        )}
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Payout · split {p.revenue_split}% <button onClick={() => editSplit(p)} className="text-[#3cac3b] normal-case">edit</button></p>
                        <p className="text-[12px] text-gray-600 mt-1 break-all">
                          {p.payout_address
                            ? <>Wallet <b className="text-gray-800">{curLabel(p.payout_currency)}</b> <span className="font-mono text-gray-500">{p.payout_address}</span></>
                            : <span className="text-gray-400">Partner hasn’t saved a wallet yet.</span>}
                        </p>
                        <button onClick={() => openPayout(p)} disabled={busy} className="mt-2 text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-60">Record a payout</button>
                      </div>
                    </div>

                    {p.payouts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Payment history</p>
                        <div className="space-y-1.5">
                          {p.payouts.map((po) => {
                            const st = pstatusMeta(po.status);
                            return (
                              <div key={po.id} className="bg-gray-50 rounded-xl p-2.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-black text-gray-900 tabular-nums">{money(po.amount)}</span>
                                  <span className="text-[11px] text-gray-400">{curLabel(po.currency)} · {fmtDate(po.created_at)}</span>
                                  <select value={po.status} onChange={(e) => changeStatus(po.id, e.target.value)} disabled={busy}
                                    className={`text-[10px] font-bold uppercase px-1.5 py-1 rounded ${st.cls}`}>
                                    <option value="in_progress">In progress</option>
                                    <option value="sent">Sent</option>
                                    <option value="completed">Completed</option>
                                    <option value="failed">Failed</option>
                                  </select>
                                </div>
                                {(po.from_address || po.to_address) && (
                                  <p className="text-[10px] text-gray-400 font-mono mt-1 break-all">{po.from_address || "—"} → {po.to_address || "—"}</p>
                                )}
                                <div className="flex items-center gap-3 mt-1">
                                  {po.proof_link && <a href={po.proof_link} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#3cac3b]">link ↗</a>}
                                  {po.proof_image && <a href={po.proof_image} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[#3cac3b]">screenshot ↗</a>}
                                  {po.note && <span className="text-[11px] text-gray-400 truncate">{po.note}</span>}
                                  <button onClick={() => deletePayout(po)} disabled={busy} className="text-[11px] font-bold text-red-500 hover:text-red-700 ml-auto shrink-0">delete</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {!p.banned && (
                        <>
                          <button onClick={() => toggleReferral(p)} disabled={busy} className={btn}>{p.active ? "Turn off" : "Turn on"}</button>
                          <button onClick={() => toggleSuspend(p)} disabled={busy} className={btn}>{p.suspended ? "Restore login" : "Suspend"}</button>
                        </>
                      )}
                      <button onClick={() => toggleFullStats(p)} disabled={busy} className={btn}>{p.full_stats ? "Limit stats" : "Platform stats"}</button>
                      <button onClick={() => toggleBan(p)} disabled={busy}
                        className={`text-[12px] font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-60 ${p.banned ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>
                        {p.banned ? "Unban" : "Ban"}
                      </button>
                      <button onClick={() => rename(p)} disabled={busy} className={btn}>Rename</button>
                      <button onClick={() => resetPw(p)} disabled={busy} className={btn}>Reset password</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      
{/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-gray-900">{confirm.title}</p>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{confirm.body}</p>
            {confirm.input && (
              <div className="mt-3">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">{confirm.input.label}</label>
                <input className={field} value={modalInput} autoFocus placeholder={confirm.input.placeholder}
                  onChange={(e) => setModalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { const fn = confirm.run; const v = modalInput; setConfirm(null); fn(v); } }} />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button onClick={() => { const fn = confirm.run; const v = modalInput; setConfirm(null); fn(v); }}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white ${confirm.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#3cac3b] hover:bg-[#2e8e2d]"}`}>
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve modal */}
      {approve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setApprove(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-gray-900">Approve {approve.name || "applicant"}</p>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
              This creates their partner login. Give them the code and password ({approve.contact_handle ? `via ${approve.contact_handle}` : "via their contact"}).
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Referral code (their link)</label>
                <input className={field} value={apCode} onChange={(e) => setApCode(e.target.value.toLowerCase())} />
                {apCode && <p className="text-[11px] text-gray-400 mt-1 font-mono">{SITE}/{apCode}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Login password</label>
                <input className={field} value={apPw} onChange={(e) => setApPw(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Their split % (internal)</label>
                <input className={field} value={apSplit} onChange={(e) => setApSplit(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setApprove(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button onClick={doApprove} disabled={busy}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                {busy ? "Creating\u2026" : "Create partner"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout modal */}
      {payoutFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 overflow-y-auto" onClick={() => setPayoutFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 my-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-gray-900">Record a payout · {payoutFor.name}</p>
            <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">Balance available: {money(payoutFor.balance)}. While it’s In progress or Sent it sits in Hold; mark it Completed when it’s done.</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Amount (USD)</label>
                <input className={field} value={poAmount} onChange={(e) => setPoAmount(e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Currency</label>
                <div className="flex flex-wrap gap-1.5">
                  {CRYPTO.map((c) => (
                    <button key={c.id} onClick={() => setPoCurrency(c.id)} className={chip(poCurrency === c.id)}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">From address (your wallet)</label>
                <input className={field} value={poFrom} onChange={(e) => setPoFrom(e.target.value)} placeholder="optional" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">To address (their wallet)</label>
                <input className={field} value={poTo} onChange={(e) => setPoTo(e.target.value)} placeholder="optional" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                <select className={field} value={poStatus} onChange={(e) => setPoStatus(e.target.value)}>
                  <option value="in_progress">In progress</option>
                  <option value="sent">Sent</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Proof link (optional)</label>
                <input className={field} value={poLink} onChange={(e) => setPoLink(e.target.value)} placeholder="transaction / explorer URL" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Screenshot (optional)</label>
                <input type="file" accept="image/*" onChange={onPoImage} className="block text-[12px] text-gray-500" />
                {poImage && <p className="text-[11px] text-[#3cac3b] font-bold mt-1">Image attached ✓ <button onClick={() => setPoImage(null)} className="text-gray-400 ml-1 normal-case">remove</button></p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Note (optional)</label>
                <input className={field} value={poNote} onChange={(e) => setPoNote(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setPayoutFor(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button onClick={doPayout} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#3cac3b] hover:bg-[#2e8e2d] disabled:opacity-60">{busy ? "Saving…" : "Record payout"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
