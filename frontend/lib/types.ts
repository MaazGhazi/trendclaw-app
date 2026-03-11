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

export interface SourceDetail {
  name: string;
  status: "ok" | "error" | "skipped";
  items: number;
}

export interface ScrapingStep {
  status: "pending" | "running" | "completed";
  total: number;
  completed: number;
  done_jobs?: string[];
  source_details?: Record<string, SourceDetail[]>;
  duration_s?: number;
  detail?: string;
}

export interface UsersStep {
  status: "pending" | "running" | "completed";
  total: number;
  completed: number;
  current_step?: "merging" | "analyzing" | "summarizing" | "storing";
}

export interface ProgressData {
  run_id: string;
  type: string;
  started_at: string;
  status: "running" | "completed" | "failed";
  current_user?: string;
  steps: {
    scraping: ScrapingStep;
    users: UsersStep;
  };
}

// Legacy types (kept for backward compat if old progress data appears)
export interface SourceAgent {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  items: number;
  duration_s?: number;
  size_b?: number;
}

// --- Queue / Job types ---

export interface QueuedJob {
  id: string;
  type: string;
  queued_at: string;
  queued_by?: string;
}

export interface CompletedJob {
  id: string;
  type: string;
  started_at: string;
  completed_at: string;
  duration_s: number;
  status: "completed" | "failed";
}

export interface RunningJob {
  id: string;
  type: string;
  pid: number;
  started_at: string;
}

export interface QueueData {
  running: RunningJob | null;
  queued: QueuedJob[];
  completed: CompletedJob[];
}

// --- History types ---

export interface HistoryRun {
  file: string;
  type: string;
  size?: number;
  region?: string;
  created: string;
  failed?: boolean;
  data_quality?: {
    sources_ok: number;
    total_items: number;
    trend_count: number;
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
  scraping: "Parallel Scraping",
  users: "AI Enrichment",
};

export const USER_STEP_LABELS: Record<string, string> = {
  merging: "Merging source data",
  analyzing: "AI analyzing trends",
  summarizing: "Generating summary",
  storing: "Saving results",
};

export const USER_STEP_ORDER = ["merging", "analyzing", "summarizing", "storing"] as const;
