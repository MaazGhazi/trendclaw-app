│ Plan to implement                                                                                                              │
│                                                                                                                                │
│ Bridging Agent — Output Type Classification + Content Briefs                                                                   │
│                                                                                                                                │
│ Context                                                                                                                        │
│                                                                                                                                │
│ The orchestration agent (just implemented) classifies trends by niche relevance and scale. But it doesn't generate creative    │
│ output — hooks, angles, format-topic matches. A creator looking at "direct match, score 85" still doesn't know what content to │
│  make.                                                                                                                         │
│                                                                                                                                │
│ The bridging agent adds the creative layer: it matches trending topics with trending formats (from social trend blogs) and     │
│ sounds (from TikTok), then generates actionable briefs.                                                                        │
│                                                                                                                                │
│ Pipeline Position                                                                                                              │
│                                                                                                                                │
│ Scoring → Orchestration (o3-mini) → BRIDGING (4o) → Summary (4o) → Store                                                       │
│                                      ^^^^^^^^^^^^^^^                                                                           │
│                                      New step here                                                                             │
│                                                                                                                                │
│ Reads _orchestrated.json + format/sound source files, writes _bridged.json. Summary agent then reads _bridged.json.            │
│                                                                                                                                │
│ Model: GPT-4o                                                                                                                  │
│                                                                                                                                │
│ The bridging agent's core value is creative generation: writing hooks, suggesting angles, matching topics to formats. This is  │
│ fundamentally different from orchestration (pure classification → o3-mini).                                                    │
│                                                                                                                                │
│ - Why 4o: Creative quality IS the product. A generic hook ("Check out this trend!") is worse than no hook. 4o excels at        │
│ creative tasks — writing specific hooks, suggesting niche-appropriate angles, creatively connecting topics with format         │
│ templates.                                                                                                                     │
│ - Why NOT o3-mini: o3-mini excels at structured reasoning/classification but produces flat creative output. Hooks and angles   │
│ need personality and specificity.                                                                                              │
│ - Why NOT 4o-mini: Quality gap matters for the 3-5 curated briefs users actually act on. Saving $0.05/run isn't worth weaker   │
│ hooks.                                                                                                                         │
│ - Cost: ~3K tokens/call × $0.01 avg = ~$0.03/run. Digest (1/day) + deep_dive (1/week) ≈ $1/month. Even on pulse (96/day) ≈     │
│ $2.88/day — acceptable.                                                                                                        │
│ - Temperature 0.7: Higher than orchestration (0.3) because we want creative variety in hooks/angles, not deterministic         │
│ classification.                                                                                                                │
│                                                                                                                                │
│ Five Output Types                                                                                                              │
│                                                                                                                                │
│ ┌──────────────────┬───────────────────────────────┬───────────────────────────────────────────────────────────┬────────────┐  │
│ │       Type       │            Trigger            │                     What's Generated                      │ Confidence │  │
│ ├──────────────────┼───────────────────────────────┼───────────────────────────────────────────────────────────┼────────────┤  │
│ │ full_brief       │ Topic + format match          │ hook, angle, why_now, timing_window, lifecycle_stage,     │ 0.85+      │  │
│ │                  │                               │ saturation                                                │            │  │
│ ├──────────────────┼───────────────────────────────┼───────────────────────────────────────────────────────────┼────────────┤  │
│ │ angle_only       │ Topic trending, no format     │ angle, why_now                                            │ 0.7+       │  │
│ │                  │ match                         │                                                           │            │  │
│ ├──────────────────┼───────────────────────────────┼───────────────────────────────────────────────────────────┼────────────┤  │
│ │ participation    │ Format trending, no topic     │ how_to_apply (niche-specific), timing_window              │ 0.6+       │  │
│ │                  │ needed                        │                                                           │            │  │
│ ├──────────────────┼───────────────────────────────┼───────────────────────────────────────────────────────────┼────────────┤  │
│ │ opportunity_flag │ Massive topic, weak niche     │ suggested angle                                           │ 0.5+       │  │
│ │                  │ match                         │                                                           │            │  │
│ ├──────────────────┼───────────────────────────────┼───────────────────────────────────────────────────────────┼────────────┤  │
│ │ watch_signal     │ Sound velocity spiking, too   │ signal description                                        │ 0.5+       │  │
│ │                  │ early                         │                                                           │            │  │
│ └──────────────────┴───────────────────────────────┴───────────────────────────────────────────────────────────┴────────────┘  │
│                                                                                                                                │
│ Three User Views                                                                                                               │
│                                                                                                                                │
│ - Curated (default): Top 3-5 ranked briefs. "What should I post." Sorted by confidence × score × type priority.                │
│ - Raw: Full signal landscape — topics tab, formats tab, sounds tab. For creators who browse.                                   │
│ - General: Massive trends with relevance scores. Already exists from orchestration agent.                                      │
│                                                                                                                                │
│ Data Sources                                                                                                                   │
│                                                                                                                                │
│ Topics: _orchestrated.json                                                                                                     │
│                                                                                                                                │
│ Trends with: title, description, why_trending, score, momentum, sources, orchestration (scale, niche_match, confidence,        │
│ suggested_angle).                                                                                                              │
│                                                                                                                                │
│ Formats: $USER_SOURCES/social_trend_blogs.json                                                                                 │
│                                                                                                                                │
│ 235 items on deep_dive. Blog scrapers extract format descriptions from Later, Ramdam, Quso, SocialBee, SocialPilot, BlueBear.  │
│ - Fields: title, description (50-500 chars with how-to), extra.platform (tiktok/reels/social), extra.isNew, extra.firstSeenAt  │
│ - Currently skipped by scoring + per-source AI agents — bridging agent is the first to consume this data                       │
│ - Available on all run types (blogs scraped every run), but most useful on digest/deep_dive                                    │
│                                                                                                                                │
│ Sounds: TikTok source items where category == "song"                                                                           │
│                                                                                                                                │
│ - Fields: title (song name), views (play_cnt), description (artist), extra.duration                                            │
│ - Often empty (TikTok API key issues on droplet)                                                                               │
│ - Loaded from manifest scan of $USER_SOURCES/ for TikTok source file                                                           │
│                                                                                                                                │
│ Files to Create/Modify                                                                                                         │
│                                                                                                                                │
│ 1. NEW: deploy/bridging-agent.py (~320 lines)                                                                                  │
│                                                                                                                                │
│ Stdlib only. Structure:                                                                                                        │
│ 1. Parse args: --orchestrated-file, --sources-dir, --user-profile, --run-type, --output                                        │
│ 2. Load orchestrated JSON + user profile                                                                                       │
│ 3. Load format items from social_trend_blogs source (via manifest scan)                                                        │
│ 4. Load sound items from TikTok source (filter category == "song")                                                             │
│ 5. Default user check → skip (copy orchestrated → bridged)                                                                     │
│ 6. Extract top 25 topics from niche_view.direct + niche_view.adjacent                                                          │
│ 7. Extract top 20 format items (prefer isNew, longer descriptions, balanced across platforms)                                  │
│ 8. Extract top 10 sound items (sorted by play count)                                                                           │
│ 9. Build prompt (system + user sections, compact indexed format)                                                               │
│ 10. Call 4o with response_format: json_object, temperature 0.7                                                                 │
│ 11. Parse response, resolve indices to actual trend/format/sound data                                                          │
│ 12. Build curated_view (top 5 by composite rank), raw_view (topics/formats/sounds), participation, watch_signals               │
│ 13. Write _bridged.json (superset of orchestrated data)                                                                        │
│ 14. Fallback: if 4o fails → basic angle_only briefs from orchestration's suggested_angles (confidence 0.4)                     │
│                                                                                                                                │
│ 2. MODIFY: deploy/run-pulse.sh (lines 584-598)                                                                                 │
│                                                                                                                                │
│ Insert between orchestration and summary:                                                                                      │
│ # ── Bridging agent ──                                                                                                         │
│ write_progress "p['steps']['users']['current_step'] = 'briefing'"                                                              │
│ BRIDGED_FILE="$USER_TMP/_bridged.json"                                                                                         │
│ python3 "$SCRIPT_DIR/bridging-agent.py" \                                                                                      │
│   --orchestrated-file "$ORCHESTRATED_FILE" \                                                                                   │
│   --sources-dir "$USER_SOURCES" \                                                                                              │
│   --user-profile "$USER_TMP/config.json" \                                                                                     │
│   --run-type "$TYPE" \                                                                                                         │
│   --output "$BRIDGED_FILE" || {                                                                                                │
│   echo "  Bridging failed, using orchestrated output"                                                                          │
│   cp "$ORCHESTRATED_FILE" "$BRIDGED_FILE"                                                                                      │
│ }                                                                                                                              │
│                                                                                                                                │
│ Change summary agent:                                                                                                          │
│ - Export BRIDGED_FILE instead of ORCHESTRATED_FILE                                                                             │
│ - Summary Python reads from BRIDGED_FILE env var                                                                               │
│                                                                                                                                │
│ 3. MODIFY: frontend/lib/types.ts                                                                                               │
│                                                                                                                                │
│ Add types:                                                                                                                     │
│ - BriefOutputType union: "full_brief" | "angle_only" | "participation" | "opportunity_flag" | "watch_signal"                   │
│ - BriefContent interface: hook?, angle?, why_now?, timing_window?, lifecycle_stage?, saturation?, how_to_apply?, signal?,      │
│ confidence                                                                                                                     │
│ - FormatMatch interface: name, description, platform?                                                                          │
│ - SoundMatch interface: name, plays, artist?                                                                                   │
│ - CuratedBrief interface: output_type, trend?, format?, sound?, brief                                                          │
│                                                                                                                                │
│ Add to TrendData: optional curated_view, participation, watch_signals, raw_view                                                │
│ Add "briefing" to UsersStep.current_step union, USER_STEP_LABELS ("Generating content briefs"), USER_STEP_ORDER                │
│                                                                                                                                │
│ 4. MODIFY: trend-clip/frontend/src/types/index.ts                                                                              │
│                                                                                                                                │
│ Add "briefing" to RunProgress.steps.users.current_step union                                                                   │
│                                                                                                                                │
│ 5. MODIFY: trend-clip/frontend/src/components/trends/run-progress-panel.tsx                                                    │
│                                                                                                                                │
│ Add briefing: { label: "Generating content briefs", icon: Sparkles } to STEP_LABELS. Import Sparkles from lucide-react.        │
│                                                                                                                                │
│ Prompt Design (4o)                                                                                                             │
│                                                                                                                                │
│ System prompt (~250 tokens):                                                                                                   │
│ You are a content strategist for social media creators. You bridge trending TOPICS with trending content FORMATS and SOUNDS to │
│  produce actionable briefs.                                                                                                    │
│                                                                                                                                │
│ Match what's trending (topics) with how to make content about it (formats/sounds).                                             │
│                                                                                                                                │
│ Classify each output as exactly ONE type:                                                                                      │
│ - full_brief: Topic + format match. Include: hook, angle, why_now, timing_window, lifecycle_stage                              │
│ (emerging|growing|peak|saturated), saturation (low|medium|high), confidence.                                                   │
│ - angle_only: Topic trending, no format match. First-mover opportunity. Include: angle, why_now, confidence.                   │
│ - participation: Format/sound trending on its own — no topic needed. Creator applies to their niche. Include: how_to_apply,    │
│ timing_window, confidence.                                                                                                     │
│ - opportunity_flag: Massive topic, weak niche match. Include: angle, confidence.                                               │
│ - watch_signal: Sound/format velocity spiking, too early to brief. Include: signal, confidence.                                │
│                                                                                                                                │
│ Return ONLY JSON:                                                                                                              │
│ {"briefs": [{"type": "...", "topic_id": 0, "format_idx": null, "sound_idx": null, ...fields per type}], "participation":       │
│ [{"type": "participation", "format_idx": 0, ...}], "watch_signals": [{"type": "watch_signal", "sound_idx": 0, ...}]}           │
│                                                                                                                                │
│ Limits: max 5 full_brief, 3 angle_only, 3 participation, 2 opportunity_flag, 2 watch_signal.                                   │
│ Hooks must be specific and actionable. Reference the user's platform and niche.                                                │
│                                                                                                                                │
│ User prompt (~1800 tokens):                                                                                                    │
│ USER: Niche: {niche} | Role: {role} | Platforms: {platforms} | Formats: {content_formats} | Keywords: {keywords}               │
│                                                                                                                                │
│ TOPICS:                                                                                                                        │
│ [0] "GPT-5 Launch" | score:95 | momentum:viral | sources:HN,Reddit | niche:direct | why:OpenAI released...                     │
│ [1] "Bitcoin ETF" | score:88 | momentum:rising | sources:CoinGecko,CoinDesk | niche:adjacent(angle:"how crypto...") | why:...  │
│                                                                                                                                │
│ FORMATS:                                                                                                                       │
│ [F0] "Maybe in another life" (reels, new) — Creators pair dreamy clips with text overlay                                       │
│ [F1] "Born to..., forced to..." (tiktok, new) — Contrast format: born to [dream] forced to [reality]                           │
│                                                                                                                                │
│ SOUNDS:                                                                                                                        │
│ [S0] "Boom Clap" by Charli XCX — 12.5M plays                                                                                   │
│ [S1] "Original sound - user" — 8.2M plays                                                                                      │
│                                                                                                                                │
│ Curated View Ranking                                                                                                           │
│                                                                                                                                │
│ rank = (confidence * 0.4) + (trend_score/100 * 0.3) + type_bonus + niche_bonus + momentum_bonus                                │
│ - type_bonus: full_brief=0.2, angle_only=0.1, opportunity_flag=0.0                                                             │
│ - niche_bonus: direct=0.15, adjacent=0.05                                                                                      │
│ - momentum_bonus: viral=0.1, rising=0.05, new=0.03                                                                             │
│                                                                                                                                │
│ Output Structure                                                                                                               │
│                                                                                                                                │
│ {                                                                                                                              │
│   ...existing orchestrated fields (categories, niche_view, general_view, filtered_count)...,                                   │
│   "curated_view": [                                                                                                            │
│     {                                                                                                                          │
│       "output_type": "full_brief",                                                                                             │
│       "trend": { ...trend data... },                                                                                           │
│       "format": { "name": "...", "description": "...", "platform": "tiktok" },                                                 │
│       "sound": null,                                                                                                           │
│       "brief": {                                                                                                               │
│         "hook": "POV: you just realized GPU shortages will tank your mining rig",                                              │
│         "angle": "Break down the chip supply chain impact on crypto mining profitability",                                     │
│         "why_now": "Qatar helium shutdown is making headlines, connect to crypto hardware costs",                              │
│         "timing_window": "48h — story still developing",                                                                       │
│         "lifecycle_stage": "emerging",                                                                                         │
│         "saturation": "low",                                                                                                   │
│         "confidence": 0.92                                                                                                     │
│       }                                                                                                                        │
│     }                                                                                                                          │
│   ],                                                                                                                           │
│   "participation": [                                                                                                           │
│     {                                                                                                                          │
│       "output_type": "participation",                                                                                          │
│       "format": { "name": "Born to..., forced to...", "description": "..." },                                                  │
│       "brief": {                                                                                                               │
│         "how_to_apply": "Born to mass-adopt crypto, forced to explain blockchain to my parents",                               │
│         "timing_window": "1 week — format still growing",                                                                      │
│         "confidence": 0.78                                                                                                     │
│       }                                                                                                                        │
│     }                                                                                                                          │
│   ],                                                                                                                           │
│   "watch_signals": [...],                                                                                                      │
│   "raw_view": {                                                                                                                │
│     "topics": [/* all orchestrated trends with output_type label */],                                                          │
│     "formats": [/* social trend blog items */],                                                                                │
│     "sounds": [/* TikTok music items */]                                                                                       │
│   }                                                                                                                            │
│ }                                                                                                                              │
│                                                                                                                                │
│ Fallback Strategy (3 layers)                                                                                                   │
│                                                                                                                                │
│ 1. 4o API fails: Generate basic angle_only briefs from orchestration's suggested_angle fields (confidence 0.4). Empty          │
│ participation/watch_signals. Pipeline continues.                                                                               │
│ 2. bridging-agent.py crashes: Shell catches with || { cp "$ORCHESTRATED_FILE" "$BRIDGED_FILE" }. No curated_view in output,    │
│ but everything else works.                                                                                                     │
│ 3. No format/sound data: On pulse runs with no blog data, generate angle_only briefs for top 5 direct-niche topics using       │
│ simpler prompt.                                                                                                                │
│                                                                                                                                │
│ Verification                                                                                                                   │
│                                                                                                                                │
│ 1. Run standalone: python3 bridging-agent.py --orchestrated-file _orchestrated.json --sources-dir sources/ --user-profile      │
│ config.json --run-type deep_dive --output /tmp/test.json                                                                       │
│ 2. Check full_brief: hook is specific (not generic), format_idx resolves correctly, confidence > 0.85                          │
│ 3. Check participation: how_to_apply references user's niche, not just restating format description                            │
│ 4. Check pulse run: generates angle_only only (no full_brief without format data)                                              │
│ 5. Check fallback: invalid API key → pipeline completes, curated_view has confidence 0.4 items                                 │
│ 6. Deploy + trigger digest → verify _bridged.json has curated_view with 3-5 items 