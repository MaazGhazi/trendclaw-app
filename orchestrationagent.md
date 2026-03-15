╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                                                                              │
│                                                                                                                                │
│ Orchestration Agent — Niche Relevance + Scale Detection                                                                        │
│                                                                                                                                │
│ Context                                                                                                                        │
│                                                                                                                                │
│ The scoring agent (just implemented) fixes numbers — percentile-based scoring, cross-platform merge, real metrics. But every   │
│ user still sees the same trends ranked the same way. A crypto creator and a fitness creator get identical output.              │
│                                                                                                                                │
│ The orchestration agent adds a reasoning layer that classifies each trend by:                                                  │
│ 1. Scale — is this massive enough that everyone should see it?                                                                 │
│ 2. Niche match — direct, adjacent (with a suggested content angle), or irrelevant?                                             │
│                                                                                                                                │
│ This produces two views: niche view (what to post about) and general view (what you're missing).                               │
│                                                                                                                                │
│ Pipeline Position                                                                                                              │
│                                                                                                                                │
│ Scraper → Per-source AI (4o-mini) → Scoring (Python) → ORCHESTRATION (o3-mini) → Summary (4o) → Store                          │
│                                                          ^^^^^^^^^^^^^^^^^^^^^^^^                                              │
│                                                          New step here                                                         │
│                                                                                                                                │
│ Reads _scored.json, writes _orchestrated.json. Summary agent then reads _orchestrated.json.                                    │
│                                                                                                                                │
│ Model: o3-mini                                                                                                                 │
│                                                                                                                                │
│ Why o3-mini over other options:                                                                                                │
│ - Reasoning model — this task is pure classification/judgment, not creative generation. o3-mini excels at structured           │
│ decision-making                                                                                                                │
│ - Uses existing OPENAI_API_KEY — no new API key, no new endpoint. DeepSeek R1 is slightly cheaper but needs separate key +     │
│ endpoint                                                                                                                       │
│ - Cost is fine — pulse (30 items, 96x/day) ≈ $1.25/day. User prefers quality over cost                                         │
│ - GPT-4o is wrong — 2.3x more expensive and not a reasoning specialist                                                         │
│ - Structured JSON output — supports response_format: { type: "json_object" }                                                   │
│                                                                                                                                │
│ Decision Tree                                                                                                                  │
│                                                                                                                                │
│ For each scored trend:                                                                                                         │
│                          ┌─────────────────┐                                                                                   │
│                          │  Scale check     │                                                                                  │
│                          │  (massive?)      │                                                                                  │
│                          └────────┬─────────┘                                                                                  │
│                             yes ──┤── no                                                                                       │
│                                   │                                                                                            │
│                     ┌─────────────┴──────────────┐                                                                             │
│                     │                            │                                                                             │
│               ┌─────▼──────┐           ┌─────────▼─────────┐                                                                   │
│               │ GENERAL    │           │  Niche match?      │                                                                  │
│               │ VIEW       │           └────────┬───────────┘                                                                  │
│               │ + angle if │              ┌─────┼──────┐                                                                       │
│               │   exists   │          direct  adjacent  none                                                                   │
│               └────────────┘              │      │       │                                                                     │
│                                      full    partial   DROP                                                                    │
│                                      score   score    from                                                                     │
│                                              + angle  niche                                                                    │
│                                                                                                                                │
│ Hybrid: Deterministic Pre-classification + AI Reasoning                                                                        │
│                                                                                                                                │
│ Not everything needs an LLM call. The script pre-classifies deterministically, then only sends ambiguous items to o3-mini.     │
│                                                                                                                                │
│ Deterministic (Python, before API call)                                                                                        │
│                                                                                                                                │
│ ┌──────────────────┬──────────────────────────────────────────────────────────────────────────┬─────────────────────────────┐  │
│ │      Check       │                                  Logic                                   │             Tag             │  │
│ ├──────────────────┼──────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤  │
│ │ Massive          │ len(sources) >= 3 OR score >= 90                                         │ _pre_scale: "maybe_massive" │  │
│ │ candidate        │                                                                          │                             │  │
│ ├──────────────────┼──────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤  │
│ │ Keyword match    │ User keywords ∩ normalized title terms                                   │ _keyword_hits: ["llm",      │  │
│ │                  │                                                                          │ "web3"]                     │  │
│ ├──────────────────┼──────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤  │
│ │ Source-niche map │ CoinGecko/CoinDesk→crypto, HN/GitHub/Lobsters/Dev.to→tech,               │ _source_niche: "tech"       │  │
│ │                  │ TikTok/YouTube→social                                                    │                             │  │
│ ├──────────────────┼──────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤  │
│ │ Obvious direct   │ _source_niche == user_niche AND keyword hits > 0                         │ _pre_match: "likely_direct" │  │
│ ├──────────────────┼──────────────────────────────────────────────────────────────────────────┼─────────────────────────────┤  │
│ │ Obvious none     │ _source_niche != user_niche AND no keyword hits AND not massive          │ _pre_match: "likely_none"   │  │
│ │                  │ candidate                                                                │                             │  │
│ └──────────────────┴──────────────────────────────────────────────────────────────────────────┴─────────────────────────────┘  │
│                                                                                                                                │
│ Estimated reduction: ~60-70% of trends skip the AI call entirely.                                                              │
│                                                                                                                                │
│ AI Reasoning (o3-mini, for ambiguous items)                                                                                    │
│                                                                                                                                │
│ Items that are maybe_massive, or have unclear niche match, get sent to o3-mini. Items pre-classified as likely_direct still go │
│  to AI if user has content_formats/platforms (for angle suggestion).                                                           │
│                                                                                                                                │
│ Compact prompt format (saves tokens — ~40 tokens/trend vs 100+ for full JSON):                                                 │
│ [0] "Qatar helium shutdown threatens chip supply" | score:85 | sources:HN,Reddit,TechCrunch | momentum:rising                  │
│ [1] "Bitcoin breaks $200K" | score:92 | sources:CoinGecko,CoinDesk,Reddit | momentum:viral                                     │
│                                                                                                                                │
│ Fallback (if o3-mini fails)                                                                                                    │
│                                                                                                                                │
│ Pipeline never blocks on API failure:                                                                                          │
│ - likely_direct → niche_match: "direct", confidence 0.6                                                                        │
│ - likely_none → niche_match: "none", confidence 0.5                                                                            │
│ - maybe_massive → scale: "massive", confidence 0.5                                                                             │
│ - Everything else → niche_match: "direct" (conservative — show rather than hide)                                               │
│ - No suggested_angle generated                                                                                                 │
│                                                                                                                                │
│ Default user (no real profile): skip orchestration entirely, copy _scored.json → _orchestrated.json.                           │
│                                                                                                                                │
│ Output Structure                                                                                                               │
│                                                                                                                                │
│ Each trend gains an orchestration object:                                                                                      │
│ {                                                                                                                              │
│   "title": "...", "description": "...", "why_trending": "...",                                                                 │
│   "popularity": { "score": 85, "metric": "762 pts, 214 comments", "reach": "high" },                                           │
│   "sources": ["Hacker News", "Reddit Popular"], "urls": [...],                                                                 │
│   "orchestration": {                                                                                                           │
│     "scale": "normal",                                                                                                         │
│     "niche_match": "direct",                                                                                                   │
│     "confidence": 0.92,                                                                                                        │
│     "suggested_angle": null,                                                                                                   │
│     "reasoning": "Directly about LLM infrastructure, matches user keywords"                                                    │
│   }                                                                                                                            │
│ }                                                                                                                              │
│                                                                                                                                │
│ Top-level output adds two new sections (backward compat — categories stays):                                                   │
│ {                                                                                                                              │
│   "categories": [...],                                                                                                         │
│   "niche_view": {                                                                                                              │
│     "direct": [/* sorted by score */],                                                                                         │
│     "adjacent": [/* sorted by score, each has suggested_angle */]                                                              │
│   },                                                                                                                           │
│   "general_view": [/* massive trends with relevance_to_user + optional angle */],                                              │
│   "filtered_count": 12                                                                                                         │
│ }                                                                                                                              │
│                                                                                                                                │
│ Files to Create/Modify                                                                                                         │
│                                                                                                                                │
│ 1. NEW: deploy/orchestration-agent.py (~280 lines)                                                                             │
│                                                                                                                                │
│ Standalone Python, stdlib only. Structure:                                                                                     │
│ 1. Parse args (--scored-file, --user-profile, --output)                                                                        │
│ 2. Load scored JSON + parse user profile                                                                                       │
│ 3. Deterministic pre-classification (source-niche map, keyword matching, scale heuristics)                                     │
│ 4. Partition into: obvious_direct, obvious_none, needs_ai                                                                      │
│ 5. Build compact prompt, call o3-mini                                                                                          │
│ 6. Parse response, merge with pre-classifications                                                                              │
│ 7. Build output: populate orchestration on each trend, build niche_view + general_view                                         │
│ 8. Write _orchestrated.json                                                                                                    │
│                                                                                                                                │
│ 2. MODIFY: deploy/run-pulse.sh                                                                                                 │
│                                                                                                                                │
│ Insert between scoring agent (line 571) and summary agent (line 573):                                                          │
│ # ── Orchestration agent ──                                                                                                    │
│ write_progress "p['steps']['users']['current_step'] = 'personalizing'"                                                         │
│ ORCHESTRATED_FILE="$USER_TMP/_orchestrated.json"                                                                               │
│ python3 "$SCRIPT_DIR/orchestration-agent.py" \                                                                                 │
│   --scored-file "$SCORED_FILE" \                                                                                               │
│   --user-profile "$user_json" \                                                                                                │
│   --output "$ORCHESTRATED_FILE"                                                                                                │
│                                                                                                                                │
│ Change summary agent input from SCORED_FILE → ORCHESTRATED_FILE.                                                               │
│                                                                                                                                │
│ Extend Supabase profile query (line 86) to also fetch content_formats.                                                         │
│                                                                                                                                │
│ 3. MODIFY: frontend/lib/types.ts                                                                                               │
│                                                                                                                                │
│ - Add OrchestrationMeta interface                                                                                              │
│ - Add optional niche_view, general_view, filtered_count to TrendData                                                           │
│ - Add "personalizing" to UsersStep.current_step union                                                                          │
│ - Add personalizing: "Personalizing trends" to USER_STEP_LABELS                                                                │
│ - Add "personalizing" to USER_STEP_ORDER between "scoring" and "summarizing"                                                   │
│                                                                                                                                │
│ 4. MODIFY: trend-clip/frontend/src/types/index.ts                                                                              │
│                                                                                                                                │
│ - Add "personalizing" to RunProgress.steps.users.current_step union                                                            │
│                                                                                                                                │
│ 5. MODIFY: trend-clip/frontend/src/components/trends/run-progress-panel.tsx                                                    │
│                                                                                                                                │
│ - Add personalizing: { label: "Personalizing trends", icon: UserCheck } to STEP_LABELS                                         │
│ - Import UserCheck from lucide-react                                                                                           │
│                                                                                                                                │
│ Prompt Design (o3-mini)                                                                                                        │
│                                                                                                                                │
│ System prompt (~200 tokens):                                                                                                   │
│ You are a trend relevance classifier for content creators.                                                                     │
│                                                                                                                                │
│ For each trend, decide:                                                                                                        │
│ 1. SCALE: Is this a massive event that transcends niches? (world cup, major election, global crisis, viral cultural moment).   │
│ Default: "normal".                                                                                                             │
│ 2. NICHE MATCH: "direct" (topic is the user's niche), "adjacent" (tangential but there's a content angle), "none" (no          │
│ connection).                                                                                                                   │
│ 3. SUGGESTED ANGLE (adjacent only): Concrete, actionable. Reference user's platform and format. Bad: "could be relevant".      │
│ Good: "60s TikTok: how GPU shortages affect mining profitability".                                                             │
│ 4. CONFIDENCE: 0.0-1.0.                                                                                                        │
│                                                                                                                                │
│ Return JSON: {"results": [{"id": 0, "scale": "normal", "niche_match": "direct", "confidence": 0.9, "suggested_angle": null,    │
│ "reasoning": "brief"}]}                                                                                                        │
│                                                                                                                                │
│ User section (~100 tokens): Niche, role, platforms, content_formats, keywords, region.                                         │
│                                                                                                                                │
│ Trends section (~40 tokens/trend): Compact one-line format with id, title, score, sources, momentum.                           │
│                                                                                                                                │
│ Verification                                                                                                                   │
│                                                                                                                                │
│ 1. Run orchestration-agent.py standalone against an existing _scored.json with a sample user profile — verify valid JSON       │
│ output                                                                                                                         │
│ 2. Check that obvious tech trends get direct for a tech user and none for a fitness user                                       │
│ 3. Check that multi-platform high-score trends get flagged massive                                                             │
│ 4. Deploy to droplet, trigger a pulse — verify _orchestrated.json written and summary agent reads it                           │
│ 5. Check progress panel shows "Personalizing trends" step                                                                      │
│ 6. Verify fallback works: set OPENAI_API_KEY to invalid value, confirm pipeline completes with deterministic classifications  