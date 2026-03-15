// Shared types and constants for TrendClaw dashboard

// --- Trend data types ---

export interface OrchestrationMeta {
  scale: "normal" | "massive";
  niche_match: "direct" | "adjacent" | "none";
  confidence: number;
  suggested_angle: string | null;
  reasoning: string;
}

export interface TrendItem {
  title: string;
  description: string;
  why_trending: string;
  momentum: string;
  popularity: { score: number; metric: string; reach: string };
  sources: string[];
  urls: string[];
  first_seen: string | null;
  relevance: string;
  orchestration?: OrchestrationMeta;
}

export interface GeneralViewTrend {
  title: string;
  description: string;
  why_trending: string;
  popularity: { score: number; metric: string; reach: string };
  sources: string[];
  urls: string[];
  momentum: string;
  relevance_to_user: string;
  suggested_angle: string | null;
}

// --- Bridging agent types ---

export type BriefOutputType = "full_brief" | "angle_only" | "participation" | "opportunity_flag" | "watch_signal";

export interface BriefContent {
  hook?: string;
  angle?: string;
  why_now?: string;
  timing_window?: string;
  lifecycle_stage?: "emerging" | "growing" | "peak" | "saturated";
  saturation?: "low" | "medium" | "high";
  how_to_apply?: string;
  signal?: string;
  confidence: number;
}

export interface FormatMatch {
  name: string;
  description: string;
  platform?: string;
}

export interface SoundMatch {
  name: string;
  plays: number;
  artist?: string;
}

export interface CuratedBrief {
  output_type: BriefOutputType;
  trend?: TrendItem | null;
  format?: FormatMatch | null;
  sound?: SoundMatch | null;
  brief: BriefContent;
}

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
    trends: TrendItem[];
  }[];
  niche_view?: {
    direct: TrendItem[];
    adjacent: TrendItem[];
  };
  general_view?: GeneralViewTrend[];
  filtered_count?: number;
  curated_view?: CuratedBrief[];
  participation?: CuratedBrief[];
  watch_signals?: CuratedBrief[];
  raw_view?: {
    topics: { title: string; description: string; score: number; momentum: string; sources: string[] }[];
    formats: { title: string; description: string; platform?: string; isNew: boolean }[];
    sounds: { title: string; plays: number; artist?: string }[];
  };
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
  current_step?: "merging" | "analyzing" | "scoring" | "personalizing" | "briefing" | "summarizing" | "storing";
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

// --- Formats (social trend blog items from Supabase) ---

export interface FormatItem {
  title: string;
  url: string | null;
  description: string | null;
  platform: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew: boolean;
}

export interface FormatSource {
  name: string;
  platforms: string[];
  itemCount: number;
  items: FormatItem[];
}

export interface FormatsData {
  sources: FormatSource[];
  totalItems: number;
  updatedAt: string;
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
  scoring: "Scoring trends",
  personalizing: "Personalizing trends",
  briefing: "Generating content briefs",
  summarizing: "Generating summary",
  storing: "Saving results",
};

export const USER_STEP_ORDER = ["merging", "analyzing", "scoring", "personalizing", "briefing", "summarizing", "storing"] as const;
