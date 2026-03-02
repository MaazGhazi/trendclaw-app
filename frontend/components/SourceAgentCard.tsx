import type { SourceAgent } from "@/lib/types";
import StatusIcon from "./StatusIcon";

const statusColors: Record<string, string> = {
  completed: "border-emerald-800/50 bg-emerald-950/20",
  running: "border-blue-800/50 bg-blue-950/20",
  failed: "border-red-800/50 bg-red-950/20",
  pending: "border-zinc-800 bg-zinc-900/50",
};

export default function SourceAgentCard({ source }: { source: SourceAgent }) {
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
