export type SignalTypeKey =
  | "executive_change"
  | "funding"
  | "hiring"
  | "product_launch"
  | "expansion"
  | "partnership"
  | "social_posts"
  | "news_mentions"
  | "awards"
  | "events";

export interface SignalTypeDefinition {
  label: string;
  description: string;
  promptFragment: string;
}

export const SIGNAL_TYPES: Record<SignalTypeKey, SignalTypeDefinition> = {
  executive_change: {
    label: "Executive Changes",
    description: "New hires, departures, promotions (C-suite/VP)",
    promptFragment: "**Executive changes** — new hires, departures, promotions (especially C-suite/VP level)",
  },
  funding: {
    label: "Funding Events",
    description: "Fundraising announcements, investment rounds",
    promptFragment: "**Funding events** — fundraising announcements, investment rounds",
  },
  hiring: {
    label: "Hiring Activity",
    description: "Significant hiring activity, team expansions",
    promptFragment: "**Hiring activity** — significant hiring posts, new team expansions",
  },
  product_launch: {
    label: "Product Launches",
    description: "New products, features, services",
    promptFragment: "**Product launches** — new products, features, or services announced",
  },
  expansion: {
    label: "Expansion",
    description: "New offices, markets, geographic growth",
    promptFragment: "**Expansion** — new offices, markets, or geographic expansion",
  },
  partnership: {
    label: "Partnerships",
    description: "Strategic partnerships, integrations",
    promptFragment: "**Partnerships** — strategic partnerships, integrations, collaborations",
  },
  social_posts: {
    label: "Social Media Posts",
    description: "Recent social media posts and content activity",
    promptFragment: "**Social media posts** — recent posts, content activity, engagement trends",
  },
  news_mentions: {
    label: "News & Media",
    description: "Press coverage, news articles, media mentions",
    promptFragment: "**News mentions** — press coverage, news articles, media mentions",
  },
  awards: {
    label: "Awards & Recognition",
    description: "Awards, rankings, certifications",
    promptFragment: "**Awards** — awards, rankings, certifications, recognitions",
  },
  events: {
    label: "Events",
    description: "Conference appearances, webinars, speaking engagements",
    promptFragment: "**Events** — conference appearances, webinars, speaking engagements",
  },
};

export const ALL_SIGNAL_TYPE_KEYS = Object.keys(SIGNAL_TYPES) as SignalTypeKey[];
