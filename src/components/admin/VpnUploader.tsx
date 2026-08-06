"use client";

import { useRef, useState } from "react";

type Props = {
  currentUrl: string;
  onUploaded: (url: string) => void;
};

export default function VpnUploader({ currentUrl, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const isUploaded = currentUrl === "/api/download-apk";

  async function handleFile(file: File) {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(10);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgress(40);

      const res = await fetch("/api/admin/upload-apk", {
        method: "POST",
        body: formData,
      });

      setProgress(90);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setProgress(100);
      onUploaded(data.url);
      setFileName(data.name);
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setProgress(0);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-1">
      <input
        ref={inputRef}
        type="file"
        accept=".apk,application/vnd.android.package-archive"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${isUploaded || fileName ? "bg-emerald-100" : "bg-gray-100"}`}>
          {uploading ? (
            <svg className="animate-spin w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : isUploaded || fileName ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-emerald-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
        </div>

        <div className="text-left flex-1">
          {uploading ? (
            <>
              <p className="text-sm font-semibold text-gray-700">Uploading {fileName}…</p>
              <div className="mt-1.5 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : isUploaded || fileName ? (
            <>
              <p className="text-sm font-semibold text-emerald-700">
                {fileName || "APK uploaded ✓"}
              </p>
              <p className="text-xs text-gray-400">Click to replace with a new file</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">Click to upload APK</p>
              <p className="text-xs text-gray-400">Tap to select your .apk file from your device</p>
            </>
          )}
        </div>
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-500 font-medium">⚠ {error}</p>
      )}
    </div>
  );
}
