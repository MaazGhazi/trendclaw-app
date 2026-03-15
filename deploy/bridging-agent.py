#!/usr/bin/env python3
"""
TrendClaw Bridging Agent — output type classification + content briefs.

Reads _orchestrated.json + format/sound sources, classifies each trend into
one of five output types, and generates actionable content briefs via GPT-4o.

Pipeline position: Scoring → Orchestration → BRIDGING → Summary → Store

No external dependencies — stdlib only.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen


# ─── Output type definitions ────────────────────────────────────────────────

OUTPUT_TYPES = {
    "full_brief": {"priority": 5, "min_confidence": 0.85, "max_count": 5},
    "angle_only": {"priority": 4, "min_confidence": 0.7, "max_count": 3},
    "participation": {"priority": 3, "min_confidence": 0.6, "max_count": 3},
    "opportunity_flag": {"priority": 2, "min_confidence": 0.5, "max_count": 2},
    "watch_signal": {"priority": 1, "min_confidence": 0.5, "max_count": 2},
}


def load_orchestrated(path):
    """Load orchestrated JSON data."""
    with open(path) as f:
        return json.load(f)


def load_user_profile(path):
    """Load user profile JSON."""
    with open(path) as f:
        return json.load(f)


def load_formats(sources_dir):
    """Load format items from social_trend_blogs source file."""
    formats = []

    # Find social trend blogs file via manifest
    manifest_path = os.path.join(sources_dir, "_manifest.json")
    if not os.path.exists(manifest_path):
        return formats

    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except Exception:
        return formats

    blog_file = None
    for entry in manifest:
        name = entry.get("name", "")
        if "blog" in name.lower() or "social_trend" in name.lower():
            blog_file = entry.get("file")
            break

    if not blog_file or not os.path.exists(blog_file):
        # Try common filename
        for candidate in ["social_trend_blogs.json", "social-trend-blogs.json"]:
            p = os.path.join(sources_dir, candidate)
            if os.path.exists(p):
                blog_file = p
                break

    if not blog_file or not os.path.exists(blog_file):
        return formats

    try:
        with open(blog_file) as f:
            data = json.load(f)
        items = data.get("items", []) if isinstance(data, dict) else data
        if isinstance(items, list):
            formats = items
    except Exception:
        pass

    return formats


def load_sounds(sources_dir):
    """Load sound items from TikTok source (category == 'song')."""
    sounds = []

    manifest_path = os.path.join(sources_dir, "_manifest.json")
    if not os.path.exists(manifest_path):
        return sounds

    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except Exception:
        return sounds

    tiktok_file = None
    for entry in manifest:
        name = entry.get("name", "")
        if "tiktok" in name.lower():
            tiktok_file = entry.get("file")
            break

    if not tiktok_file or not os.path.exists(tiktok_file):
        return sounds

    try:
        with open(tiktok_file) as f:
            data = json.load(f)
        items = data.get("items", []) if isinstance(data, dict) else data
        for item in (items if isinstance(items, list) else []):
            cat = item.get("category", "")
            if cat and "song" in cat.lower():
                sounds.append(item)
    except Exception:
        pass

    return sounds


def parse_iso_date(val):
    """Parse an ISO-ish date string to datetime. Returns None on failure."""
    if not val or not isinstance(val, str):
        return None
    try:
        ts = val.replace("Z", "+00:00")
        if "T" not in ts:
            ts += "T00:00:00+00:00"
        elif "+" not in ts[10:] and "-" not in ts[10:]:
            ts += "+00:00"
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


# Matches dates like "January 12, 2026", "February 20, 2026", "March 3, 2026"
import re as _re
_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}
_EMBEDDED_DATE_RE = _re.compile(
    r'\b(' + '|'.join(_MONTH_NAMES.keys()) + r')\s+(\d{1,2}),?\s+(\d{4})\b',
    _re.IGNORECASE,
)


def parse_embedded_date(text):
    """Extract a date like 'January 12, 2026' from text. Returns datetime or None."""
    if not text:
        return None
    match = _EMBEDDED_DATE_RE.search(text)
    if match:
        month = _MONTH_NAMES.get(match.group(1).lower())
        day = int(match.group(2))
        year = int(match.group(3))
        if month:
            try:
                return datetime(year, month, day, tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def parse_item_date(item):
    """Extract the most relevant date from a format/sound item.
    Checks embedded dates in title/description first (actual content date),
    then falls back to scraper metadata dates."""
    # Priority 1: embedded date in title or description (the actual format date)
    for text_key in ("title", "description"):
        text = item.get(text_key, "") or ""
        dt = parse_embedded_date(text)
        if dt:
            return dt

    # Priority 2: scraper metadata dates
    for key in ("firstSeenAt", "lastSeenAt", "first_seen_at", "last_seen_at"):
        val = item.get(key) or item.get("extra", {}).get(key)
        dt = parse_iso_date(val)
        if dt:
            return dt

    return None


def days_old(item):
    """How many days old is this item? Returns float. None → 999."""
    dt = parse_item_date(item)
    if not dt:
        return 999.0
    now = datetime.now(timezone.utc)
    return max(0, (now - dt).total_seconds() / 86400)


MAX_FORMAT_AGE_DAYS = 14


def select_top_formats(formats, max_count=20):
    """Select top format items. Filters out stale formats (>14 days) and weights recency heavily."""
    now = datetime.now(timezone.utc)

    # Step 1: filter out stale formats
    fresh = []
    stale_count = 0
    for f in formats:
        age = days_old(f)
        if age <= MAX_FORMAT_AGE_DAYS:
            fresh.append(f)
        else:
            stale_count += 1

    if stale_count > 0:
        print(
            f"    Formats: {len(fresh)} fresh, {stale_count} filtered (>{MAX_FORMAT_AGE_DAYS}d old)",
            file=sys.stderr,
        )

    # Step 2: score remaining formats
    scored = []
    for f in fresh:
        s = 0.0
        age = days_old(f)

        # Recency is the dominant signal (0-20 points)
        if age <= 2:
            s += 20
        elif age <= 5:
            s += 15
        elif age <= 7:
            s += 10
        else:
            s += 5

        # isNew bonus (genuinely new to our tracking)
        if f.get("isNew") or f.get("extra", {}).get("isNew"):
            s += 5

        # Description quality (up to 5 pts — minor vs recency)
        desc = f.get("description", "") or ""
        s += min(len(desc), 200) / 40

        platform = f.get("platform") or f.get("extra", {}).get("platform", "")
        scored.append((s, platform, f))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Step 3: balance across platforms
    selected = []
    platform_counts = {}
    for s, plat, f in scored:
        if len(selected) >= max_count:
            break
        plat_key = plat or "unknown"
        if platform_counts.get(plat_key, 0) >= max_count // 3 + 1:
            continue
        selected.append(f)
        platform_counts[plat_key] = platform_counts.get(plat_key, 0) + 1

    # Fill remaining slots
    if len(selected) < max_count:
        for s, plat, f in scored:
            if f not in selected and len(selected) < max_count:
                selected.append(f)

    return selected


def select_top_sounds(sounds, max_count=10):
    """Select top sounds sorted by play count."""
    def get_plays(s):
        v = s.get("views", 0) or s.get("extra", {}).get("play_cnt", 0) or 0
        if isinstance(v, str):
            try:
                v = int(v)
            except ValueError:
                v = 0
        return v

    sounds_sorted = sorted(sounds, key=get_plays, reverse=True)
    return sounds_sorted[:max_count]


def extract_topics(orchestrated_data, max_count=50):
    """Extract top topics: niche_view first (prioritized), then fill from all categories."""
    seen_titles = set()
    prioritized = []
    general = []

    # Priority: niche_view direct + adjacent (most relevant to user)
    niche_view = orchestrated_data.get("niche_view")
    if niche_view:
        for t in niche_view.get("direct", []):
            key = t.get("title", "").lower().strip()
            if key not in seen_titles:
                seen_titles.add(key)
                prioritized.append(t)
        for t in niche_view.get("adjacent", []):
            key = t.get("title", "").lower().strip()
            if key not in seen_titles:
                seen_titles.add(key)
                prioritized.append(t)

    # Fill remaining from ALL categories (GPT-4o may find creative angles)
    for cat in orchestrated_data.get("categories", []):
        for t in cat.get("trends", []):
            key = t.get("title", "").lower().strip()
            if key not in seen_titles:
                seen_titles.add(key)
                general.append(t)

    # Sort each group by score
    prioritized.sort(
        key=lambda t: t.get("popularity", {}).get("score", 0), reverse=True
    )
    general.sort(
        key=lambda t: t.get("popularity", {}).get("score", 0), reverse=True
    )

    # Combine: all prioritized + top general to fill max_count
    topics = prioritized + general
    return topics[:max_count]


def format_number(n):
    """Format a number with K/M suffixes."""
    if not isinstance(n, (int, float)) or n <= 0:
        return "0"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(int(n))


def build_prompt(topics, formats, sounds, user_profile):
    """Build system + user prompts for GPT-4o."""

    system_prompt = (
        "You are a content strategist for social media creators. "
        "You bridge trending TOPICS with trending content FORMATS and SOUNDS "
        "to produce actionable briefs.\n\n"
        "Match what's trending (topics) with how to make content about it (formats/sounds).\n\n"
        "Classify each output as exactly ONE type:\n"
        "- full_brief: Topic + format match. Include: hook, angle, why_now, "
        "timing_window, lifecycle_stage (emerging|growing|peak|saturated), "
        "saturation (low|medium|high), confidence.\n"
        "- angle_only: Topic trending, no format match. First-mover opportunity. "
        "Include: angle, why_now, confidence.\n"
        "- participation: Format/sound trending on its own — no topic needed. "
        "Creator applies to their niche. Include: how_to_apply, timing_window, confidence.\n"
        "- opportunity_flag: Massive topic, weak niche match. Include: angle, confidence.\n"
        "- watch_signal: Sound/format velocity spiking, too early to brief. "
        "Include: signal, confidence.\n\n"
        'Return ONLY JSON:\n'
        '{"briefs": [{"type": "...", "topic_idx": 0, "format_idx": null, '
        '"sound_idx": null, ...fields per type}], '
        '"participation": [{"type": "participation", "format_idx": 0, ...}], '
        '"watch_signals": [{"type": "watch_signal", "sound_idx": 0, ...}]}\n\n'
        "Generate a brief for EVERY topic and EVERY format provided. "
        "Do not skip any. More briefs = better. There is no maximum.\n"
        "Hooks must be specific and actionable. Reference the user's platform and niche.\n"
        "IMPORTANT: Only use formats that are genuinely current (last 7 days preferred). "
        "Never recommend a format that is clearly outdated or seasonal from months ago."
    )

    # User section
    niche = user_profile.get("niche", "tech")
    role = user_profile.get("role", "creator")
    platforms = ", ".join(user_profile.get("platforms", [])) or "general"
    content_formats = ", ".join(user_profile.get("content_formats", [])) or "any"
    keywords = ", ".join(user_profile.get("keywords", [])) or "none specified"

    lines = [
        f"USER: Niche: {niche} | Role: {role} | Platforms: {platforms} "
        f"| Formats: {content_formats} | Keywords: {keywords}",
        "",
        "TOPICS:",
    ]

    for i, t in enumerate(topics):
        score = t.get("popularity", {}).get("score", 0)
        momentum = t.get("momentum", "stable")
        sources = ",".join(t.get("sources", [])[:3])
        orch = t.get("orchestration", {})
        niche_match = orch.get("niche_match", "direct")
        angle = orch.get("suggested_angle", "")
        why = (t.get("why_trending", "") or "")[:100]

        niche_str = niche_match
        if niche_match == "adjacent" and angle:
            niche_str = f'adjacent(angle:"{angle[:60]}")'

        lines.append(
            f'[{i}] "{t.get("title", "")[:80]}" | score:{score} | '
            f"momentum:{momentum} | sources:{sources} | "
            f"niche:{niche_str} | why:{why}"
        )

    if formats:
        lines.append("")
        lines.append("FORMATS (all within last 14 days):")
        for i, f in enumerate(formats):
            platform = f.get("platform") or f.get("extra", {}).get("platform", "social")
            is_new = f.get("isNew") or f.get("extra", {}).get("isNew", False)
            new_tag = ", new" if is_new else ""
            desc = (f.get("description", "") or "")[:120]
            age = days_old(f)
            age_str = f"{int(age)}d ago" if age < 999 else ""
            lines.append(
                f'[F{i}] "{f.get("title", "")[:60]}" ({platform}{new_tag}, {age_str}) — {desc}'
            )

    if sounds:
        lines.append("")
        lines.append("SOUNDS:")
        for i, s in enumerate(sounds):
            plays = s.get("views", 0) or s.get("extra", {}).get("play_cnt", 0) or 0
            artist = s.get("description", "") or s.get("extra", {}).get("artist", "")
            lines.append(
                f'[S{i}] "{s.get("title", "")[:50]}" by {artist[:30]} — '
                f"{format_number(plays)} plays"
            )

    user_prompt = "\n".join(lines)
    return system_prompt, user_prompt


def call_gpt4o(system_prompt, user_prompt, api_key):
    """Call GPT-4o for creative bridging."""
    body = json.dumps({
        "model": "gpt-4o",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"},
    }).encode()

    req = Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    start = time.time()
    resp = urlopen(req, timeout=90)
    result = json.loads(resp.read().decode())
    content = result["choices"][0]["message"]["content"]
    elapsed = time.time() - start

    parsed = json.loads(content)
    return parsed, elapsed


def resolve_brief(brief, topics, formats, sounds):
    """Resolve index references in a brief to actual data."""
    resolved = {"output_type": brief.get("type", "angle_only")}

    # Resolve topic
    topic_idx = brief.get("topic_idx")
    if topic_idx is not None and 0 <= topic_idx < len(topics):
        resolved["trend"] = topics[topic_idx]
    else:
        resolved["trend"] = None

    # Resolve format
    format_idx = brief.get("format_idx")
    if format_idx is not None and 0 <= format_idx < len(formats):
        f = formats[format_idx]
        resolved["format"] = {
            "name": f.get("title", ""),
            "description": f.get("description", ""),
            "platform": f.get("platform") or f.get("extra", {}).get("platform"),
        }
    else:
        resolved["format"] = None

    # Resolve sound
    sound_idx = brief.get("sound_idx")
    if sound_idx is not None and 0 <= sound_idx < len(sounds):
        s = sounds[sound_idx]
        plays = s.get("views", 0) or s.get("extra", {}).get("play_cnt", 0) or 0
        resolved["sound"] = {
            "name": s.get("title", ""),
            "plays": plays,
            "artist": s.get("description", "") or s.get("extra", {}).get("artist", ""),
        }
    else:
        resolved["sound"] = None

    # Brief content fields
    brief_content = {}
    for key in ("hook", "angle", "why_now", "timing_window", "lifecycle_stage",
                "saturation", "how_to_apply", "signal", "confidence"):
        if key in brief:
            brief_content[key] = brief[key]

    # Ensure confidence is always a float
    if "confidence" in brief_content:
        try:
            brief_content["confidence"] = float(brief_content["confidence"])
        except (TypeError, ValueError):
            brief_content["confidence"] = 0.5
    else:
        brief_content["confidence"] = 0.5

    resolved["brief"] = brief_content
    return resolved


def compute_rank(brief):
    """Compute composite rank for curated view sorting."""
    raw_confidence = brief.get("brief", {}).get("confidence", 0.5)
    try:
        confidence = float(raw_confidence)
    except (TypeError, ValueError):
        confidence = 0.5
    trend = brief.get("trend")
    trend_score = 0
    momentum = "stable"
    niche_match = "none"

    if trend:
        trend_score = trend.get("popularity", {}).get("score", 0)
        momentum = trend.get("momentum", "stable")
        orch = trend.get("orchestration", {})
        niche_match = orch.get("niche_match", "none")

    type_bonus = {
        "full_brief": 0.2,
        "angle_only": 0.1,
        "opportunity_flag": 0.0,
    }.get(brief.get("output_type", ""), 0.0)

    niche_bonus = {
        "direct": 0.15,
        "adjacent": 0.05,
    }.get(niche_match, 0.0)

    momentum_bonus = {
        "viral": 0.1,
        "rising": 0.05,
        "new": 0.03,
    }.get(momentum, 0.0)

    rank = (
        confidence * 0.4
        + (trend_score / 100) * 0.3
        + type_bonus
        + niche_bonus
        + momentum_bonus
    )
    return rank


def generate_fallback_briefs(topics, user_profile):
    """Generate basic angle_only briefs from orchestration data when 4o fails."""
    briefs = []
    niche = user_profile.get("niche", "tech")

    for topic in topics[:5]:
        orch = topic.get("orchestration", {})
        suggested = orch.get("suggested_angle")
        niche_match = orch.get("niche_match", "none")

        if niche_match == "none":
            continue

        brief = {
            "output_type": "angle_only",
            "trend": topic,
            "format": None,
            "sound": None,
            "brief": {
                "angle": suggested or f"Cover this trending topic for your {niche} audience",
                "why_now": topic.get("why_trending", "Currently trending"),
                "confidence": 0.4,
            },
        }
        briefs.append(brief)

    return briefs


def build_raw_view(topics, formats, sounds):
    """Build the raw view with all items labeled."""
    raw_topics = []
    for t in topics:
        raw_topics.append({
            "title": t.get("title", ""),
            "description": t.get("description", ""),
            "score": t.get("popularity", {}).get("score", 0),
            "momentum": t.get("momentum", "stable"),
            "sources": t.get("sources", []),
        })

    raw_formats = []
    for f in formats:
        raw_formats.append({
            "title": f.get("title", ""),
            "description": f.get("description", ""),
            "platform": f.get("platform") or f.get("extra", {}).get("platform"),
            "isNew": bool(f.get("isNew") or f.get("extra", {}).get("isNew")),
        })

    raw_sounds = []
    for s in sounds:
        plays = s.get("views", 0) or s.get("extra", {}).get("play_cnt", 0) or 0
        raw_sounds.append({
            "title": s.get("title", ""),
            "plays": plays,
            "artist": s.get("description", "") or s.get("extra", {}).get("artist", ""),
        })

    return {
        "topics": raw_topics,
        "formats": raw_formats,
        "sounds": raw_sounds,
    }


# ─── Main bridging pipeline ─────────────────────────────────────────────────

def run_bridging(orchestrated_file, sources_dir, user_profile_file, run_type, output_file):
    """Main bridging pipeline."""
    orchestrated = load_orchestrated(orchestrated_file)
    user_profile = load_user_profile(user_profile_file)

    # Default user → skip bridging (copy orchestrated → bridged)
    user_id = user_profile.get("user_id", "default")
    if user_id == "default":
        with open(output_file, "w") as f:
            json.dump(orchestrated, f)
        print("  Bridging: skipped (default user, no profile)", file=sys.stderr)
        return

    api_key = os.environ.get("OPENAI_API_KEY", "")

    # Extract data sources
    topics = extract_topics(orchestrated)
    formats = load_formats(sources_dir)
    sounds = load_sounds(sources_dir)

    selected_formats = select_top_formats(formats, max_count=40)
    selected_sounds = select_top_sounds(sounds, max_count=20)

    print(
        f"  Bridging inputs: {len(topics)} topics, "
        f"{len(selected_formats)} formats, {len(selected_sounds)} sounds",
        file=sys.stderr,
    )

    if not topics:
        with open(output_file, "w") as f:
            json.dump(orchestrated, f)
        print("  Bridging: skipped (no topics)", file=sys.stderr)
        return

    # Build raw view (always available)
    raw_view = build_raw_view(topics, selected_formats, selected_sounds)

    curated_view = []
    participation = []
    watch_signals = []

    # Try GPT-4o for creative bridging
    if api_key:
        try:
            system_prompt, user_prompt = build_prompt(
                topics, selected_formats, selected_sounds, user_profile
            )
            response, elapsed = call_gpt4o(system_prompt, user_prompt, api_key)

            # Process briefs
            for brief in response.get("briefs", []):
                resolved = resolve_brief(brief, topics, selected_formats, selected_sounds)
                curated_view.append(resolved)

            # Process participation
            for brief in response.get("participation", []):
                resolved = resolve_brief(brief, topics, selected_formats, selected_sounds)
                resolved["output_type"] = "participation"
                participation.append(resolved)

            # Process watch signals
            for brief in response.get("watch_signals", []):
                resolved = resolve_brief(brief, topics, selected_formats, selected_sounds)
                resolved["output_type"] = "watch_signal"
                watch_signals.append(resolved)

            print(
                f"  GPT-4o: {len(curated_view)} briefs, "
                f"{len(participation)} participation, "
                f"{len(watch_signals)} watch signals ({elapsed:.1f}s)",
                file=sys.stderr,
            )

        except Exception as e:
            print(f"  GPT-4o failed: {str(e)[:120]} — using fallback", file=sys.stderr)
            curated_view = generate_fallback_briefs(topics, user_profile)
    else:
        print("  No API key — using fallback briefs", file=sys.stderr)
        curated_view = generate_fallback_briefs(topics, user_profile)

    # Sort curated view by composite rank, take top 5
    for brief in curated_view:
        brief["_rank"] = compute_rank(brief)
    curated_view.sort(key=lambda b: b.get("_rank", 0), reverse=True)
    # No cap — show everything

    # Clean up internal ranking field
    for brief in curated_view:
        brief.pop("_rank", None)

    # Build output (superset of orchestrated data)
    orchestrated["curated_view"] = curated_view
    orchestrated["participation"] = participation
    orchestrated["watch_signals"] = watch_signals
    orchestrated["raw_view"] = raw_view

    with open(output_file, "w") as f:
        json.dump(orchestrated, f)

    print(
        f"  Bridged: {len(curated_view)} curated, "
        f"{len(participation)} participation, "
        f"{len(watch_signals)} watch signals",
        file=sys.stderr,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TrendClaw Bridging Agent")
    parser.add_argument("--orchestrated-file", required=True, help="Path to _orchestrated.json")
    parser.add_argument("--sources-dir", required=True, help="Dir with per-source raw scraper JSON")
    parser.add_argument("--user-profile", required=True, help="Path to user profile JSON")
    parser.add_argument("--run-type", required=True, help="Run type: pulse, digest, deep_dive")
    parser.add_argument("--output", required=True, help="Output file path")
    args = parser.parse_args()

    try:
        run_bridging(
            args.orchestrated_file,
            args.sources_dir,
            args.user_profile,
            args.run_type,
            args.output,
        )
    except Exception as e:
        import traceback
        print(f"  Bridging CRASHED: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        # Last-resort fallback: copy orchestrated to output so pipeline continues
        try:
            import shutil
            shutil.copy2(args.orchestrated_file, args.output)
            print("  Copied orchestrated → bridged as fallback", file=sys.stderr)
        except Exception:
            pass
        sys.exit(1)
