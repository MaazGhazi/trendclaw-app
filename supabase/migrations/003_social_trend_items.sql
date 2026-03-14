-- Social trend items: tracks scraped blog/newsletter trend items
-- Used by the scraper to know what's new vs recurring.
-- The agent uses isNew tags to highlight fresh trends.

CREATE TABLE social_trend_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text UNIQUE NOT NULL,           -- MD5(title|url)
  source text NOT NULL,                        -- e.g. "Later Trends", "SocialPilot Trends"
  title text NOT NULL,
  url text,
  platform text,                               -- "tiktok", "reels", "social"
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_trend_items_hash ON social_trend_items(content_hash);
CREATE INDEX idx_social_trend_items_last_seen ON social_trend_items(last_seen_at DESC);
CREATE INDEX idx_social_trend_items_platform ON social_trend_items(platform);

-- No RLS — this is backend-only data written with service role key.
-- The scraper is the only writer, and the agent reads via scraper output.

-- Cleanup: run periodically to remove stale items.
-- Example: DELETE FROM social_trend_items WHERE last_seen_at < now() - interval '30 days';
