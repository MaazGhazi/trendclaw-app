export type RunType = "pulse" | "digest" | "deep_dive";

export interface ScrapedItem {
  title: string;
  url?: string;
  description?: string;
  score?: number;
  comments?: number;
  upvotes?: number;
  views?: number;
  growth?: string;
  priceChange?: string;
  volume?: string;
  marketCap?: string;
  rank?: number;
  stars?: number;
  language?: string;
  subreddit?: string;
  category?: string;
  publishedAt?: string;
  extra?: Record<string, unknown>;
}

export interface SourceResult {
  source: string;
  status: "ok" | "error" | "skipped";
  error?: string;
  items: ScrapedItem[];
  scrapedAt: string;
}

export interface CollectedData {
  runType: RunType;
  collectedAt: string;
  sources: SourceResult[];
  totalItems: number;
  failedSources: string[];
}

export interface SourceCollector {
  name: string;
  collect: (runType: RunType) => Promise<SourceResult>;
  /** Which run types this source should be included in */
  runTypes: RunType[];
}
