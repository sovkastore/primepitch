"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Stream {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
  viewers?: number;
}

interface Match {
  id: string;
  title: string;
  category: string;
  date: number;
  sources: { source: string; id: string }[];
}

export default function WatchPage() {
  const params = useParams();
  const rawId = decodeURIComponent(params.id as string);
  const [source, matchId] = rawId.split("--");

  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeStream, setActiveStream] = useState(0);
  const [matchTitle, setMatchTitle] = useState("");
  const [otherMatches, setOtherMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch streams
        const streamRes = await fetch(
          `https://streamed.pk/api/stream/${source}/${matchId}`
        );
        const streamData: Stream[] = await streamRes.json();
        setStreams(streamData);

        // Fetch all football matches to find title + other matches
        const matchRes = await fetch(
          "https://streamed.pk/api/matches/football"
        );
        const matchData: Match[] = await matchRes.json();

        const current = matchData.find((m) =>
          m.sources?.some((s) => s.id === matchId)
        );
        if (current) setMatchTitle(current.title);

        const now = Date.now();
        const others = matchData.filter(
          (m) =>
            m.title !== current?.title &&
            m.date - now < 0 &&
            m.date - now > -180 * 60 * 1000
        );
        setOtherMatches(others);
      } catch (e) {
        console.error("Failed to load streams:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [source, matchId]);

  const currentStream = streams[activeStream];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>

      {/* Match title */}
      {matchTitle && (
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          {matchTitle}
        </h1>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Video player */}
        <div className="flex-1">
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : currentStream ? (
              <iframe
                src={currentStream.embedUrl}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                No streams available
              </div>
            )}
          </div>

          {/* Stream servers */}
          {streams.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-2">STREAM SERVERS</p>
              <div className="flex flex-wrap gap-2">
                {streams.map((s, i) => (
                  <button
                    key={`${s.source}-${s.streamNo}`}
                    onClick={() => setActiveStream(i)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeStream === i
                        ? "bg-emerald-500 text-black"
                        : "bg-zinc-800 text-gray-300 border border-white/10 hover:border-emerald-500/50"
                    }`}
                  >
                    Server {s.streamNo}
                    {s.hd && (
                      <span className="ml-1.5 text-xs opacity-70">HD</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — other live matches */}
        <div className="lg:w-80 shrink-0">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">
            OTHER LIVE MATCHES
          </h3>
          <div className="space-y-2">
            {otherMatches.length === 0 && (
              <p className="text-sm text-gray-600">No other live matches</p>
            )}
            {otherMatches.map((m) => {
              const s = m.sources?.[0];
              if (!s) return null;
              const href = `/watch/${encodeURIComponent(s.source)}--${encodeURIComponent(s.id)}`;
              return (
                <Link key={m.title} href={href}>
                  <div className="flex items-center gap-3 p-3 bg-zinc-900/80 border border-white/5 rounded-lg hover:border-emerald-500/30 transition-all group">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">
                        {m.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {m.sources.length} server(s)
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
