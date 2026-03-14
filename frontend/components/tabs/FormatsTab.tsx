"use client";

import { useState } from "react";
import type { FormatsData, FormatSource, FormatItem } from "@/lib/types";

// ─── Platform badge colors ──────────────────────────────────────

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
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="bg-zinc-900/50 border border-zinc-800/50 rounded px-3 py-2 hover:bg-zinc-800/30 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PlatformBadge platform={item.platform} />
            {item.isNew && <NewBadge />}
            <span className="text-[10px] text-zinc-600">
              {timeAgo(item.firstSeenAt)}
            </span>
          </div>
          <p className="text-sm text-zinc-200 mt-1 leading-snug">
            {item.title}
          </p>
        </div>
      </div>

      {expanded && item.description && (
        <p className="text-xs text-zinc-400 mt-2 leading-relaxed border-t border-zinc-800/50 pt-2">
          {item.description}
        </p>
      )}

      {expanded && item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-block text-[10px] text-blue-400 hover:text-blue-300 mt-1.5"
        >
          View source
        </a>
      )}
    </div>
  );
}

// ─── Source Section ─────────────────────────────────────────────

function SourceSection({ source }: { source: FormatSource }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const border = SOURCE_BORDERS[source.name] ?? "border-zinc-500";
  const domain = SOURCE_URLS[source.name] ?? "";

  const filtered = filter
    ? source.items.filter((i) => i.platform === filter)
    : source.items;

  return (
    <section className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 py-2 px-3 border-l-2 ${border} hover:bg-zinc-800/30 rounded-r transition-colors text-left`}
      >
        <svg
          className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <span className="text-sm font-semibold text-zinc-200">{source.name}</span>

        {domain && (
          <span className="text-[10px] text-zinc-600">{domain}</span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {source.platforms.map((p) => (
            <PlatformBadge key={p} platform={p} />
          ))}
          <span className="text-xs text-zinc-500 tabular-nums ml-1">
            {source.itemCount}
          </span>
        </div>

        {!open && source.items.length > 0 && (
          <span className="text-xs text-zinc-600 truncate hidden lg:inline max-w-xs">
            {source.items.slice(0, 2).map((t) => t.title).join(" · ")}
          </span>
        )}
      </button>

      {open && (
        <div className="ml-5 mt-1.5 mb-3">
          {/* Platform filter pills */}
          {source.platforms.length > 1 && (
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setFilter(null)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  filter === null
                    ? "bg-zinc-700 text-zinc-200 border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                }`}
              >
                All ({source.itemCount})
              </button>
              {source.platforms.map((p) => {
                const count = source.items.filter((i) => i.platform === p).length;
                return (
                  <button
                    key={p}
                    onClick={() => setFilter(filter === p ? null : p)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      filter === p
                        ? "bg-zinc-700 text-zinc-200 border-zinc-600"
                        : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    {p === "reels" ? "Reels" : p === "tiktok" ? "TikTok" : p} ({count})
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
            {filtered.map((item) => (
              <FormatCard key={item.title + item.platform} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Formats Tab ────────────────────────────────────────────────

interface FormatsTabProps {
  data: FormatsData | null;
  loading: boolean;
  error: string;
}

export default function FormatsTab({ data, loading, error }: FormatsTabProps) {
  if (loading) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        Loading formats...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 text-red-400 text-sm">
        Failed to load formats: {error}
      </div>
    );
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        No format data yet. Run a deep_dive scrape to collect social trend data.
      </div>
    );
  }

  const newCount = data.sources.reduce(
    (sum, s) => sum + s.items.filter((i) => i.isNew).length,
    0,
  );

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 text-xs text-zinc-500">
        <span>{data.totalItems} formats tracked</span>
        <span className="text-zinc-700">|</span>
        <span>{data.sources.length} sources</span>
        {newCount > 0 && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="text-green-400">{newCount} new this week</span>
          </>
        )}
      </div>

      {/* Source sections */}
      {data.sources.map((source) => (
        <SourceSection key={source.name} source={source} />
      ))}
    </div>
  );
}
