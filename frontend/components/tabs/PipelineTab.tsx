"use client";

import type { ProgressData, HistoryRun } from "@/lib/types";
import { TYPE_LABELS, TYPE_COLORS, STEP_NAMES, STEP_ORDER } from "@/lib/types";
import { totalDuration } from "@/lib/hooks";
import StatusIcon from "@/components/StatusIcon";
import SourceAgentCard from "@/components/SourceAgentCard";

interface PipelineTabProps {
  progress: ProgressData | null;
  progressError: string;
  elapsed: string;
  recentRuns: HistoryRun[];
  onViewRun: (file: string) => void;
}

const overallStatusColor: Record<string, string> = {
  running: "text-blue-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
};

export default function PipelineTab({
  progress,
  progressError,
  elapsed,
  recentRuns,
  onViewRun,
}: PipelineTabProps) {
  return (
    <div className="space-y-8">
      {/* Current / last pipeline run */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          {progress?.status === "running" ? "Current Run" : "Last Run"}
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
            {/* Run info bar */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <span
                className={`text-xs px-2 py-0.5 rounded border font-medium ${TYPE_COLORS[progress.type] || "bg-zinc-800 text-zinc-300 border-zinc-700"}`}
              >
                {TYPE_LABELS[progress.type] || progress.type}
              </span>
              <span className="text-xs text-zinc-500">
                Started {new Date(progress.started_at).toLocaleTimeString()}
              </span>
              {elapsed && (
                <span className="text-xs text-zinc-400 font-mono">{elapsed}</span>
              )}
              <span
                className={`text-xs font-medium capitalize ml-auto ${overallStatusColor[progress.status] || "text-zinc-400"}`}
              >
                {progress.status}
              </span>
              {progress.status !== "running" && (
                <span className="text-xs text-zinc-500">
                  Total: {totalDuration(progress.steps)}
                </span>
              )}
            </div>

            {/* Pipeline steps timeline */}
            <div className="space-y-1">
              {STEP_ORDER.map((key, idx) => {
                const step = progress.steps[key];
                if (!step) return null;
                const isLast = idx === STEP_ORDER.length - 1;

                return (
                  <div key={key}>
                    <div className="flex items-start gap-3 py-2">
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-sm font-medium ${
                              step.status === "pending"
                                ? "text-zinc-500"
                                : "text-zinc-200"
                            }`}
                          >
                            {STEP_NAMES[key]}
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
                                <SourceAgentCard key={src.name} source={src} />
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
      </section>

      {/* Recent Runs table */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Recent Runs
        </h2>
        {recentRuns.length === 0 ? (
          <p className="text-xs text-zinc-600">No runs yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-900/50">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Time</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Items</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Size</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentRuns.slice(0, 10).map((run) => (
                  <tr
                    key={run.file}
                    className="hover:bg-zinc-800/30 transition-colors"
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
                      {run.data_quality?.total_items ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {(run.size / 1024).toFixed(1)}KB
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => onViewRun(run.file)}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        View
                      </button>
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
