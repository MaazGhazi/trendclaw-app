"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import CategorySection from "@/components/CategorySection";
import DataQuality from "@/components/DataQuality";
import TopMovers from "@/components/TopMovers";

interface TrendData {
  timestamp: string;
  type: string;
  data_quality: {
    sources_ok: number;
    sources_failed: string[];
    total_raw_items: number;
  };
  categories: {
    name: string;
    trends: Array<{
      title: string;
      description: string;
      why_trending: string;
      momentum: string;
      popularity: { score: number; metric: string; reach: string };
      sources: string[];
      urls: string[];
      first_seen: string | null;
      relevance: string;
    }>;
  }[];
  top_movers: { title: string; direction: "up" | "down" | "new"; delta: string }[];
  signals: { emerging: string[]; fading: string[] };
  summary: string;
}

const typeLabels: Record<string, string> = {
  pulse: "Quick Pulse",
  digest: "Daily Digest",
  deep_dive: "Weekly Deep Dive",
};

export default function Home() {
  const [data, setData] = useState<TrendData | null>(null);
  const [file, setFile] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [runningType, setRunningType] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string>("");

  const triggerRun = async (type: string) => {
    setRunningType(type);
    setRunMessage("");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setRunMessage("A pipeline is already running.");
      } else if (!res.ok) {
        setRunMessage(json.error || "Failed to start pipeline");
      } else {
        setRunMessage(`${typeLabels[type] || type} started!`);
      }
    } catch {
      setRunMessage("Connection error");
    }
    setTimeout(() => {
      setRunningType(null);
      setRunMessage("");
    }, 3000);
  };

  const fetchTrends = useCallback(async () => {
    try {
      const res = await fetch("/api/trends");
      if (res.status === 404) {
        setError("No trend data yet. Waiting for first webhook...");
        return;
      }
      if (!res.ok) {
        setError("Failed to fetch trends");
        return;
      }
      const json = await res.json();
      setData(json.data);
      setFile(json.file);
      setError("");
    } catch {
      setError("Connection error");
    }
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchTrends();
    const interval = setInterval(fetchTrends, 30_000);
    return () => clearInterval(interval);
  }, [fetchTrends]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">TrendClaw</h1>
            {data && (
              <p className="text-xs text-zinc-500 mt-1">
                {typeLabels[data.type] || data.type} &middot;{" "}
                {new Date(data.timestamp).toLocaleString()} &middot;{" "}
                <span className="text-zinc-600">{file}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/progress"
              className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Pipeline Status
            </Link>
            <span className="text-[10px] text-zinc-600">
              refreshed {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={fetchTrends}
              className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-zinc-300 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Run buttons */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-zinc-600 mr-1">Run:</span>
          {(["pulse", "digest", "deep_dive"] as const).map((type) => (
            <button
              key={type}
              onClick={() => triggerRun(type)}
              disabled={runningType !== null}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                type === "pulse"
                  ? "bg-blue-950/50 hover:bg-blue-900/50 border-blue-800/50 text-blue-300"
                  : type === "digest"
                    ? "bg-purple-950/50 hover:bg-purple-900/50 border-purple-800/50 text-purple-300"
                    : "bg-amber-950/50 hover:bg-amber-900/50 border-amber-800/50 text-amber-300"
              }`}
            >
              {runningType === type ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  Starting...
                </span>
              ) : (
                typeLabels[type]
              )}
            </button>
          ))}
          {runMessage && (
            <span className="text-xs text-zinc-400 ml-2">{runMessage}</span>
          )}
        </div>
      </header>

      {/* Error / Empty state */}
      {error && (
        <div className="text-center py-20">
          <p className="text-zinc-500 text-sm">{error}</p>
          <p className="text-zinc-600 text-xs mt-2">
            POST trend data to /api/trends to get started
          </p>
        </div>
      )}

      {/* Dashboard */}
      {data && (
        <>
          <DataQuality quality={data.data_quality} />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            <div>
              {data.categories.map((cat) => (
                <CategorySection key={cat.name} category={cat} />
              ))}
            </div>

            <TopMovers
              movers={data.top_movers}
              signals={data.signals}
              summary={data.summary}
            />
          </div>
        </>
      )}
    </main>
  );
}
