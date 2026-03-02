// Shared types and constants for TrendClaw dashboard

// --- Trend data types ---

export interface TrendData {
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

// --- Pipeline / progress types ---

export interface SourceAgent {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  items: number;
  duration_s?: number;
  size_b?: number;
}

export interface PipelineStep {
  status: "pending" | "running" | "completed" | "failed";
  duration_s?: number;
  detail?: string;
  sources?: SourceAgent[];
}

export interface ProgressData {
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

// --- History types ---

export interface HistoryRun {
  file: string;
  type: string;
  size: number;
  created: string;
  data_quality?: {
    sources_ok: number;
    total_items: number;
  };
}

// --- Constants ---

export const TYPE_LABELS: Record<string, string> = {
  pulse: "Quick Pulse",
  digest: "Daily Digest",
  deep_dive: "Weekly Deep Dive",
};

export const TYPE_COLORS: Record<string, string> = {
  pulse: "bg-blue-900/50 text-blue-300 border-blue-800",
  digest: "bg-purple-900/50 text-purple-300 border-purple-800",
  deep_dive: "bg-amber-900/50 text-amber-300 border-amber-800",
};

export const TYPE_BUTTON_COLORS: Record<string, string> = {
  pulse: "bg-blue-950/50 hover:bg-blue-900/50 border-blue-800/50 text-blue-300",
  digest: "bg-purple-950/50 hover:bg-purple-900/50 border-purple-800/50 text-purple-300",
  deep_dive: "bg-amber-950/50 hover:bg-amber-900/50 border-amber-800/50 text-amber-300",
};

export const STEP_NAMES: Record<string, string> = {
  scraper: "Scraper",
  split: "Split Sources",
  agents: "Source Agents",
  aggregation: "Aggregation",
  summary: "Summary Agent",
  memory: "Memory Write",
  webhook: "Webhook POST",
};

export const STEP_ORDER = [
  "scraper",
  "split",
  "agents",
  "aggregation",
  "summary",
  "memory",
  "webhook",
] as const;
