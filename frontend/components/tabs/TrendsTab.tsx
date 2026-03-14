"use client";

import { useState } from "react";
import type { TrendData, FormatsData, FormatSource, FormatItem } from "@/lib/types";
import CategorySection from "@/components/CategorySection";
import type { ExpandSignal } from "@/components/CategorySection";
import DataQuality from "@/components/DataQuality";

// ─── Sub-section selector ───────────────────────────────────────

type SubSection = "formats" | "topics";

// ─── Platform badges ────────────────────────────────────────────

const PLATFORM_STYLES: Record<string, string> = {
  tiktok: "bg-pink-950/60 text-pink-300 border-pink-800/50",
  reels: "bg-purple-950/60 text-purple-300 border-purple-800/50",
  social: "bg-sky-950/60 text-sky-300 border-sky-800/50",
};

const SOURCE_BORDERS: Record<string, string> = {
  "Later Trends": "border-rose-500",
  "SocialPilot Trends": "border-emerald-500",
  "Quso Trends": "border-violet-500",
  "SocialBee Instagram Trends": "border-amber-500",
  "BlueBear Weekly Trends": "border-sky-500",
  "Ramdam Trends": "border-cyan-500",
};

const SOURCE_URLS: Record<string, string> = {
  "Later Trends": "later.com",
  "SocialPilot Trends": "socialpilot.co",
  "Quso Trends": "quso.ai",
  "SocialBee Instagram Trends": "socialbee.com",
  "BlueBear Weekly Trends": "bluebearcreative.co",
  "Ramdam Trends": "ramd.am",
};

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return null;
  const style = PLATFORM_STYLES[platform] ?? "bg-zinc-800 text-zinc-400 border-zinc-700";
  const label = platform === "reels" ? "Reels" : platform === "tiktok" ? "TikTok" : platform;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${style}`}>
      {label}
    </span>
  );
}

function NewBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-950/60 text-green-300 border-green-800/50 font-medium">
      NEW
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

// ─── Format Card ────────────────────────────────────────────────

function FormatCard({ item }: { item: FormatItem }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded px-3 py-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <PlatformBadge platform={item.platform} />
        {item.isNew && <NewBadge />}
        <span className="text-[10px] text-zinc-600">{timeAgo(item.firstSeenAt)}</span>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400/60 hover:text-blue-300 ml-auto"
          >
            source
          </a>
        )}
      </div>
      <p className="text-sm font-medium text-zinc-200 mt-1.5 leading-snug">{item.title}</p>
      {item.description && (
        <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed line-clamp-3">
          {item.description}
        </p>
      )}
    </div>
  );
}

// ─── Format Source Section ───────────────────────────────────────

function FormatSourceSection({ source }: { source: FormatSource }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const border = SOURCE_BORDERS[source.name] ?? "border-zinc-500";
  const domain = SOURCE_URLS[source.name] ?? "";
  const filtered = filter ? source.items.filter((i) => i.platform === filter) : source.items;

  return (
    <section className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 py-2 px-3 border-l-2 ${border} hover:bg-zinc-800/30 rounded-r transition-colors text-left`}
      >
        <svg
          className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-zinc-200">{source.name}</span>
        {domain && <span className="text-[10px] text-zinc-600">{domain}</span>}
        <div className="flex items-center gap-1 ml-auto">
          {source.platforms.map((p) => <PlatformBadge key={p} platform={p} />)}
          <span className="text-xs text-zinc-500 tabular-nums ml-1">{source.itemCount}</span>
        </div>
        {!open && source.items.length > 0 && (
          <span className="text-xs text-zinc-600 truncate hidden lg:inline max-w-xs">
            {source.items.slice(0, 2).map((t) => t.title).join(" · ")}
          </span>
        )}
      </button>
      {open && (
        <div className="ml-5 mt-1.5 mb-3">
          {source.platforms.length > 1 && (
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setFilter(null)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${filter === null ? "bg-zinc-700 text-zinc-200 border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}
              >
                All ({source.itemCount})
              </button>
              {source.platforms.map((p) => {
                const count = source.items.filter((i) => i.platform === p).length;
                return (
                  <button
                    key={p}
                    onClick={() => setFilter(filter === p ? null : p)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${filter === p ? "bg-zinc-700 text-zinc-200 border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}
                  >
                    {p === "reels" ? "Reels" : p === "tiktok" ? "TikTok" : p} ({count})
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {filtered.map((item) => <FormatCard key={item.title + item.platform} item={item} />)}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Formats Content ────────────────────────────────────────────

function FormatsContent({ data, loading }: { data: FormatsData | null; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-zinc-500 text-sm">Loading formats...</div>;
  }
  if (!data || data.sources.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 text-sm">
        No format data yet. Run a deep dive to collect social trend data.
      </div>
    );
  }
  const newCount = data.sources.reduce((s, src) => s + src.items.filter((i) => i.isNew).length, 0);
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 text-xs text-zinc-500">
        <span>{data.totalItems} formats</span>
        <span className="text-zinc-700">·</span>
        <span>{data.sources.length} sources</span>
        {newCount > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-green-400">{newCount} new this week</span>
          </>
        )}
      </div>
      {data.sources.map((source) => <FormatSourceSection key={source.name} source={source} />)}
    </div>
  );
}

// ─── Main TrendsTab ─────────────────────────────────────────────

interface TrendsTabProps {
  data: TrendData | null;
  error: string;
  viewingFile?: string | null;
  onBackToLatest?: () => void;
  formatsData?: FormatsData | null;
  formatsLoading?: boolean;
}

const directionStyle: Record<string, { icon: string; color: string }> = {
  up: { icon: "↑", color: "text-green-400" },
  down: { icon: "↓", color: "text-red-400" },
  new: { icon: "★", color: "text-purple-400" },
};

export default function TrendsTab({
  data,
  error,
  viewingFile,
  onBackToLatest,
  formatsData,
  formatsLoading,
}: TrendsTabProps) {
  const [expandCmd, setExpandCmd] = useState<ExpandSignal>({ open: false, v: 0 });
  const [section, setSection] = useState<SubSection>("formats");

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

  const totalTrends = data?.categories.reduce((sum, cat) => sum + cat.trends.length, 0) ?? 0;

  const handleToggleAll = () => {
    setExpandCmd((prev) => ({ open: !prev.open, v: prev.v + 1 }));
  };

  return (
    <>
      {/* Historical run banner */}
      {viewingFile && onBackToLatest && data && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <span className="text-xs text-zinc-400">
            Viewing:{" "}
            <span className="text-zinc-200 font-medium">
              {data.type} from{" "}
              {new Date(data.timestamp).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </span>
          </span>
          <button onClick={onBackToLatest} className="text-xs text-blue-400 hover:text-blue-300 underline">
            Back to Latest
          </button>
        </div>
      )}

      {data && <DataQuality quality={data.data_quality} />}

      {/* Summary + Movers */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
          <div className="lg:col-span-2 bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-3">
            <p className="text-xs text-zinc-400 leading-relaxed">{data.summary}</p>
          </div>
          <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-3">
            {data.top_movers.length > 0 && (
              <div className="space-y-1">
                {data.top_movers.slice(0, 5).map((m) => {
                  const s = directionStyle[m.direction] || directionStyle.new;
                  return (
                    <div key={m.title} className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono ${s.color}`}>{s.icon}</span>
                      <span className="text-xs text-zinc-300 truncate">{m.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {data.signals.emerging.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-700/30">
                <div className="flex flex-wrap gap-1">
                  {data.signals.emerging.map((s) => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {data.signals.fading.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-700/30">
                <div className="flex flex-wrap gap-1">
                  {data.signals.fading.map((s) => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {data.top_movers.length === 0 && data.signals.emerging.length === 0 && data.signals.fading.length === 0 && (
              <p className="text-xs text-zinc-600">No movers or signals</p>
            )}
          </div>
        </div>
      )}

      {/* ── Sub-section toggle: Formats | Topics ── */}
      <div className="flex items-center gap-1 mb-4 border-b border-zinc-800/50">
        <button
          onClick={() => setSection("formats")}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            section === "formats"
              ? "text-pink-300 border-b-2 border-pink-500"
              : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"
          }`}
        >
          Formats
          {formatsData && formatsData.totalItems > 0 && (
            <span className="ml-1.5 text-[10px] text-zinc-500">{formatsData.totalItems}</span>
          )}
        </button>
        <button
          onClick={() => setSection("topics")}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            section === "topics"
              ? "text-blue-300 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"
          }`}
        >
          Topics
          {totalTrends > 0 && (
            <span className="ml-1.5 text-[10px] text-zinc-500">{totalTrends}</span>
          )}
        </button>
      </div>

      {/* ── Formats section ── */}
      {section === "formats" && (
        <FormatsContent data={formatsData ?? null} loading={formatsLoading ?? false} />
      )}

      {/* ── Topics section ── */}
      {section === "topics" && data && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">
              {totalTrends} trend{totalTrends !== 1 ? "s" : ""} across{" "}
              {data.categories.length} source{data.categories.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={handleToggleAll}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {expandCmd.open ? "Collapse all" : "Expand all"}
            </button>
          </div>
          <div>
            {data.categories.map((cat) => (
              <CategorySection key={cat.name} category={cat} expandSignal={expandCmd} />
            ))}
          </div>
        </>
      )}

      {section === "topics" && !data && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          No topic data yet. Run a scrape to collect trend data.
        </div>
      )}
    </>
  );
}
