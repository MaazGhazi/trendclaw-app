-- Add user_id to trend_runs for per-user personalized results
ALTER TABLE trend_runs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Index for fast per-user lookups: "latest run for this user"
CREATE INDEX IF NOT EXISTS idx_trend_runs_user_lookup
  ON trend_runs(user_id, run_type, created_at DESC);

-- Drop old region-only RLS policy
DROP POLICY IF EXISTS "Users read runs for their region" ON trend_runs;

-- New RLS: users can only read their own runs
CREATE POLICY "Users read own runs" ON trend_runs
  FOR SELECT USING (user_id = auth.uid());

-- Pruning: keep last 20 runs per user per run_type (tighter since per-user)
CREATE OR REPLACE FUNCTION prune_trend_runs()
RETURNS void AS $$
BEGIN
  DELETE FROM trend_runs
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id, run_type ORDER BY created_at DESC
      ) as rn
      FROM trend_runs
    ) sub WHERE rn <= 20
  );
END;
$$ LANGUAGE plpgsql;
