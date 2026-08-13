"use client";

import { useEffect, useState } from "react";

interface LogEntry {
  match_id: string;
  title?: string;
  status: string;
  attempts: number;
  method?: string;
  detail?: string;
  updated_at?: string;
}

interface TestResult {
  ok: boolean;
  working?: boolean;
  verdict?: string;
  confidence?: string;
  tokens?: { input: number; output: number };
  ms?: number;
  error?: string;
}

interface PickEntry {
  match_id: string;
  pick_date?: string;
  title?: string;
  league?: string;
  reason?: string;
  method?: string;
}

interface PickRunResult {
  ok: boolean;
  ran?: boolean;
  method?: string;
  considered?: number;
  picked?: number;
  newlyActivated?: number;
  detail?: string;
  error?: string;
}

const STATUS_STYLES: Record<string, string> = {
  converted: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  given_up: "bg-red-100 text-red-700",
};

export default function AutoLivePanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const [pickEnabled, setPickEnabled] = useState(true);
  const [criteria, setCriteria] = useState("");
  const [picks, setPicks] = useState<PickEntry[]>([]);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [runningPick, setRunningPick] = useState(false);
  const [pickRun, setPickRun] = useState<PickRunResult | null>(null);

  async function loadLog() {
    try {
      const res = await fetch("/api/admin/auto-live-log");
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch("/api/admin/auto-pick-config");
      const data = await res.json();
      setPickEnabled(data.enabled !== false);
      setCriteria(data.criteria || "");
      setPicks(data.picks || []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after await, not synchronously
    loadLog();
  }, []);

  async function saveCriteria(nextEnabled?: boolean) {
    setSavingCriteria(true);
    try {
      const enabled = nextEnabled ?? pickEnabled;
      await fetch("/api/admin/auto-pick-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, criteria }),
      });
      if (nextEnabled !== undefined) setPickEnabled(nextEnabled);
    } finally {
      setSavingCriteria(false);
    }
  }

  async function runPickerNow() {
    setRunningPick(true);
    setPickRun(null);
    try {
      const res = await fetch("/api/admin/run-auto-pick", { method: "POST" });
      setPickRun(await res.json());
      await loadLog();
    } catch (e: unknown) {
      setPickRun({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunningPick(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/admin/test-ai", { method: "POST" });
      setTest(await res.json());
    } catch (e: unknown) {
      setTest({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">🤖 Auto-Live Robot</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Runs every minute. When an active BSD fixture passes kickoff, it makes one RapidAPI
          request, lets the AI find the matching stream (name-rules as backup), makes it visible
          and hides the upcoming fixture.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={runTest}
            disabled={testing}
            className="text-[12px] font-bold text-white bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {testing ? "Asking Claude…" : "🧪 Test AI Matching"}
          </button>
          <button
            onClick={loadLog}
            className="text-[12px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            ↻ Refresh Log
          </button>
        </div>

        {test && (
          <div
            className={`px-4 py-3 rounded-xl border text-[13px] ${
              test.working
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            {test.working ? (
              <>
                <span className="font-bold">✓ AI is working.</span> {test.verdict}
                <span className="text-emerald-700">
                  {" "}
                  ({test.confidence} confidence, {test.tokens?.input}+{test.tokens?.output} tokens,{" "}
                  {test.ms}ms)
                </span>
              </>
            ) : (
              <>
                <span className="font-bold">✗ AI test failed:</span> {test.error || test.verdict}
                <span className="block mt-1 text-[12px]">
                  The robot will use the name-rules fallback until this is fixed.
                </span>
              </>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Recent activity
          </h3>
          {entries.length === 0 ? (
            <p className="text-[13px] text-gray-400 py-2">
              Nothing yet — activity appears here when an active fixture reaches kickoff.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {entries.map((e) => (
                <div key={e.match_id} className="py-2.5 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-gray-900">
                      {e.title || e.match_id}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[e.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {e.status.replace("_", " ")}
                    </span>
                    {e.method && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                        {e.method === "ai" ? "🤖 AI" : "🔧 Rules"}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {e.attempts} {e.attempts === 1 ? "try" : "tries"}
                    </span>
                  </div>
                  {e.detail && <p className="text-[11px] text-gray-500">{e.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">📅 Daily Big-Game Picker</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Runs automatically just after midnight: the AI reads the new day&apos;s BSD fixtures
              and activates every match that fits your rules — no maximum. Turn off any pick you
              don&apos;t want; it stays off.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600 cursor-pointer">
            <button
              onClick={() => saveCriteria(!pickEnabled)}
              className={`relative rounded-full transition-colors shrink-0 ${pickEnabled ? "bg-emerald-500" : "bg-gray-300"}`}
              style={{ width: 36, height: 20 }}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${pickEnabled ? "translate-x-[18px]" : "translate-x-0.5"}`}
              />
            </button>
            {pickEnabled ? "Daily run ON" : "Daily run OFF"}
          </label>
        </div>

        <div>
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            What counts as a big game (the AI follows this exactly)
          </h3>
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={9}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[12px] font-mono text-gray-800 leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => saveCriteria()}
            disabled={savingCriteria}
            className="text-[12px] font-bold text-white bg-gray-800 hover:bg-gray-900 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {savingCriteria ? "Saving…" : "Save Rules"}
          </button>
          <button
            onClick={runPickerNow}
            disabled={runningPick}
            className="text-[12px] font-bold text-white bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {runningPick ? "Picking…" : "▶ Run Picker Now"}
          </button>
        </div>

        {pickRun && (
          <div
            className={`px-4 py-3 rounded-xl border text-[13px] ${
              pickRun.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            {pickRun.ok ? (
              <>
                <span className="font-bold">
                  {pickRun.method === "ai" ? "🤖" : "🔧"} Picked {pickRun.picked ?? 0} of{" "}
                  {pickRun.considered ?? 0} fixtures ({pickRun.newlyActivated ?? 0} newly activated).
                </span>{" "}
                {pickRun.detail}
              </>
            ) : (
              <>
                <span className="font-bold">✗ Picker failed:</span> {pickRun.error}
              </>
            )}
          </div>
        )}

        {picks.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Recent picks
            </h3>
            <div className="divide-y divide-gray-50">
              {picks.map((p) => (
                <div key={p.match_id} className="py-2 flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-gray-900">{p.title}</span>
                    <span className="text-[10px] text-gray-400">{p.league}</span>
                    {p.method && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                        {p.method === "ai" ? "🤖 AI" : "🔧 Rules"}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{p.pick_date}</span>
                  </div>
                  {p.reason && <p className="text-[11px] text-gray-500">{p.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
