#!/usr/bin/env python3
"""
TrendClaw Scoring Agent — signal-based scoring + cross-platform merge.

Replaces AI-guessed scores with source-normalized percentile scores,
detects cross-platform duplicates via fuzzy matching, and applies
bonuses for multi-platform presence, recency, and momentum.

No external dependencies — stdlib only.
"""

import argparse
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

# ─── Source percentile tables ─────────────────────────────────────────────────
# Keys: p25, p50, p75, p90, p99 — mapped to scores 25, 50, 70, 85, 95

PERCENTILES = {
    "Hacker News":        {"key": "score",   "p25": 30,    "p50": 80,    "p75": 200,   "p90": 500,    "p99": 1500},
    "Lobsters":           {"key": "score",   "p25": 5,     "p50": 15,    "p75": 30,    "p90": 60,     "p99": 120},
    "Dev.to":             {"key": "score",   "p25": 10,    "p50": 30,    "p75": 80,    "p90": 200,    "p99": 500},
    "GitHub Trending":    {"key": "stars",   "p25": 50,    "p50": 150,   "p75": 500,   "p90": 1500,   "p99": 5000},
    "TikTok":             {"key": "views",   "p25": 10000, "p50": 100000,"p75": 1000000,"p90": 10000000,"p99": 100000000},
    "YouTube":            {"key": "views",   "p25": 5000,  "p50": 50000, "p75": 500000,"p90": 2000000, "p99": 10000000},
    "Bluesky":            {"key": "score",   "p25": 5,     "p50": 20,    "p75": 50,    "p90": 150,    "p99": 500},
    "Google Trends":      {"key": "views",   "p25": 5000,  "p50": 20000, "p75": 100000,"p90": 500000,  "p99": 2000000},
    "Product Hunt":       {"key": "score",   "p25": 50,    "p50": 150,   "p75": 400,   "p90": 800,    "p99": 2000},
}

# Sources that are RSS-only (no engagement metrics) — flat base score
RSS_SOURCES = {
    "Reddit Popular", "Reddit r/technology", "Reddit r/cryptocurrency",
    "Reddit r/programming", "Reddit r/artificial",
    "TechCrunch", "The Verge", "Ars Technica", "CoinDesk",
}

RSS_BASE_SCORE = 30

# Percentile → score mapping (for interpolation)
PCTL_SCORES = [
    (0,    10),   # below p25 floor
    (25,   25),   # p25
    (50,   50),   # p50
    (75,   70),   # p75
    (90,   85),   # p90
    (99,   95),   # p99
]

# Cross-platform bonus
PLATFORM_BONUS = {1: 0, 2: 12, 3: 20}  # 4+ → 25

# Momentum multipliers
MOMENTUM_MULT = {"viral": 1.10, "falling": 0.90}

# Stopwords for title normalization
STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "up",
    "about", "into", "through", "during", "before", "after", "above",
    "below", "between", "out", "off", "over", "under", "again", "further",
    "then", "once", "here", "there", "when", "where", "why", "how", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "because", "as", "until", "while", "and", "but", "or", "if",
    "what", "which", "who", "whom", "this", "that", "these", "those",
    "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
    "she", "her", "it", "its", "they", "them", "their",
}

# Very common terms that don't help distinguish trends
COMMON_TERMS = {"ai", "tech", "new", "app", "update", "launch", "first", "get", "one", "now", "use", "using"}


def interpolate_score(value, ptable):
    """Map a raw metric value to a 10-95 score using percentile breakpoints."""
    breakpoints = [
        (ptable["p25"], 25),
        (ptable["p50"], 50),
        (ptable["p75"], 70),
        (ptable["p90"], 85),
        (ptable["p99"], 95),
    ]

    if value <= 0:
        return 10

    if value < breakpoints[0][0]:
        # Below p25 → interpolate 10-25
        ratio = value / breakpoints[0][0]
        return max(10, int(10 + 15 * ratio))

    for i in range(len(breakpoints) - 1):
        low_val, low_score = breakpoints[i]
        high_val, high_score = breakpoints[i + 1]
        if value <= high_val:
            ratio = (value - low_val) / (high_val - low_val)
            return int(low_score + (high_score - low_score) * ratio)

    # Above p99 → cap at 95
    return 95


def get_raw_metric(item, source_name):
    """Extract the primary raw metric for a source from a scraper item."""
    ptable = PERCENTILES.get(source_name)
    if not ptable:
        return 0, None

    key = ptable["key"]

    # Try direct key
    val = item.get(key)
    if val and isinstance(val, (int, float)) and val > 0:
        return val, key

    # GitHub: check extra.todayStars or stars
    if source_name == "GitHub Trending":
        extra = item.get("extra", {})
        if isinstance(extra, dict):
            today = extra.get("todayStars", 0)
            if today and isinstance(today, (int, float)) and today > 0:
                return today, "todayStars"
        stars = item.get("stars", 0)
        if stars and isinstance(stars, (int, float)) and stars > 0:
            return stars, "stars"

    # TikTok/YouTube: check views
    if key == "views":
        views = item.get("views", 0)
        if views and isinstance(views, (int, float)) and views > 0:
            return views, "views"

    return 0, None


def score_coingecko(item):
    """Special scoring for CoinGecko based on market cap rank + price change."""
    rank = None
    extra = item.get("extra", {})
    if isinstance(extra, dict):
        rank = extra.get("marketCapRank") or extra.get("rank")
    if not rank:
        rank = item.get("rank")

    base = 30
    if rank:
        try:
            rank = int(rank)
            if rank <= 10:
                base = 70
            elif rank <= 50:
                base = 55
            elif rank <= 200:
                base = 40
            else:
                base = 30
        except (ValueError, TypeError):
            pass

    # Price change bonus
    pc = item.get("priceChange", "")
    if isinstance(pc, str) and pc:
        try:
            num = float(pc.replace("%", "").replace("(24h)", "").replace("+", "").strip())
            if abs(num) > 20:
                base += 15
            elif abs(num) > 10:
                base += 10
        except ValueError:
            pass

    return min(95, base)


def source_normalized_score(item, source_name):
    """Compute score for a single item based on its source's percentile table."""
    if source_name in RSS_SOURCES:
        return RSS_BASE_SCORE

    if source_name == "CoinGecko":
        return score_coingecko(item)

    ptable = PERCENTILES.get(source_name)
    if not ptable:
        # Unknown source — use log fallback
        raw = 0
        for k in ("score", "views", "stars", "comments"):
            v = item.get(k)
            if v and isinstance(v, (int, float)) and v > 0:
                raw = v
                break
        if raw <= 0:
            return RSS_BASE_SCORE
        return min(95, max(10, int(30 + 65 * math.log10(max(1, raw)) / math.log10(100000))))

    val, _ = get_raw_metric(item, source_name)
    if val <= 0:
        return 10

    return interpolate_score(val, ptable)


# ─── Title normalization + clustering ─────────────────────────────────────────

def normalize_title(title):
    """Lowercase, strip punctuation, remove common prefixes."""
    t = title.lower().strip()
    # Remove common prefixes like "Show HN:", "Ask HN:", etc.
    t = re.sub(r'^(show|ask|tell|launch)\s+hn:\s*', '', t)
    t = re.sub(r'^(r/\w+:?\s*)', '', t)
    # Strip punctuation
    t = re.sub(r'[^\w\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def extract_key_terms(title):
    """Extract top significant words from a title."""
    normalized = normalize_title(title)
    words = normalized.split()
    terms = [w for w in words if w not in STOPWORDS and w not in COMMON_TERMS and len(w) > 2]
    return set(terms[:5])


def jaccard_similarity(set_a, set_b):
    """Jaccard similarity between two sets."""
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


def extract_domain(url):
    """Extract base domain from URL."""
    if not url or not isinstance(url, str):
        return None
    match = re.search(r'https?://(?:www\.)?([^/]+)', url)
    return match.group(1).lower() if match else None


def cluster_trends(trends):
    """Cluster trends by fuzzy title matching and URL overlap."""
    n = len(trends)
    if n == 0:
        return []

    # Precompute key terms and domains for each trend
    terms_list = []
    domains_list = []
    word_tokens_list = []
    for t in trends:
        terms_list.append(extract_key_terms(t["title"]))
        urls = t.get("urls", [])
        domains = set()
        for u in urls:
            d = extract_domain(u)
            if d:
                domains.add(d)
        domains_list.append(domains)
        word_tokens_list.append(set(normalize_title(t["title"]).split()))

    # Union-Find for clustering
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            # Check key term overlap (≥ 2)
            overlap = len(terms_list[i] & terms_list[j])
            if overlap >= 2:
                union(i, j)
                continue

            # Check Jaccard similarity on word tokens (> 50%)
            sim = jaccard_similarity(word_tokens_list[i], word_tokens_list[j])
            if sim > 0.5:
                union(i, j)
                continue

            # Check shared URL domain
            if domains_list[i] and domains_list[j] and (domains_list[i] & domains_list[j]):
                union(i, j)

    # Build clusters
    clusters = {}
    for i in range(n):
        root = find(i)
        if root not in clusters:
            clusters[root] = []
        clusters[root].append(i)

    return [indices for indices in clusters.values()]


def merge_cluster(trends, indices):
    """Merge a cluster of trends into a single trend."""
    items = [trends[i] for i in indices]

    # Pick title from highest-scored item
    best = max(items, key=lambda t: t.get("_source_score", 0))

    # Pick why_trending from longest explanation
    best_why = max(items, key=lambda t: len(t.get("why_trending", "")))
    best_desc = max(items, key=lambda t: len(t.get("description", "")))

    # Collect all sources and URLs
    all_sources = []
    all_urls = []
    seen_sources = set()
    seen_urls = set()
    for item in items:
        for s in item.get("sources", []):
            if s not in seen_sources:
                all_sources.append(s)
                seen_sources.add(s)
        for u in item.get("urls", []):
            if u and u not in seen_urls:
                all_urls.append(u)
                seen_urls.add(u)

    # Use the best source score as the base
    best_source_score = max(t.get("_source_score", 0) for t in items)

    merged = {
        "title": best["title"],
        "description": best_desc.get("description", ""),
        "why_trending": best_why.get("why_trending", ""),
        "momentum": best.get("momentum", "new"),
        "popularity": {
            "score": best_source_score,
            "metric": best.get("popularity", {}).get("metric", ""),
            "reach": best.get("popularity", {}).get("reach", "medium"),
        },
        "sources": all_sources,
        "urls": all_urls,
        "first_seen": best.get("first_seen"),
        "relevance": best.get("relevance", "medium"),
        "_source_score": best_source_score,
        "_platform_count": len(all_sources),
    }
    return merged


# ─── Recency boost ────────────────────────────────────────────────────────────

def recency_boost(item):
    """Boost score based on how fresh the item is."""
    first_seen = item.get("first_seen")
    if not first_seen or not isinstance(first_seen, str):
        return 0

    try:
        # Handle various ISO formats
        ts = first_seen.replace("Z", "+00:00")
        if "+" not in ts and "-" not in ts[10:]:
            ts += "+00:00"
        dt = datetime.fromisoformat(ts)
        now = datetime.now(timezone.utc)
        hours_old = (now - dt).total_seconds() / 3600
        if hours_old < 6:
            return 5
        elif hours_old < 12:
            return 3
    except (ValueError, TypeError):
        pass
    return 0


# ─── Momentum derivation ─────────────────────────────────────────────────────

def derive_momentum(item, source_name, raw_item=None):
    """Override AI momentum with data-derived momentum when metrics exist."""
    ai_momentum = item.get("momentum", "new")

    if raw_item:
        # CoinGecko price change
        if source_name == "CoinGecko":
            pc = raw_item.get("priceChange", "")
            if isinstance(pc, str) and pc:
                try:
                    num = float(pc.replace("%", "").replace("(24h)", "").replace("+", "").strip())
                    if num > 20:
                        return "viral"
                    elif num > 5:
                        return "rising"
                    elif num < -10:
                        return "falling"
                except ValueError:
                    pass

        # GitHub stars
        if source_name == "GitHub Trending":
            extra = raw_item.get("extra", {})
            if isinstance(extra, dict):
                today = extra.get("todayStars", 0)
                if isinstance(today, (int, float)):
                    if today > 1000:
                        return "viral"
                    elif today > 300:
                        return "rising"

        # Recency-based "new"
        pub = raw_item.get("publishedAt") or item.get("first_seen")
        if pub and isinstance(pub, str):
            try:
                ts = pub.replace("Z", "+00:00")
                if "+" not in ts and "-" not in ts[10:]:
                    ts += "+00:00"
                dt = datetime.fromisoformat(ts)
                hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
                if hours < 3:
                    return "new"
            except (ValueError, TypeError):
                pass

    return ai_momentum


# ─── Metric formatting ───────────────────────────────────────────────────────

def format_number(n):
    """Format a number with K/M suffixes."""
    if not isinstance(n, (int, float)) or n <= 0:
        return ""
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(int(n))


def build_metric(raw_item, source_name):
    """Build a human-readable metric string from raw scraper data."""
    if not raw_item:
        return ""

    parts = []

    if source_name == "Hacker News":
        score = raw_item.get("score", 0)
        comments = raw_item.get("comments", 0)
        if score:
            parts.append(f"{score} pts")
        if comments:
            parts.append(f"{comments} comments")

    elif source_name == "GitHub Trending":
        stars = raw_item.get("stars", 0)
        extra = raw_item.get("extra", {})
        today = extra.get("todayStars", 0) if isinstance(extra, dict) else 0
        if stars:
            parts.append(f"{format_number(stars)} stars")
        if today:
            parts.append(f"+{format_number(today)} today")

    elif source_name in ("TikTok",):
        views = raw_item.get("views", 0)
        extra = raw_item.get("extra", {})
        likes = extra.get("likes", 0) if isinstance(extra, dict) else 0
        if views:
            parts.append(f"{format_number(views)} views")
        if likes:
            parts.append(f"{format_number(likes)} likes")

    elif source_name == "YouTube":
        views = raw_item.get("views", 0)
        comments = raw_item.get("comments", 0)
        if views:
            parts.append(f"{format_number(views)} views")
        if comments:
            parts.append(f"{format_number(comments)} comments")

    elif source_name == "CoinGecko":
        pc = raw_item.get("priceChange", "")
        if pc:
            parts.append(f"{pc} (24h)")

    elif source_name == "Dev.to":
        score = raw_item.get("score", 0)
        comments = raw_item.get("comments", 0)
        if score:
            parts.append(f"{score} reactions")
        if comments:
            parts.append(f"{comments} comments")

    elif source_name == "Lobsters":
        score = raw_item.get("score", 0)
        comments = raw_item.get("comments", 0)
        if score:
            parts.append(f"{score} pts")
        if comments:
            parts.append(f"{comments} comments")

    elif source_name == "Bluesky":
        score = raw_item.get("score", 0)
        reposts = raw_item.get("reposts", 0)
        replies = raw_item.get("comments", 0)
        if score:
            parts.append(f"{score} likes")
        if reposts:
            parts.append(f"{reposts} reposts")
        if replies:
            parts.append(f"{replies} replies")

    elif source_name == "Google Trends":
        views = raw_item.get("views", 0)
        if views:
            parts.append(f"{format_number(views)} searches")

    elif source_name == "Product Hunt":
        score = raw_item.get("score", 0)
        if score:
            parts.append(f"{score} upvotes")

    else:
        # Generic fallback
        for key, label in [("score", "pts"), ("views", "views"), ("stars", "stars"), ("comments", "comments")]:
            val = raw_item.get(key)
            if val and isinstance(val, (int, float)) and val > 0:
                parts.append(f"{format_number(val)} {label}")

    return " | ".join(parts)


# ─── Main scoring pipeline ───────────────────────────────────────────────────

def match_raw_item(agent_trend, raw_items):
    """Find the raw scraper item that matches an agent-enriched trend."""
    title = agent_trend.get("title", "").lower().strip()
    urls = set(agent_trend.get("urls", []))

    # Try URL match first
    for item in raw_items:
        item_url = item.get("url", "")
        if isinstance(item_url, dict):
            item_url = item_url.get("@_href", "")
        if item_url and item_url in urls:
            return item

    # Try title match
    for item in raw_items:
        raw_title = item.get("title", "").lower().strip()
        if raw_title and (raw_title == title or raw_title in title or title in raw_title):
            return item

    # Fuzzy: key term overlap
    agent_terms = extract_key_terms(title)
    best_match = None
    best_overlap = 0
    for item in raw_items:
        raw_terms = extract_key_terms(item.get("title", ""))
        overlap = len(agent_terms & raw_terms)
        if overlap > best_overlap:
            best_overlap = overlap
            best_match = item
    if best_overlap >= 2:
        return best_match

    return None


def run_scoring(agents_dir, sources_dir, raw_data_file, output_file):
    """Main scoring pipeline."""
    # Load raw scraper data
    scraper_by_name = {}
    try:
        with open(raw_data_file) as f:
            raw_data = json.load(f)
        for src in raw_data.get("sources", []):
            name = src.get("source", "")
            scraper_by_name[name] = src.get("items", [])
    except Exception as e:
        print(f"  Warning: could not load raw data: {e}", file=sys.stderr)

    # Load manifest
    manifest_file = os.path.join(sources_dir, "_manifest.json")
    try:
        with open(manifest_file) as f:
            manifest = json.load(f)
    except Exception as e:
        print(f"  Error: could not load manifest: {e}", file=sys.stderr)
        sys.exit(1)

    # Process each source: load agent output + raw data, compute scores
    all_scored = []
    categories = []
    sources_ok = 0
    sources_failed = []
    agent_enriched = 0
    fallback_used = 0

    VALID_MOMENTUM = {"rising", "falling", "stable", "new", "viral"}

    for entry in manifest:
        name = entry["name"]
        if name == "Social Trend Blogs":
            continue
        if entry["status"] != "ok" or not entry.get("file"):
            if entry["status"] in ("error", "skipped"):
                sources_failed.append(name)
            continue

        sources_ok += 1
        safe_name = entry.get("safe_name", "")
        agent_file = os.path.join(agents_dir, f"{safe_name}.json")
        raw_items = scraper_by_name.get(name, [])

        trends = []
        used_agent = False

        # Try loading agent output
        if os.path.exists(agent_file) and os.path.getsize(agent_file) > 0:
            try:
                with open(agent_file) as f:
                    raw_text = f.read().strip()
                raw_text = re.sub(r'```json\s*', '', raw_text)
                raw_text = re.sub(r'```\s*', '', raw_text).strip()
                agent_json = json.loads(raw_text)

                if "trends" in agent_json and isinstance(agent_json["trends"], list):
                    for t in agent_json["trends"]:
                        title = t.get("title", "").strip()
                        if not title:
                            continue

                        # Find matching raw item for real metrics
                        raw_item = match_raw_item(t, raw_items)

                        # Source-normalized score (from raw data, NOT AI)
                        src_score = source_normalized_score(raw_item or {}, name)

                        # Build real metric string
                        metric = build_metric(raw_item, name)
                        if not metric:
                            metric = t.get("popularity", {}).get("metric", "")

                        # Momentum
                        mom = t.get("momentum", "new")
                        if mom not in VALID_MOMENTUM:
                            mom = "new"
                        mom = derive_momentum(t, name, raw_item)

                        # Reach from score
                        reach = "high" if src_score >= 70 else "medium" if src_score >= 40 else "low"

                        # URLs
                        urls = t.get("urls", [])
                        if isinstance(urls, str):
                            urls = [urls]

                        trends.append({
                            "title": title,
                            "description": t.get("description", ""),
                            "why_trending": t.get("why_trending", ""),
                            "momentum": mom,
                            "popularity": {"score": src_score, "metric": metric, "reach": reach},
                            "sources": [name],
                            "urls": urls,
                            "first_seen": t.get("first_seen"),
                            "relevance": t.get("relevance", "medium"),
                            "_source_score": src_score,
                        })

                    used_agent = True
                    agent_enriched += 1
            except Exception as e:
                print(f"    Agent parse error for {name}: {e}", file=sys.stderr)

        # Fallback: use raw scraper data directly
        if not used_agent:
            for item in raw_items:
                title = item.get("title", "").strip()
                if not title:
                    continue

                src_score = source_normalized_score(item, name)
                metric = build_metric(item, name)
                mom = derive_momentum({}, name, item)
                reach = "high" if src_score >= 70 else "medium" if src_score >= 40 else "low"

                raw_url = item.get("url", "")
                if isinstance(raw_url, dict):
                    raw_url = raw_url.get("@_href", "")
                urls = [raw_url] if raw_url and isinstance(raw_url, str) else []

                trends.append({
                    "title": title,
                    "description": item.get("description", "") or "",
                    "why_trending": "",
                    "momentum": mom,
                    "popularity": {"score": src_score, "metric": metric, "reach": reach},
                    "sources": [name],
                    "urls": urls,
                    "first_seen": item.get("publishedAt"),
                    "relevance": reach,
                    "_source_score": src_score,
                })
            if raw_items:
                fallback_used += 1

        all_scored.extend(trends)

    print(f"  Pre-merge: {len(all_scored)} items from {sources_ok} sources ({agent_enriched} agent, {fallback_used} fallback)", file=sys.stderr)

    # ── Cross-platform clustering ──
    clusters = cluster_trends(all_scored)
    merged_trends = []
    merged_count = 0

    for indices in clusters:
        if len(indices) == 1:
            merged_trends.append(all_scored[indices[0]])
        else:
            merged = merge_cluster(all_scored, indices)
            merged_trends.append(merged)
            merged_count += 1

    print(f"  Clusters: {len(clusters)} ({merged_count} merged from duplicates)", file=sys.stderr)

    # ── Apply cross-platform bonus + recency + momentum ──
    for trend in merged_trends:
        score = trend.get("_source_score", RSS_BASE_SCORE)
        platform_count = trend.get("_platform_count", len(trend.get("sources", [])))

        # Cross-platform bonus
        bonus = PLATFORM_BONUS.get(platform_count, 25)
        score += bonus

        # Recency boost
        score += recency_boost(trend)

        # Momentum multiplier
        mom = trend.get("momentum", "stable")
        mult = MOMENTUM_MULT.get(mom, 1.0)
        score = int(score * mult)

        # Clamp
        score = max(1, min(100, score))

        trend["popularity"]["score"] = score
        trend["popularity"]["reach"] = "high" if score >= 70 else "medium" if score >= 40 else "low"

        # Clean up internal fields
        trend.pop("_source_score", None)
        trend.pop("_platform_count", None)

    # Sort by final score
    merged_trends.sort(key=lambda t: t["popularity"]["score"], reverse=True)

    # ── Build categories (group by first source) ──
    cat_map = {}
    for trend in merged_trends:
        primary_source = trend["sources"][0] if trend["sources"] else "Unknown"
        if primary_source not in cat_map:
            cat_map[primary_source] = []
        cat_map[primary_source].append(trend)

    categories = [{"name": name, "trends": trends} for name, trends in cat_map.items()]
    categories.sort(key=lambda c: len(c["trends"]), reverse=True)

    total_items = len(merged_trends)

    # ── Build direction map for top_movers placeholder ──
    direction_map = {"rising": "up", "viral": "up", "new": "new", "falling": "down", "stable": "stable"}
    top_movers = [
        {"title": t["title"], "direction": direction_map.get(t["momentum"], "up"), "delta": f"Score: {t['popularity']['score']}"}
        for t in merged_trends[:5]
    ]

    # ── Output (same shape as _final.json) ──
    now = datetime.now(timezone.utc).isoformat()
    output = {
        "type": "",  # filled by caller
        "timestamp": now,
        "data_quality": {
            "sources_ok": sources_ok,
            "sources_failed": sources_failed,
            "total_raw_items": total_items,
            "agent_enriched": agent_enriched,
            "fallback_used": fallback_used,
        },
        "categories": categories,
        "top_movers": top_movers,
        "signals": {"emerging": [], "fading": []},
        "summary": "",
    }

    with open(output_file, "w") as f:
        json.dump(output, f)

    print(f"  Scored: {total_items} trends → {output_file}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TrendClaw Scoring Agent")
    parser.add_argument("--agents-dir", required=True, help="Dir with per-source agent JSON outputs")
    parser.add_argument("--sources-dir", required=True, help="Dir with per-source raw scraper JSON")
    parser.add_argument("--raw-data", required=True, help="Combined scraper output JSON")
    parser.add_argument("--output", required=True, help="Output file path")
    args = parser.parse_args()

    run_scoring(args.agents_dir, args.sources_dir, args.raw_data, args.output)
