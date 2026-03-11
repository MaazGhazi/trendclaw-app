"use client";

import { useState, useEffect } from "react";
import type { ProgressData, HistoryRun, QueueData, SourceDetail } from "@/lib/types";
import { TYPE_LABELS, TYPE_COLORS, USER_STEP_LABELS, USER_STEP_ORDER } from "@/lib/types";
import { formatAge } from "@/lib/hooks";
import StatusIcon from "@/components/StatusIcon";

interface PipelineTabProps {
  progress: ProgressData | null;
  progressError: string;
  elapsed: string;
  queueData: QueueData | null;
  recentRuns: HistoryRun[];
  onViewRun: (file: string) => void;
}

const overallStatusColor: Record<string, string> = {
  running: "text-blue-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
};

function formatJobName(name: string): string {
  if (name === "global") return "Global Sources";
  if (name.startsWith("region-")) return `Region: ${name.replace("region-", "")}`;
  if (name.startsWith("topic-")) {
    const id = name.replace("topic-", "");
    return id.length > 12 ? `Topic: ${id.slice(0, 8)}...` : `Topic: ${id}`;
  }
  return name;
}

function jobTypeIcon(name: string): string {
  if (name === "global") return "🌐";
  if (name.startsWith("region-")) return "📍";
  if (name.startsWith("topic-")) return "🎯";
  return "📦";
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function PipelineTab({
  progress,
  progressError,
  elapsed,
  queueData,
  recentRuns,
  onViewRun,
}: PipelineTabProps) {
  // Real-time tick for live timers
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (progress?.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [progress?.status]);

  const scraping = progress?.steps?.scraping;
  const users = progress?.steps?.users;
  const isRunning = progress?.status === "running";

  // When the overall pipeline is completed, treat scraping as fully done
  // (fixes race condition where monitor was killed before reading all markers)
  const scrapeCompleted = progress?.status === "completed"
    ? (scraping?.total || 0)
    : (scraping?.completed || 0);
  const scrapePercent =
    scraping && scraping.total > 0
      ? Math.round((scrapeCompleted / scraping.total) * 100)
      : 0;

  // Live elapsed time (ticks every second when running)
  const liveElapsed = isRunning && progress?.started_at
    ? formatDuration(now - new Date(progress.started_at).getTime())
    : elapsed;

  // Live scraping duration (ticks when scraping is active, shows final duration_s when done)
  const liveScrapeTime = scraping?.status === "running" && progress?.started_at
    ? ((now - new Date(progress.started_at).getTime()) / 1000).toFixed(1) + "s"
    : scraping?.duration_s != null
      ? scraping.duration_s.toFixed(1) + "s"
      : null;

  // Build job list: done + remaining
  const doneJobs = scraping?.done_jobs || [];
  const allJobCount = scraping?.total || 0;
  // When pipeline completed, no jobs are pending (even if some markers were missed)
  const pendingCount = progress?.status === "completed"
    ? 0
    : allJobCount - doneJobs.length;

  return (
    <div className="space-y-8">
      {/* ─── Pipeline Status Header ─── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          {progress?.status === "running" ? "Pipeline Active" : "Pipeline Status"}
        </h2>

        {progressError && !progress && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">{progressError}</p>
            <p className="text-zinc-600 text-xs mt-2">
              Click a Run button above to start a pipeline.
            </p>
          </div>
        )}

        {progress && (
          <>
            {/* Status bar */}
            <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <span
                className={`text-xs px-2 py-0.5 rounded border font-medium ${TYPE_COLORS[progress.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
              >
                {TYPE_LABELS[progress.type] || progress.type}
              </span>
              <span className="text-xs text-zinc-500">
                Started {new Date(progress.started_at).toLocaleTimeString()}
              </span>
              {liveElapsed && (
                <span className="text-xs text-zinc-400 font-mono">{liveElapsed}</span>
              )}
              <span
                className={`text-xs font-medium capitalize ml-auto ${overallStatusColor[progress.status] || "text-zinc-400"}`}
              >
                {progress.status === "running" && (
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse mr-1.5 align-middle" />
                )}
                {progress.status}
              </span>
            </div>

            {/* ─── Scraping Phase ─── */}
            <div className="rounded-lg border border-zinc-800 overflow-hidden mb-6">
              {/* Scraping header */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <StatusIcon status={scraping?.status || "pending"} />
                  <span className="text-sm font-medium text-zinc-200">
                    Parallel Scraping
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 font-mono">
                    {scrapeCompleted}/{allJobCount} jobs
                  </span>
                  {liveScrapeTime && (
                    <span className="text-xs text-zinc-500 font-mono">
                      {liveScrapeTime}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-blue-500 to-emerald-500"
                      style={{ width: `${scrapePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-600">
                    <span>{scrapePercent}%</span>
                    <span>
                      {scraping?.status === "completed"
                        ? "All scrapes complete"
                        : `${pendingCount} job${pendingCount !== 1 ? "s" : ""} in progress`}
                    </span>
                  </div>
                </div>

                {/* Job cards with per-source details */}
                {allJobCount > 0 && (
                  <div className="space-y-2">
                    {/* Completed jobs — expanded with sources */}
                    {doneJobs.map((job) => {
                      const sources: SourceDetail[] = scraping?.source_details?.[job] || [];
                      const okCount = sources.filter((s) => s.status === "ok").length;
                      const totalItems = sources.reduce((sum, s) => sum + s.items, 0);
                      return (
                        <div
                          key={job}
                          className="rounded-lg border border-emerald-800/40 bg-emerald-950/10 overflow-hidden"
                        >
                          {/* Job header */}
                          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/20">
                            <StatusIcon status="completed" />
                            <span className="text-xs font-medium text-zinc-200">
                              {jobTypeIcon(job)} {formatJobName(job)}
                            </span>
                            {sources.length > 0 && (
                              <span className="text-[10px] text-zinc-500 ml-auto">
                                {okCount}/{sources.length} sources &middot; {totalItems} items
                              </span>
                            )}
                          </div>
                          {/* Per-source breakdown */}
                          {sources.length > 0 && (
                            <div className="px-3 py-2 flex flex-wrap gap-1.5">
                              {sources.map((src) => (
                                <span
                                  key={src.name}
                                  className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                                    src.status === "ok"
                                      ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300"
                                      : src.status === "skipped"
                                        ? "border-zinc-700/50 bg-zinc-900/30 text-zinc-500"
                                        : "border-red-800/50 bg-red-950/30 text-red-300"
                                  }`}
                                >
                                  <span>{src.status === "ok" ? "✓" : src.status === "skipped" ? "–" : "✗"}</span>
                                  <span>{src.name}</span>
                                  {src.status === "ok" && src.items > 0 && (
                                    <span className="text-emerald-500">{src.items}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Remaining jobs (running) */}
                    {Array.from({ length: pendingCount }).map((_, i) => (
                      <div
                        key={`pending-${i}`}
                        className="flex items-center gap-2 rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-2"
                      >
                        <StatusIcon status="running" />
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-zinc-300">
                            Scraping...
                          </span>
                          <span className="text-[10px] text-zinc-500 ml-2">
                            in progress
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ─── AI Enrichment Phase ─── */}
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              {/* AI header */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <StatusIcon status={users?.status || "pending"} />
                  <span className="text-sm font-medium text-zinc-200">
                    AI Enrichment
                  </span>
                </div>
                <span className="text-xs text-zinc-400 font-mono">
                  {users?.completed || 0}/{users?.total || 0} user{(users?.total || 0) !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-4">
                {users?.status === "pending" && (
                  <p className="text-xs text-zinc-600">
                    Waiting for scraping to complete...
                  </p>
                )}

                {users?.status === "running" && (
                  <div className="space-y-4">
                    {/* Current user */}
                    {progress.current_user && (
                      <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <span className="text-zinc-500">Processing:</span>
                        <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded">
                          {progress.current_user.length > 20
                            ? `${progress.current_user.slice(0, 8)}...`
                            : progress.current_user}
                        </span>
                      </div>
                    )}

                    {/* Step progression */}
                    <div className="flex items-center gap-1">
                      {USER_STEP_ORDER.map((step, idx) => {
                        const isCurrent = users.current_step === step;
                        const currentIdx = USER_STEP_ORDER.indexOf(
                          users.current_step || "merging"
                        );
                        const isDone = idx < currentIdx;

                        return (
                          <div key={step} className="flex items-center gap-1 flex-1">
                            <div
                              className={`flex-1 rounded-md px-2.5 py-2 text-center text-[10px] font-medium transition-colors ${
                                isCurrent
                                  ? "bg-blue-900/50 text-blue-300 border border-blue-700"
                                  : isDone
                                    ? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/40"
                                    : "bg-zinc-900 text-zinc-600 border border-zinc-800"
                              }`}
                            >
                              {isCurrent && (
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse mr-1 align-middle" />
                              )}
                              {isDone && (
                                <span className="text-emerald-400 mr-1">✓</span>
                              )}
                              {USER_STEP_LABELS[step]?.split(" ").slice(0, 2).join(" ") || step}
                            </div>
                            {idx < USER_STEP_ORDER.length - 1 && (
                              <span
                                className={`text-[10px] ${
                                  isDone ? "text-emerald-700" : "text-zinc-700"
                                }`}
                              >
                                →
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {users?.status === "completed" && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <StatusIcon status="completed" />
                    All {users.total} user{users.total !== 1 ? "s" : ""} enriched
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ─── Job Queue ─── */}
      {queueData && queueData.queued.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Queue ({queueData.queued.length} waiting)
          </h2>
          <div className="space-y-2">
            {queueData.queued.map((job, idx) => (
              <div
                key={job.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800"
              >
                <span className="text-xs font-mono text-zinc-600 w-6">
                  #{idx + 1}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-medium ${TYPE_COLORS[job.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
                >
                  {TYPE_LABELS[job.type] || job.type}
                </span>
                <span className="text-xs text-zinc-500">
                  queued {formatAge(job.queued_at)}
                </span>
                {job.queued_by && (
                  <span className="text-xs text-zinc-600 font-mono">
                    by {job.queued_by.slice(0, 8)}...
                  </span>
                )}
                <span className="ml-auto">
                  <span className="flex h-5 w-5 items-center justify-center">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-zinc-600" />
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Completed Jobs ─── */}
      {queueData && queueData.completed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Completed Jobs
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-900/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Started</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {queueData.completed.slice(0, 15).map((job) => (
                  <tr key={job.id} className="hover:bg-zinc-800/30">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TYPE_COLORS[job.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
                      >
                        {TYPE_LABELS[job.type] || job.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {new Date(job.started_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-400 font-mono">
                      {job.duration_s < 60
                        ? `${job.duration_s}s`
                        : `${Math.floor(job.duration_s / 60)}m ${job.duration_s % 60}s`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`text-xs font-medium ${
                          job.status === "completed"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Recent Runs (Trend Data) ─── */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Recent Runs (Trend Data)
        </h2>
        {recentRuns.filter((r) => !r.failed).length === 0 ? (
          <p className="text-xs text-zinc-600">No runs yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-900/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Time</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Trends</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Sources</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentRuns
                  .filter((r) => !r.failed)
                  .slice(0, 10)
                  .map((run) => (
                    <tr
                      key={run.file}
                      className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => onViewRun(run.file)}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${TYPE_COLORS[run.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
                        >
                          {TYPE_LABELS[run.type] || run.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {new Date(run.created).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400">
                        {run.data_quality?.trend_count ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-500">
                        {run.data_quality?.sources_ok ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-blue-400 hover:text-blue-300">
                          View
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
