 TrendClaw Scoring Agent — Design Reference

 Why This Exists

 The current pipeline has two critical scoring problems:

 1. AI scores are meaningless. GPT-4o-mini is asked to score items 0-100 but has no reference frame. A 7-point HN post and a
 762-point HN post both get score 100. The fallback log_score() function uses a raw log10 formula that treats 200 HN points the
 same as 200 TikTok views — completely different scales.
 2. No cross-platform detection. "Qatar helium shutdown threatens chip supply" appearing on HN (329 pts), Reddit, and TechCrunch
 RSS shows as 3 separate trend items. A topic that hits multiple platforms simultaneously is a much stronger signal than one
 that's only on a single source — but currently there's no way to know.

 The scoring agent fixes both by replacing guessed scores with signal-based scores and merging cross-platform duplicates.

 ---
 Where It Fits in the Pipeline

 BEFORE:
   Scraper → Per-source AI Agents (GPT-4o-mini) → Aggregate + Summary → Store

 AFTER:
   Scraper → Per-source AI Agents (GPT-4o-mini) → SCORING AGENT → Summary → Store
                                                    ^^^^^^^^^^^^^^
                                                    New step here

 The scoring agent runs AFTER AI enrichment (so it has why_trending, description, relevance from GPT) but BEFORE the summary
 agent. It is the authority on scores — the AI agents still provide qualitative analysis, but the scoring agent owns the numbers.

 ---
 How Scoring Works

 Step 1: Source-Normalized Scoring

 Every source has a different engagement scale. The scoring agent knows what "good" looks like for each source via hardcoded
 percentile tables:

 ┌─────────────────┬────────────────────────┬────────────────────────────┬──────┬──────┬───────┬───────┐
 │     Source      │     Primary Metric     │            p25             │ p50  │ p75  │  p90  │  p99  │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ Hacker News     │ score (points)         │ 30                         │ 80   │ 200  │ 500   │ 1,500 │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ Lobsters        │ score                  │ 5                          │ 15   │ 30   │ 60    │ 120   │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ Dev.to          │ score (reactions)      │ 10                         │ 30   │ 80   │ 200   │ 500   │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ GitHub Trending │ extra.todayStars       │ 50                         │ 150  │ 500  │ 1,500 │ 5,000 │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ CoinGecko       │ rank (inverted)        │ special rank-based mapping │      │      │       │       │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ TikTok          │ views                  │ 10K                        │ 100K │ 1M   │ 10M   │ 100M  │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ YouTube         │ views                  │ 5K                         │ 50K  │ 500K │ 2M    │ 10M   │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ Bluesky         │ score (likes)          │ 5                          │ 20   │ 50   │ 150   │ 500   │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ Google Trends   │ views (approx traffic) │ 5K                         │ 20K  │ 100K │ 500K  │ 2M    │
 ├─────────────────┼────────────────────────┼────────────────────────────┼──────┼──────┼───────┼───────┤
 │ RSS feeds       │ none                   │ flat base score of 30      │      │      │       │       │
 └─────────────────┴────────────────────────┴────────────────────────────┴──────┴──────┴───────┴───────┘

 How percentiles map to scores:
 - Below p25 → interpolate 10-25
 - p25 → 25
 - p50 → 50
 - p75 → 70
 - p90 → 85
 - p99 → 95
 - Above p99 → 95 (cap)

 Example: An HN post with 200 points hits p75 → score 70. A TikTok video with 200 views is far below p25 → score ~10. Same raw
 number, completely different meaning.

 RSS feeds (Reddit RSS, TechCrunch, The Verge, Ars Technica, CoinDesk): These have no engagement metrics — just titles and
 timestamps. They get a flat base score of 30 and can only rise via cross-platform bonus or recency boost.

 CoinGecko special case: Uses market cap rank (lower = better) as primary signal. rank ≤ 10 starts at 70, rank ≤ 50 at 55, rank ≤
  200 at 40. Price change acts as a multiplier: >20% adds 15, >10% adds 10.

 Step 2: Cross-Platform Detection

 The scoring agent fuzzy-matches trend titles across all sources to find duplicates:

 1. Normalize each title: lowercase, strip punctuation, remove common prefixes
 2. Extract key terms: top 3-5 significant words after removing stopwords and very common terms (like "AI", "tech", "new", "app")
 3. Cluster items if any of:
   - ≥ 2 key terms overlap between titles
   - > 50% Jaccard similarity on word tokens
   - Same base URL domain in their urls arrays
 4. Merge each cluster into a single trend:
   - sources = union of all sources in the cluster (e.g., ["Hacker News", "Reddit r/technology", "TechCrunch"])
   - urls = all URLs collected
   - title = from the item with the highest source-normalized score
   - why_trending = from the item with the longest/best explanation
   - description = from the item with the longest description

 Example: "Qatar helium shutdown" on HN (score 329, comments 314) + Reddit RSS + TechCrunch RSS → merged into one trend with
 sources: ["Hacker News", "Reddit Popular", "TechCrunch"] and a cross-platform bonus.

 Step 3: Cross-Platform Bonus

 Topics appearing on multiple platforms get a score boost:

 ┌────────────────┬───────┐
 │ # of Platforms │ Bonus │
 ├────────────────┼───────┤
 │ 1              │ +0    │
 ├────────────────┼───────┤
 │ 2              │ +12   │
 ├────────────────┼───────┤
 │ 3              │ +20   │
 ├────────────────┼───────┤
 │ 4+             │ +25   │
 └────────────────┴───────┘

 This is the key insight: a topic that independently surfaces on HN, Reddit, AND TikTok is genuinely trending — not just popular
 on one platform.

 Step 4: Recency Boost

 Fresh items get a small bump:
 - < 6 hours old → +5
 - < 12 hours old → +3
 - Older → +0

 Step 5: Momentum Multiplier

 The AI agents assign momentum (rising/viral/falling/stable/new) but the scoring agent can override it with data-derived momentum
  when metrics exist:

 ┌───────────┬───────────────────────────┬────────────────────────────┐
 │  Source   │          Signal           │          Momentum          │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ CoinGecko │ priceChange > 20%         │ viral                      │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ CoinGecko │ priceChange > 5%          │ rising                     │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ CoinGecko │ priceChange < -10%        │ falling                    │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ GitHub    │ todayStars > 1,000        │ viral                      │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ GitHub    │ todayStars > 300          │ rising                     │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ Any       │ publishedAt < 3 hours ago │ new                        │
 ├───────────┼───────────────────────────┼────────────────────────────┤
 │ Fallback  │ —                         │ trust AI-assigned momentum │
 └───────────┴───────────────────────────┴────────────────────────────┘

 The momentum then acts as a final multiplier:
 - viral → score × 1.10
 - falling → score × 0.90
 - Others → no change

 Step 6: Composite Score Formula

 final_score = clamp(1, 100,
     source_normalized_score     (0–95)
   + cross_platform_bonus        (0–25)
   + recency_boost               (0–5)
   × momentum_multiplier         (0.90–1.10)
 )

 Step 7: Rebuild popularity.metric

 The AI agents currently overwrite the metric field with "raw numbers" (literal string). The scoring agent reads the original
 scraper data and formats real numbers:

 - HN: "762 pts, 214 comments"
 - GitHub: "4.2K stars"
 - TikTok: "1.2M views | 45K likes"
 - CoinGecko: "+5.2% (24h)"
 - YouTube: "500K views, 1.2K comments"

 ---
 Available Raw Metrics Per Source

 ┌─────────────┬────────────┬───────────────┬────────────┬──────────┬────────────┬─────────────┬────────┬─────────┬─────────┐
 │   Source    │   score    │   comments    │   views    │  stars   │    rank    │ priceChange │ likes  │ shares  │ reposts │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ Hacker News │ points     │ descendant    │            │          │            │             │        │         │         │
 │             │            │ count         │            │          │            │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ CoinGecko   │ trend      │               │            │          │ market cap │ 24h %       │        │         │         │
 │             │ score      │               │            │          │  rank      │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ GitHub      │            │               │            │ total    │            │             │        │         │         │
 │             │            │               │            │ stars    │            │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ Dev.to      │ reactions  │ comment count │ page views │          │            │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ Lobsters    │ story      │ comment count │            │          │            │             │        │         │         │
 │             │ score      │               │            │          │            │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ Google      │            │               │ approx     │          │            │             │        │         │         │
 │ Trends      │            │               │ traffic    │          │            │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ TikTok      │            │               │ view count │          │            │             │ in     │ in      │         │
 │             │            │               │            │          │            │             │ extra  │ extra   │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ Bluesky     │ likes      │ replies       │            │          │            │             │        │         │ reposts │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ YouTube     │            │ comment count │ view count │          │            │             │        │         │         │
 ├─────────────┼────────────┼───────────────┼────────────┼──────────┼────────────┼─────────────┼────────┼─────────┼─────────┤
 │ RSS feeds   │ —          │ —             │ —          │ —        │ —          │ —           │ —      │ —       │ —       │
 └─────────────┴────────────┴───────────────┴────────────┴──────────┴────────────┴─────────────┴────────┴─────────┴─────────┘

 ---
 Implementation

 New file: trendclaw-app/deploy/scoring-agent.py

 Standalone Python script (~300 lines), no external dependencies. Called from run-pulse.sh with:

 python3 "$SCRIPT_DIR/scoring-agent.py" \
   --agents-dir "$USER_AGENTS" \
   --sources-dir "$USER_SOURCES" \
   --raw-data "$COMBINED_FILE" \
   --output "$USER_TMP/_scored.json"

 Input:
 - $USER_AGENTS/*.json — per-source AI agent outputs (has why_trending, description, relevance, momentum)
 - $USER_SOURCES/*.json — raw scraper data per source (has real metrics)
 - $COMBINED_FILE — merged scraper output (for source-level metadata)

 Output:
 - $USER_TMP/_scored.json — same JSON shape as current _final.json but with proper scores, merged cross-platform items, and real
 metric strings. top_movers, signals, summary are left empty for the summary agent to fill.

 Modified: trendclaw-app/deploy/run-pulse.sh

 - Insert scoring agent call after AI agents block (after line 560)
 - Add progress step: write_progress "p['steps']['users']['current_step'] = 'scoring'"
 - Simplify aggregation heredoc (lines 568-782): instead of doing its own scoring/parsing, load _scored.json and just run the
 summary agent

 Modified: trendclaw-app/frontend/lib/types.ts

 - Add "scoring" to UsersStep.current_step union type (line 54)
 - Add scoring: "Scoring trends" to USER_STEP_LABELS (line 178)
 - Add "scoring" to USER_STEP_ORDER between "analyzing" and "summarizing" (line 182)

 Modified: trend-clip/frontend/src/components/trends/run-progress-panel.tsx

 - Add scoring: { label: "Scoring trends", icon: BarChart3 } to STEP_LABELS (line 16)

 Modified: trend-clip/frontend/src/types/index.ts

 - Add "scoring" to RunProgress.steps.users.current_step union

 ---
 What Does NOT Change

 - Per-source AI agents — still provide why_trending, description, relevance (qualitative analysis)
 - Summary agent — still generates top_movers, signals, summary from scored data
 - Supabase schema — trend_runs.data is JSONB, accepts any shape
 - TrendClip trend cards — consume the same Trend interface, no UI changes needed
 - Scraper code — no changes

 ---
 Future: Dynamic Baselines (Phase 2)

 The hardcoded percentile tables are a solid starting point but could be replaced with rolling 7-day baselines computed from
 historical data. This would require:

 1. A new Supabase table source_baselines storing per-source percentile values
 2. A nightly cron that queries the last 7 days of trend_runs, extracts raw metrics per source, computes rolling percentiles, and
  upserts into source_baselines
 3. The scoring agent reads from source_baselines instead of hardcoded values

 This is deferred because: (a) not enough historical data exists yet, (b) the hardcoded percentiles are already informed by real
 observed ranges.

 ---
 Verification

 1. Run scoring agent standalone against existing scraper output to verify it produces valid JSON
 2. Deploy to droplet, trigger a pulse from TrendClip
 3. Check that scores now vary meaningfully (not all 85-100)
 4. Check that cross-platform items are merged (fewer total items, some with multiple sources)
 5. Check that popularity.metric shows real numbers like "762 pts, 214 comments"
 6. Check progress panel shows "Scoring trends" step