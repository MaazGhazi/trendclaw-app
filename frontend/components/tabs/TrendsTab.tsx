"use client";

import type { TrendData } from "@/lib/types";
import CategorySection from "@/components/CategorySection";
import DataQuality from "@/components/DataQuality";
import TopMovers from "@/components/TopMovers";

interface TrendsTabProps {
  data: TrendData | null;
  error: string;
  viewingFile?: string | null;
  onBackToLatest?: () => void;
}

export default function TrendsTab({
  data,
  error,
  viewingFile,
  onBackToLatest,
}: TrendsTabProps) {
  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-500 text-sm">{error}</p>
        <p className="text-zinc-600 text-xs mt-2">
          POST trend data to /api/trends to get started
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {/* Historical run banner */}
      {viewingFile && onBackToLatest && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <span className="text-xs text-zinc-400">
            Viewing:{" "}
            <span className="text-zinc-200 font-medium">
              {data.type} from{" "}
              {new Date(data.timestamp).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </span>
          <button
            onClick={onBackToLatest}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Back to Latest
          </button>
        </div>
      )}

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
  );
}
