-- Create trend_runs table for per-region trend storage
CREATE TABLE IF NOT EXISTS trend_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL DEFAULT 'US',
  run_type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups: "latest pulse for US"
CREATE INDEX idx_trend_runs_lookup
  ON trend_runs(region, run_type, created_at DESC);

-- RLS: any authenticated user can read runs matching their profile region
ALTER TABLE trend_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read runs for their region" ON trend_runs
  FOR SELECT USING (
    region = (SELECT region FROM profiles WHERE user_id = auth.uid())
  );

-- Service role (pipeline) can insert anything (bypasses RLS automatically)
-- No INSERT policy needed — service role key skips RLS

-- Pruning function: keep only the last 50 runs per region per run_type
CREATE OR REPLACE FUNCTION prune_trend_runs()
RETURNS void AS $$
BEGIN
  DELETE FROM trend_runs
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY region, run_type ORDER BY created_at DESC) as rn
      FROM trend_runs
    ) sub WHERE rn <= 50
  );
END;
$$ LANGUAGE plpgsql;
