"use client";

interface DataQualityInfo {
  sources_ok: number;
  sources_failed: string[];
  total_raw_items: number;
}

export default function DataQuality({ quality }: { quality: DataQualityInfo }) {
  const totalSources = quality.sources_ok + quality.sources_failed.length;
  const healthPct = Math.round((quality.sources_ok / totalSources) * 100);

  return (
    <div
      className={`rounded-lg p-3 mb-6 border ${
        quality.sources_failed.length === 0
          ? "bg-green-900/20 border-green-800/50"
          : quality.sources_failed.length <= 2
            ? "bg-yellow-900/20 border-yellow-800/50"
            : "bg-red-900/20 border-red-800/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">
            Sources: {quality.sources_ok}/{totalSources} OK
          </span>
          <span className="text-xs text-zinc-400">
            {quality.total_raw_items} raw items
          </span>
          <span className="text-xs text-zinc-500">{healthPct}% healthy</span>
        </div>
        {quality.sources_failed.length > 0 && (
          <div className="flex gap-1">
            {quality.sources_failed.map((src) => (
              <span
                key={src}
                className="text-[10px] px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded"
              >
                {src}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
