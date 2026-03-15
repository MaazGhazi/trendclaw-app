#!/usr/bin/env python3
"""
TrendClaw Orchestration Agent — niche relevance + scale detection.

Reads _scored.json, classifies each trend by:
1. Scale — massive (transcends niches) or normal
2. Niche match — direct, adjacent (with content angle), or none

Produces niche_view + general_view for personalized dashboards.
Hybrid: deterministic pre-classification + o3-mini for ambiguous items.

No external dependencies — stdlib only.
"""

import argparse
import json
import os
import re
import sys
import time
from urllib.request import Request, urlopen

# ─── Source → Niche mapping ──────────────────────────────────────────────────

SOURCE_NICHE_MAP = {
    "CoinGecko": "crypto",
    "CoinDesk": "crypto",
    "Hacker News": "tech",
    "GitHub Trending": "tech",
    "Lobsters": "tech",
    "Dev.to": "tech",
    "TechCrunch": "tech",
    "The Verge": "tech",
    "Ars Technica": "tech",
    "Product Hunt": "tech",
    "TikTok": "social",
    "YouTube": "social",
    "Bluesky": "social",
    "Google Trends": "general",
    "Reddit Popular": "general",
    "Reddit r/technology": "tech",
    "Reddit r/cryptocurrency": "crypto",
    "Reddit r/programming": "tech",
    "Reddit r/artificial": "tech",
}

# ─── Niche aliases (user niche → source niches that count as matching) ───────

NICHE_ALIASES = {
    "tech": {"tech"},
    "crypto": {"crypto"},
    "finance": {"crypto"},
    "social": {"social"},
    "social media": {"social"},
    "ai": {"tech"},
    "programming": {"tech"},
    "web3": {"crypto", "tech"},
    "gaming": {"social", "tech"},
    "fitness": {"social"},
    "creator": {"social"},
    "marketing": {"social", "tech"},
}

STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "in", "on", "at", "to", "for",
    "of", "with", "by", "and", "or", "but", "not", "this", "that", "it", "its",
    "has", "have", "had", "be", "been", "will", "would", "could", "can",
}


def normalize_text(text):
    """Lowercase and strip punctuation for keyword matching."""
    return re.sub(r'[^\w\s]', ' ', text.lower()).strip()


def extract_terms(text):
    """Extract significant words from text."""
    words = normalize_text(text).split()
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def pre_classify(trend, user_profile):
    """Deterministic pre-classification of a single trend."""
    niche = user_profile.get("niche", "tech").lower()
    keywords = [k.lower() for k in user_profile.get("keywords", [])]

    sources = trend.get("sources", [])
    score = trend.get("popularity", {}).get("score", 0)
    title_terms = extract_terms(trend.get("title", ""))
    desc_terms = extract_terms(trend.get("description", ""))
    all_terms = title_terms | desc_terms

    # Source niches
    source_niches = set()
    for s in sources:
        sn = SOURCE_NICHE_MAP.get(s)
        if sn:
            source_niches.add(sn)
    primary_source_niche = (
        list(source_niches)[0] if len(source_niches) == 1 else "mixed"
    )

    # Scale: massive candidate if multi-source or very high score
    maybe_massive = len(sources) >= 3 or score >= 90

    # Keyword hits
    keyword_hits = [
        k for k in keywords
        if k in all_terms or any(k in t for t in all_terms)
    ]

    # User niche → matching source niches
    user_niches = NICHE_ALIASES.get(niche, {niche})
    niche_match = bool(source_niches & user_niches)

    # Pre-match classification
    pre_match = None
    if niche_match and keyword_hits:
        pre_match = "likely_direct"
    elif (
        not niche_match
        and not keyword_hits
        and not maybe_massive
        and primary_source_niche not in ("general", "mixed")
    ):
        pre_match = "likely_none"

    return {
        "_pre_scale": "maybe_massive" if maybe_massive else "normal",
        "_keyword_hits": keyword_hits,
        "_source_niche": primary_source_niche,
        "_source_niches": list(source_niches),
        "_pre_match": pre_match,
    }


def build_compact_prompt(trends_with_ids, user_profile):
    """Build the compact one-line-per-trend prompt for o3-mini."""
    lines = []
    for idx, trend in trends_with_ids:
        title = trend.get("title", "")[:80]
        score = trend.get("popularity", {}).get("score", 0)
        sources = ",".join(trend.get("sources", [])[:3])
        momentum = trend.get("momentum", "stable")
        lines.append(
            f'[{idx}] "{title}" | score:{score} | sources:{sources} | momentum:{momentum}'
        )
    return "\n".join(lines)


def call_o3_mini(trends_text, user_profile, api_key):
    """Call o3-mini for ambiguous trend classification."""
    niche = user_profile.get("niche", "tech")
    role = user_profile.get("role", "creator")
    platforms = ", ".join(user_profile.get("platforms", [])) or "general"
    content_formats = ", ".join(user_profile.get("content_formats", [])) or "any"
    keywords = ", ".join(user_profile.get("keywords", [])) or "none specified"
    region = user_profile.get("region", "US")

    system_prompt = (
        "You are a trend relevance classifier for content creators.\n\n"
        "For each trend, decide:\n"
        '1. SCALE: Is this a massive event that transcends niches? '
        '(world cup, major election, global crisis, viral cultural moment). Default: "normal".\n'
        '2. NICHE MATCH: "direct" (topic is the user\'s niche), '
        '"adjacent" (tangential but there\'s a content angle), "none" (no connection).\n'
        "3. SUGGESTED ANGLE (adjacent only): Concrete, actionable. "
        "Reference user's platform and format. "
        'Bad: "could be relevant". '
        'Good: "60s TikTok: how GPU shortages affect mining profitability".\n'
        "4. CONFIDENCE: 0.0-1.0.\n\n"
        'Return JSON: {"results": [{"id": 0, "scale": "normal", '
        '"niche_match": "direct", "confidence": 0.9, '
        '"suggested_angle": null, "reasoning": "brief"}]}'
    )

    user_section = (
        f"User profile:\n"
        f"- Niche: {niche}\n"
        f"- Role: {role}\n"
        f"- Platforms: {platforms}\n"
        f"- Content formats: {content_formats}\n"
        f"- Keywords: {keywords}\n"
        f"- Region: {region}\n\n"
        f"Trends to classify:\n{trends_text}"
    )

    body = json.dumps({
        "model": "o3-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_section},
        ],
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
    return parsed.get("results", []), elapsed


def apply_fallback(pre_class):
    """Generate fallback orchestration when AI is unavailable."""
    pre_match = pre_class.get("_pre_match")
    pre_scale = pre_class.get("_pre_scale", "normal")

    if pre_match == "likely_direct":
        return {
            "scale": "massive" if pre_scale == "maybe_massive" else "normal",
            "niche_match": "direct",
            "confidence": 0.6,
            "suggested_angle": None,
            "reasoning": "Deterministic: source niche + keyword match",
        }
    elif pre_match == "likely_none":
        return {
            "scale": "normal",
            "niche_match": "none",
            "confidence": 0.5,
            "suggested_angle": None,
            "reasoning": "Deterministic: no niche or keyword overlap",
        }
    elif pre_scale == "maybe_massive":
        return {
            "scale": "massive",
            "niche_match": "direct",
            "confidence": 0.5,
            "suggested_angle": None,
            "reasoning": "Fallback: massive candidate, showing by default",
        }
    else:
        return {
            "scale": "normal",
            "niche_match": "direct",
            "confidence": 0.4,
            "suggested_angle": None,
            "reasoning": "Fallback: ambiguous, showing by default",
        }


# ─── Main orchestration pipeline ────────────────────────────────────────────

def run_orchestration(scored_file, user_profile_file, output_file):
    """Main orchestration pipeline."""
    with open(scored_file) as f:
        scored_data = json.load(f)

    with open(user_profile_file) as f:
        user_profile = json.load(f)

    # Default user — skip orchestration entirely
    user_id = user_profile.get("user_id", "default")
    if user_id == "default":
        with open(output_file, "w") as f:
            json.dump(scored_data, f)
        print("  Orchestration: skipped (default user, no profile)", file=sys.stderr)
        return

    api_key = os.environ.get("OPENAI_API_KEY", "")

    # Flatten all trends from categories
    all_trends = []
    for cat in scored_data.get("categories", []):
        for trend in cat.get("trends", []):
            all_trends.append(trend)

    if not all_trends:
        with open(output_file, "w") as f:
            json.dump(scored_data, f)
        print("  Orchestration: skipped (no trends)", file=sys.stderr)
        return

    # ── Pre-classify all trends ──
    pre_classifications = []
    needs_ai = []
    obvious_direct = []
    obvious_none = []

    has_formats = bool(
        user_profile.get("content_formats") or user_profile.get("platforms")
    )

    for i, trend in enumerate(all_trends):
        pre = pre_classify(trend, user_profile)
        pre_classifications.append(pre)

        if pre["_pre_match"] == "likely_none":
            obvious_none.append(i)
        elif pre["_pre_match"] == "likely_direct" and not has_formats:
            # Direct match, no content formats → no angle needed → skip AI
            obvious_direct.append(i)
        else:
            needs_ai.append(i)

    total = len(all_trends)
    print(
        f"  Pre-classify: {total} trends -> "
        f"{len(obvious_direct)} direct, {len(obvious_none)} none, "
        f"{len(needs_ai)} need AI",
        file=sys.stderr,
    )

    # ── AI classification for ambiguous items ──
    ai_results = {}

    if needs_ai and api_key:
        try:
            trends_with_ids = [(i, all_trends[i]) for i in needs_ai]
            trends_text = build_compact_prompt(trends_with_ids, user_profile)
            results, elapsed = call_o3_mini(trends_text, user_profile, api_key)

            for r in results:
                rid = r.get("id")
                if rid is not None:
                    ai_results[int(rid)] = r

            print(
                f"  o3-mini: classified {len(results)} trends ({elapsed:.1f}s)",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"  o3-mini failed: {str(e)[:120]} -- using fallback",
                file=sys.stderr,
            )
    elif needs_ai:
        print("  No API key -- using fallback for all ambiguous items", file=sys.stderr)

    # ── Merge: apply orchestration to each trend ──
    for i, trend in enumerate(all_trends):
        pre = pre_classifications[i]

        if i in ai_results:
            ai = ai_results[i]
            orch = {
                "scale": ai.get("scale", "normal"),
                "niche_match": ai.get("niche_match", "direct"),
                "confidence": ai.get("confidence", 0.7),
                "suggested_angle": ai.get("suggested_angle"),
                "reasoning": ai.get("reasoning", ""),
            }
        elif pre["_pre_match"] == "likely_direct":
            orch = {
                "scale": "massive" if pre["_pre_scale"] == "maybe_massive" else "normal",
                "niche_match": "direct",
                "confidence": 0.75,
                "suggested_angle": None,
                "reasoning": "Source niche + keyword match",
            }
        elif pre["_pre_match"] == "likely_none":
            orch = {
                "scale": "normal",
                "niche_match": "none",
                "confidence": 0.7,
                "suggested_angle": None,
                "reasoning": "No niche or keyword overlap",
            }
        else:
            orch = apply_fallback(pre)

        # Ensure massive candidates keep massive scale
        if pre["_pre_scale"] == "maybe_massive":
            sources = trend.get("sources", [])
            score = trend.get("popularity", {}).get("score", 0)
            if len(sources) >= 3 or score >= 90:
                orch["scale"] = "massive"

        trend["orchestration"] = orch

    # ── Build niche_view and general_view ──
    niche_direct = []
    niche_adjacent = []
    general_view = []
    filtered_count = 0

    for trend in all_trends:
        orch = trend.get("orchestration", {})
        scale = orch.get("scale", "normal")
        match = orch.get("niche_match", "direct")

        if scale == "massive":
            general_view.append({
                "title": trend["title"],
                "description": trend.get("description", ""),
                "why_trending": trend.get("why_trending", ""),
                "popularity": trend.get("popularity", {}),
                "sources": trend.get("sources", []),
                "urls": trend.get("urls", []),
                "momentum": trend.get("momentum", "stable"),
                "relevance_to_user": match,
                "suggested_angle": orch.get("suggested_angle"),
            })
            # Massive + niche match → also in niche view
            if match == "direct":
                niche_direct.append(trend)
            elif match == "adjacent":
                niche_adjacent.append(trend)
        elif match == "direct":
            niche_direct.append(trend)
        elif match == "adjacent":
            niche_adjacent.append(trend)
        else:
            filtered_count += 1

    # Sort each view by score
    niche_direct.sort(
        key=lambda t: t.get("popularity", {}).get("score", 0), reverse=True
    )
    niche_adjacent.sort(
        key=lambda t: t.get("popularity", {}).get("score", 0), reverse=True
    )
    general_view.sort(
        key=lambda t: t.get("popularity", {}).get("score", 0), reverse=True
    )

    # ── Write output (backward compat: categories stays) ──
    scored_data["niche_view"] = {
        "direct": niche_direct,
        "adjacent": niche_adjacent,
    }
    scored_data["general_view"] = general_view
    scored_data["filtered_count"] = filtered_count

    with open(output_file, "w") as f:
        json.dump(scored_data, f)

    print(
        f"  Orchestrated: {len(niche_direct)} direct, "
        f"{len(niche_adjacent)} adjacent, {len(general_view)} massive, "
        f"{filtered_count} filtered",
        file=sys.stderr,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TrendClaw Orchestration Agent")
    parser.add_argument("--scored-file", required=True, help="Path to _scored.json")
    parser.add_argument("--user-profile", required=True, help="Path to user profile JSON")
    parser.add_argument("--output", required=True, help="Output file path")
    args = parser.parse_args()

    run_orchestration(args.scored_file, args.user_profile, args.output)
