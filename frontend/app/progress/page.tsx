"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface SourceAgent {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  items: number;
  duration_s?: number;
  size_b?: number;
}

interface PipelineStep {
  status: "pending" | "running" | "completed" | "failed";
  duration_s?: number;
  detail?: string;
  sources?: SourceAgent[];
}

interface ProgressData {
  run_id: string;
  type: string;
  started_at: string;
  status: "running" | "completed" | "failed";
  steps: {
    scraper: PipelineStep;
    split: PipelineStep;
    agents: PipelineStep;
    aggregation: PipelineStep;
    summary: PipelineStep;
    memory: PipelineStep;
    webhook: PipelineStep;
  };
}

const typeLabels: Record<string, string> = {
  pulse: "Quick Pulse",
  digest: "Daily Digest",
  deep_dive: "Weekly Deep Dive",
};

const typeBadgeColors: Record<string, string> = {
  pulse: "bg-blue-900/50 text-blue-300 border-blue-800",
  digest: "bg-purple-900/50 text-purple-300 border-purple-800",
  deep_dive: "bg-amber-900/50 text-amber-300 border-amber-800",
};

const stepNames: Record<string, string> = {
  scraper: "Scraper",
  split: "Split Sources",
  agents: "Source Agents",
  aggregation: "Aggregation",
  summary: "Summary Agent",
  memory: "Memory Write",
  webhook: "Webhook POST",
};

const stepOrder = [
  "scraper",
  "split",
  "agents",
  "aggregation",
  "summary",
  "memory",
  "webhook",
] as const;

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-900/50 text-emerald-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      );
    case "running":
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <span className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
        </span>
      );
    case "failed":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-900/50 text-red-400">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-zinc-600" />
        </span>
      );
  }
}

function SourceAgentCard({ source }: { source: SourceAgent }) {
  const statusColors: Record<string, string> = {
    completed: "border-emerald-800/50 bg-emerald-950/20",
    running: "border-blue-800/50 bg-blue-950/20",
    failed: "border-red-800/50 bg-red-950/20",
    pending: "border-zinc-800 bg-zinc-900/50",
  };

  return (
    <div
      className={`rounded-lg border p-3 ${statusColors[source.status] || statusColors.pending}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-200 truncate">
          {source.name}
        </span>
        <StatusIcon status={source.status} />
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>{source.items} items</span>
        {source.duration_s != null && (
          <span>{source.duration_s.toFixed(1)}s</span>
        )}
        {source.size_b != null && (
          <span>{(source.size_b / 1024).toFixed(1)}KB</span>
        )}
      </div>
    </div>
  );
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000
  );
  if (elapsed < 60) return `${elapsed}s`;
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return `${min}m ${sec}s`;
}

function totalDuration(steps: ProgressData["steps"]): string {
  let total = 0;
  for (const step of Object.values(steps)) {
    if (step.duration_s) total += step.duration_s;
  }
  return total > 0 ? `${total.toFixed(1)}s` : "";
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string>("");
  const [elapsed, setElapsed] = useState<string>("");
  const [runningType, setRunningType] = useState<string | null>(null);

  const triggerRun = async (type: string) => {
    setRunningType(type);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.status === 409) {
        setRunningType(null);
        return; // already running, the UI will show it
      }
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Failed to start pipeline");
        setRunningType(null);
      }
    } catch {
      alert("Connection error");
      setRunningType(null);
    }
    // Clear after a brief moment — the polling will pick up the new run
    setTimeout(() => setRunningType(null), 2000);
  };

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/progress");
      if (res.status === 404) {
        setError("No pipeline run data available.");
        setData(null);
        return;
      }
      if (!res.ok) {
        setError("Failed to fetch progress");
        return;
      }
      const json = await res.json();
      setData(json);
      setError("");
    } catch {
      setError("Connection error");
    }
  }, []);

  // Poll every 2 seconds
  useEffect(() => {
    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
  }, [fetchProgress]);

  // Update elapsed timer every second when running
  useEffect(() => {
    if (!data || data.status !== "running") {
      if (data?.started_at) {
        setElapsed(formatElapsed(data.started_at));
      }
      return;
    }
    const tick = () => setElapsed(formatElapsed(data.started_at));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data]);

  const overallStatusColor: Record<string, string> = {
    running: "text-blue-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-zinc-100">
              Pipeline Status
            </h1>
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium capitalize ${overallStatusColor[data.status] || "text-zinc-400"}`}
            >
              {data.status}
            </span>
          </div>
        )}
      </header>

      {/* Run buttons */}
      {(!data || data.status !== "running") && (
        <div className="flex items-center gap-2 mb-6">
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
        </div>
      )}

      {/* Error / Empty */}
      {error && !data && (
        <div className="text-center py-20">
          <p className="text-zinc-500 text-sm">{error}</p>
          <p className="text-zinc-600 text-xs mt-2">
            Click a button above to start a pipeline run.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-xs text-zinc-400 hover:text-zinc-200 underline"
          >
            Back to Dashboard
          </Link>
        </div>
      )}

      {/* Progress View */}
      {data && (
        <>
          {/* Run info bar */}
          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
            <span
              className={`text-xs px-2 py-0.5 rounded border font-medium ${typeBadgeColors[data.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
            >
              {typeLabels[data.type] || data.type}
            </span>
            <span className="text-xs text-zinc-500">
              Started{" "}
              {new Date(data.started_at).toLocaleTimeString()}
            </span>
            {elapsed && (
              <span className="text-xs text-zinc-400 font-mono">
                {elapsed}
              </span>
            )}
            {data.status !== "running" && (
              <span className="text-xs text-zinc-500 ml-auto">
                Total: {totalDuration(data.steps)}
              </span>
            )}
          </div>

          {/* Pipeline steps */}
          <div className="space-y-1">
            {stepOrder.map((key, idx) => {
              const step = data.steps[key];
              if (!step) return null;

              const isLast = idx === stepOrder.length - 1;

              return (
                <div key={key}>
                  <div className="flex items-start gap-3 py-2">
                    {/* Timeline line + icon */}
                    <div className="flex flex-col items-center pt-0.5">
                      <StatusIcon status={step.status} />
                      {!isLast && (
                        <div
                          className={`w-px flex-1 min-h-[16px] mt-1 ${
                            step.status === "completed"
                              ? "bg-zinc-700"
                              : "bg-zinc-800"
                          }`}
                        />
                      )}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm font-medium ${
                            step.status === "pending"
                              ? "text-zinc-500"
                              : "text-zinc-200"
                          }`}
                        >
                          {stepNames[key]}
                        </span>
                        {step.duration_s != null && (
                          <span className="text-xs text-zinc-500 font-mono">
                            {step.duration_s.toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {step.detail && (
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {step.detail}
                        </p>
                      )}

                      {/* Source agents grid */}
                      {key === "agents" &&
                        step.sources &&
                        step.sources.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                            {step.sources.map((src) => (
                              <SourceAgentCard
                                key={src.name}
                                source={src}
                              />
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
