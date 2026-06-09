"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminSettingsPage() {
  const [aggregating, setAggregating] = useState(false);
  const [aggregateResult, setAggregateResult] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const supabase = createClient();

  async function runAggregation() {
    setAggregating(true);
    setAggregateResult(null);
    try {
      // Run for today and yesterday
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const [r1, r2] = await Promise.all([
        fetch("/api/admin/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: yesterday }),
        }).then((r) => r.json()),
        fetch("/api/admin/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: today }),
        }).then((r) => r.json()),
      ]);

      setAggregateResult(
        `Done! Yesterday: ${r1.total_views || 0} views, ${r1.unique_visitors || 0} unique. Today: ${r2.total_views || 0} views, ${r2.unique_visitors || 0} unique.`
      );
    } catch {
      setAggregateResult("Failed to run aggregation.");
    } finally {
      setAggregating(false);
    }
  }

  async function changePassword() {
    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg("Password must be at least 6 characters.");
      return;
    }
    setChangingPassword(true);
    setPasswordMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg(error.message);
    } else {
      setPasswordMsg("Password updated successfully.");
      setNewPassword("");
    }
    setChangingPassword(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Change password */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
          Change Password
        </h2>
        <div className="flex gap-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <button
            onClick={changePassword}
            disabled={changingPassword}
            className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {changingPassword ? "..." : "Update"}
          </button>
        </div>
        {passwordMsg && (
          <p className={`text-[12px] font-medium ${passwordMsg.includes("success") ? "text-emerald-500" : "text-red-500"}`}>
            {passwordMsg}
          </p>
        )}
      </div>

      {/* Data management */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
          Data Management
        </h2>
        <div>
          <p className="text-[13px] text-gray-600 mb-3">
            Run daily aggregation to populate charts and stats. This processes raw page views and match views into daily summaries.
          </p>
          <button
            onClick={runAggregation}
            disabled={aggregating}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {aggregating ? "Running..." : "Run Daily Aggregation"}
          </button>
          {aggregateResult && (
            <p className="text-[12px] text-gray-600 mt-3 bg-gray-50 p-3 rounded-xl">
              {aggregateResult}
            </p>
          )}
        </div>
      </div>

      {/* Connection info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h2 className="text-[11px] font-bold text-gray-400 tracking-wider uppercase">
          Connection Status
        </h2>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Supabase</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-600 font-medium">Connected</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Project</span>
            <span className="text-gray-900 font-medium font-mono text-[12px]">primepitch</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Region</span>
            <span className="text-gray-900 font-medium">eu-west-1 (Ireland)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
