export type SignalType =
  | "executive_change"
  | "funding"
  | "hiring"
  | "product_launch"
  | "expansion"
  | "partnership"
  | "social_posts"
  | "news_mentions"
  | "awards"
  | "events"
  | "trending_topic";

export type Client = {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  customUrls: string[];
  industry: string | null;
  keywords: string[];
  monitorSignals: string[];
  isActive: boolean;
  cronJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Signal = {
  id: string;
  type: SignalType;
  title: string;
  summary: string;
  sourceUrl: string | null;
  sourceName: string | null;
  confidence: number;
  detectedAt: string;
  client?: { id: string; name: string } | null;
};

export type Report = {
  id: string;
  title: string;
  reportDate: string;
  status: string;
  signalCount: number;
  generatedAt: string | null;
  createdAt: string;
  content?: unknown;
};

export type DashboardStats = {
  clientCount: number;
  activeClientCount: number;
  signalCountToday: number;
  signalCountTotal: number;
  latestReport: Report | null;
  recentSignals: Signal[];
};
