#!/usr/bin/env bash
set -euo pipefail

# Load env (set -a exports all sourced vars to child processes like node)
set -a
source ~/.openclaw/.env
set +a

TYPE="${1:-pulse}"
WEBHOOK_URL="${TRENDCLAW_WEBHOOK_URL:-http://localhost:3000/api/trends}"
WEBHOOK_TOKEN="${OPENCLAW_HOOKS_TOKEN:-}"
SCRAPER_DIR="$HOME/trendclaw-app/scraper"
SCRAPER_OUTPUT="${SCRAPER_OUTPUT_DIR:-$SCRAPER_DIR/output}"
DATA_FILE="$SCRAPER_OUTPUT/latest-${TYPE}.json"
GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"
MEMORY_DIR="$HOME/.openclaw/workspace/memory"
TMP_DIR="/tmp/trendclaw-sources"
AGENT_OUT_DIR="/tmp/trendclaw-agent-out"

echo "[$(date -u +%H:%M:%S)] TrendClaw $TYPE run starting (agent pipeline)"

# ─── Step 1: Run scraper ───────────────────────────────────────────────────────
echo "[$(date -u +%H:%M:%S)] Running scraper..."
cd "$SCRAPER_DIR"
node dist/index.js --type "$TYPE" 2>&1 || echo "WARNING: scraper had errors"

DEBUG_DIR="$HOME/trendclaw-app/debug"
mkdir -p "$DEBUG_DIR"
cp "$DATA_FILE" "$DEBUG_DIR/scraper-${TYPE}-$(date +%s).json" 2>/dev/null || true

# ─── Step 2: Split scraper output into per-source temp files ───────────────────
echo "[$(date -u +%H:%M:%S)] Splitting sources..."

rm -rf "$TMP_DIR" "$AGENT_OUT_DIR"
mkdir -p "$TMP_DIR" "$AGENT_OUT_DIR" "$MEMORY_DIR"

SPLIT_SCRIPT=$(mktemp /tmp/trendclaw-split-XXXXXX.py)
cat > "$SPLIT_SCRIPT" << 'PYEOF'
import sys, json, re, os

data_file = sys.argv[1]
tmp_dir = sys.argv[2]

with open(data_file) as f:
    data = json.load(f)

sources = data.get('sources', [])
manifest = []

for src in sources:
    name = src.get('source', 'Unknown')
    status = src.get('status', 'error')
    items = src.get('items', [])

    if status != 'ok' or not items:
        manifest.append({'name': name, 'status': status, 'items': 0, 'file': None})
        continue

    # Sanitize name for filename
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name.lower().replace(' ', '_'))
    out_file = os.path.join(tmp_dir, f"{safe_name}.json")

    with open(out_file, 'w') as f:
        json.dump({'source': name, 'items': items}, f)

    manifest.append({'name': name, 'status': 'ok', 'items': len(items), 'file': out_file, 'safe_name': safe_name})

# Write manifest
manifest_file = os.path.join(tmp_dir, '_manifest.json')
with open(manifest_file, 'w') as f:
    json.dump(manifest, f)

ok_count = sum(1 for s in manifest if s['status'] == 'ok')
total_items = sum(s['items'] for s in manifest)
print(f"{ok_count} sources with {total_items} items")
PYEOF

SPLIT_RESULT=$(python3 "$SPLIT_SCRIPT" "$DATA_FILE" "$TMP_DIR" 2>&1)
rm -f "$SPLIT_SCRIPT"
echo "[$(date -u +%H:%M:%S)] Split: $SPLIT_RESULT"

# ─── Step 3: Parallel per-source agent calls (direct OpenAI API) ───────────────
echo "[$(date -u +%H:%M:%S)] Launching per-source agents (parallel)..."

TODAY=$(date -u +%Y-%m-%d)

SOURCE_AGENT_SCRIPT=$(mktemp /tmp/trendclaw-agents-XXXXXX.py)
cat > "$SOURCE_AGENT_SCRIPT" << 'PYEOF'
import sys, json, os, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.error import URLError

manifest_file = sys.argv[1]
agent_out_dir = sys.argv[2]
today = sys.argv[3]
run_type = sys.argv[4]
api_key = os.environ.get('OPENAI_API_KEY', '')

with open(manifest_file) as f:
    manifest = json.load(f)

active = [s for s in manifest if s.get('file')]

def call_openai(source_name, safe_name, item_count, source_file):
    """Call OpenAI gpt-4o-mini for a single source."""
    with open(source_file) as f:
        source_data = json.dumps(json.load(f))

    prompt = f"""Today is {today}. Run type: {run_type}. You are analyzing {source_name} ({item_count} items).

Here is the data:
{source_data}

For each item, determine:
- Momentum: rising (growing engagement), falling (declining), stable, new (first appearance), viral (>10x growth)
- Why is it trending? Explain the catalyst in 1-2 sentences.
- Score 0-100 based on engagement signals. Include raw numbers in the metric field.

Return ONLY a JSON object:
{{
  "source": "{source_name}",
  "trends": [
    {{
      "title": "...",
      "description": "1-2 sentence factual summary",
      "why_trending": "Why this is trending right now",
      "momentum": "rising|falling|stable|new|viral",
      "popularity": {{"score": 0-100, "metric": "raw numbers from data", "reach": "high|medium|low"}},
      "urls": ["..."],
      "first_seen": "ISO date or null",
      "relevance": "high|medium|low"
    }}
  ]
}}"""

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are a trend analysis agent. Return ONLY valid JSON, no markdown fences."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }).encode()

    req = Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )

    start = time.time()
    resp = urlopen(req, timeout=60)
    result = json.loads(resp.read().decode())
    content = result['choices'][0]['message']['content']
    elapsed = time.time() - start

    # Write raw output to file
    out_file = os.path.join(agent_out_dir, f"{safe_name}.json")
    with open(out_file, 'w') as f:
        f.write(content)

    return safe_name, source_name, len(content), elapsed

succeeded = 0
failed = 0

with ThreadPoolExecutor(max_workers=10) as pool:
    futures = {}
    for src in active:
        fut = pool.submit(
            call_openai,
            src['name'], src['safe_name'], src['items'], src['file']
        )
        futures[fut] = src

    for fut in as_completed(futures):
        src = futures[fut]
        try:
            safe, name, size, elapsed = fut.result()
            succeeded += 1
            print(f"  ✓ {name}: {size}b ({elapsed:.1f}s)")
        except Exception as e:
            failed += 1
            err_str = str(e)
            print(f"  ✗ {src['name']}: {err_str[:120]}")
            # Write error to err file
            err_file = os.path.join(agent_out_dir, f"{src['safe_name']}.err")
            with open(err_file, 'w') as ef:
                ef.write(err_str)

print(f"\n  Source agents done: {succeeded} succeeded, {failed} failed")
PYEOF

python3 "$SOURCE_AGENT_SCRIPT" "$TMP_DIR/_manifest.json" "$AGENT_OUT_DIR" "$TODAY" "$TYPE"
rm -f "$SOURCE_AGENT_SCRIPT"

# ─── Step 4: Aggregate source agent outputs + summary agent ───────────────────
echo "[$(date -u +%H:%M:%S)] Aggregating results..."

AGG_SCRIPT=$(mktemp /tmp/trendclaw-agg-XXXXXX.py)
cat > "$AGG_SCRIPT" << 'PYEOF'
import sys, json, math, os, re
from datetime import datetime, timezone

run_type = sys.argv[1]
data_file = sys.argv[2]
agent_out_dir = sys.argv[3]
tmp_dir = sys.argv[4]
now = datetime.now(timezone.utc).isoformat()
today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

# ── Load manifest ──
with open(os.path.join(tmp_dir, '_manifest.json')) as f:
    manifest = json.load(f)

# ── Load original scraper data for fallback ──
with open(data_file) as f:
    scraper_data = json.load(f)
scraper_by_name = {}
for src in scraper_data.get('sources', []):
    scraper_by_name[src.get('source', '')] = src

VALID_MOMENTUM = {'rising', 'falling', 'stable', 'new', 'viral'}

def log_score(raw_val):
    if raw_val <= 0:
        return 1
    if raw_val <= 1:
        return max(1, int(raw_val))
    return min(100, max(1, int(30 + 70 * math.log10(raw_val) / math.log10(100000))))

def build_metric(item):
    parts = []
    if item.get('score') and item.get('comments'):
        parts.append(f"{item['score']} pts, {item['comments']} comments")
    elif item.get('score'):
        parts.append(f"{item['score']} pts")
    if item.get('views'):
        v = item['views']
        if v >= 1_000_000:
            parts.append(f"{v/1_000_000:.1f}M views")
        elif v >= 1_000:
            parts.append(f"{v/1_000:.1f}K views")
        else:
            parts.append(f"{v} views")
    if item.get('stars'):
        s = item['stars']
        if s >= 1_000:
            parts.append(f"{s/1_000:.1f}K stars")
        else:
            parts.append(f"{s} stars")
        extra = item.get('extra', {})
        if extra.get('todayStars'):
            ts = str(extra['todayStars']).replace(' stars today', '').replace(' today', '')
            parts.append(f"+{ts} today")
    if item.get('priceChange'):
        parts.append(item['priceChange'])
    if item.get('volume') and 'undefined' not in str(item['volume']):
        parts.append(f"vol {item['volume']}")
    if item.get('marketCap') and 'undefined' not in str(item['marketCap']):
        parts.append(f"mcap {item['marketCap']}")
    if item.get('rank'):
        parts.append(f"#{item['rank']}")
    if not parts and item.get('comments'):
        parts.append(f"{item['comments']} comments")
    return ' | '.join(parts)

def get_raw_score(item):
    if item.get('score') and isinstance(item['score'], (int, float)) and item['score'] > 0:
        return item['score']
    if item.get('views') and isinstance(item['views'], (int, float)) and item['views'] > 0:
        return item['views']
    if item.get('stars') and isinstance(item['stars'], (int, float)) and item['stars'] > 0:
        return item['stars']
    if item.get('comments') and isinstance(item['comments'], (int, float)) and item['comments'] > 0:
        return item['comments'] * 5
    return 0

def derive_momentum(item):
    pc = item.get('priceChange', '')
    if isinstance(pc, str) and pc:
        try:
            num = float(pc.replace('%', '').replace('(24h)', '').replace('+', '').strip())
            if num > 10:
                return 'viral'
            elif num > 0:
                return 'rising'
            elif num < -5:
                return 'falling'
            elif num < 0:
                return 'stable'
        except ValueError:
            pass
    growth = item.get('growth', '')
    if isinstance(growth, str) and growth:
        if '+' in growth:
            return 'rising'
        elif '-' in growth:
            return 'falling'
    return 'new'

def fallback_parse_source(name, items):
    """Fallback: parse source items using the old Python parser logic."""
    trends = []
    for item in items:
        title = item.get('title', '').strip()
        if not title:
            continue
        raw = get_raw_score(item)
        score = log_score(raw) if raw > 0 else 10
        reach = 'high' if score >= 70 else 'medium' if score >= 40 else 'low'
        momentum = derive_momentum(item)
        metric = build_metric(item)
        raw_url = item.get('url', '')
        if isinstance(raw_url, dict):
            raw_url = raw_url.get('@_href', raw_url.get('href', ''))
        urls = [raw_url] if raw_url and isinstance(raw_url, str) else []
        trends.append({
            'title': title,
            'description': item.get('description', '') or '',
            'why_trending': '',
            'momentum': momentum,
            'popularity': {'score': score, 'metric': metric, 'reach': reach},
            'sources': [name],
            'urls': urls,
            'first_seen': item.get('publishedAt', None),
            'relevance': 'high' if score >= 70 else 'medium' if score >= 40 else 'low'
        })
    trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
    return trends

def extract_json_from_agent(raw_text):
    """Extract JSON from agent output envelope or raw text."""
    if not raw_text or not raw_text.strip():
        return None
    text = raw_text.strip()

    # Try direct JSON parse first
    try:
        obj = json.loads(text)
        # Handle OpenClaw envelope: {runId, status, result: {payloads: [{text: "..."}]}}
        if 'result' in obj and 'payloads' in obj.get('result', {}):
            payload_text = obj['result']['payloads'][0].get('text', '')
            return extract_json_from_text(payload_text)
        # Direct JSON with "trends" key
        if 'trends' in obj or 'source' in obj:
            return obj
        return obj
    except (json.JSONDecodeError, KeyError, IndexError):
        pass

    return extract_json_from_text(text)

def extract_json_from_text(text):
    """Extract JSON object from text that may contain markdown fences."""
    if not text:
        return None
    # Strip markdown fences
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    text = text.strip()

    # Find JSON object using brace depth matching
    start = text.find('{')
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i+1])
                except json.JSONDecodeError:
                    return None
    return None

# ── Process each source: agent output or fallback ──
categories = []
all_enriched_trends = []
sources_ok = 0
sources_failed = []
agent_enriched = 0
fallback_used = 0

for entry in manifest:
    name = entry['name']
    status = entry['status']

    if status != 'ok' or not entry.get('file'):
        if status == 'error':
            sources_failed.append(name)
        elif status == 'skipped':
            sources_failed.append(f"{name} (skipped)")
        continue

    sources_ok += 1
    safe_name = entry.get('safe_name', '')
    agent_file = os.path.join(agent_out_dir, f"{safe_name}.json")
    agent_err_file = os.path.join(agent_out_dir, f"{safe_name}.err")

    trends = None

    # Try agent output first
    if os.path.exists(agent_file) and os.path.getsize(agent_file) > 0:
        try:
            with open(agent_file) as f:
                raw = f.read()
            agent_json = extract_json_from_agent(raw)
            if agent_json and 'trends' in agent_json:
                agent_trends = agent_json['trends']
                if isinstance(agent_trends, list) and len(agent_trends) > 0:
                    # Normalize agent trends to dashboard schema
                    trends = []
                    for t in agent_trends:
                        momentum = t.get('momentum', 'new')
                        if momentum not in VALID_MOMENTUM:
                            momentum = 'new'
                        score = t.get('popularity', {}).get('score', 50)
                        if not isinstance(score, (int, float)):
                            score = 50
                        score = max(1, min(100, int(score)))
                        reach = t.get('popularity', {}).get('reach', 'medium')
                        if reach not in ('high', 'medium', 'low'):
                            reach = 'high' if score >= 70 else 'medium' if score >= 40 else 'low'
                        metric = t.get('popularity', {}).get('metric', '')
                        urls = t.get('urls', [])
                        if isinstance(urls, str):
                            urls = [urls]
                        trends.append({
                            'title': t.get('title', ''),
                            'description': t.get('description', ''),
                            'why_trending': t.get('why_trending', ''),
                            'momentum': momentum,
                            'popularity': {'score': score, 'metric': metric, 'reach': reach},
                            'sources': [name],
                            'urls': urls,
                            'first_seen': t.get('first_seen', None),
                            'relevance': t.get('relevance', 'medium')
                        })
                    trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
                    agent_enriched += 1
                    print(f"  ✓ {name}: {len(trends)} trends from agent", file=sys.stderr)
        except Exception as e:
            print(f"  ✗ {name}: agent parse error: {e}", file=sys.stderr)
            if os.path.exists(agent_err_file):
                with open(agent_err_file) as ef:
                    err_content = ef.read().strip()
                if err_content:
                    print(f"    stderr: {err_content[:200]}", file=sys.stderr)

    # Fallback to Python parser
    if trends is None:
        src_data = scraper_by_name.get(name, {})
        items = src_data.get('items', [])
        if items:
            trends = fallback_parse_source(name, items)
            fallback_used += 1
            print(f"  ↩ {name}: {len(trends)} trends from fallback", file=sys.stderr)
        else:
            trends = []
            print(f"  ✗ {name}: no items, skipping", file=sys.stderr)

    if trends:
        categories.append({'name': name, 'trends': trends})
        all_enriched_trends.extend(trends)

# Sort categories by number of trends descending
categories.sort(key=lambda c: len(c['trends']), reverse=True)

print(f"\n  Agent enriched: {agent_enriched} sources, Fallback: {fallback_used} sources", file=sys.stderr)

# ── Write enriched trends to a temp file for summary agent ──
summary_input_file = os.path.join(tmp_dir, '_enriched_all.json')
with open(summary_input_file, 'w') as f:
    json.dump(all_enriched_trends, f)

# ── Build preliminary output (will be enhanced by summary agent) ──
all_enriched_trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
direction_map = {'rising': 'up', 'viral': 'up', 'new': 'new', 'falling': 'down', 'stable': 'stable'}
top_movers = []
for tr in all_enriched_trends[:5]:
    top_movers.append({
        'title': tr['title'],
        'direction': direction_map.get(tr['momentum'], 'up'),
        'delta': f"Score: {tr['popularity']['score']}"
    })

total_items = sum(len(c['trends']) for c in categories)

output = {
    'type': run_type,
    'timestamp': now,
    'data_quality': {
        'sources_ok': sources_ok,
        'sources_failed': sources_failed,
        'total_raw_items': total_items,
        'agent_enriched': agent_enriched,
        'fallback_used': fallback_used
    },
    'categories': categories,
    'top_movers': top_movers,
    'signals': {'emerging': [], 'fading': []},
    'summary': f'{total_items} items from {sources_ok} sources ({agent_enriched} agent-enriched).'
}

# Write preliminary output (will be overwritten if summary agent succeeds)
prelim_file = os.path.join(tmp_dir, '_preliminary.json')
with open(prelim_file, 'w') as f:
    json.dump(output, f)

PYEOF

python3 "$AGG_SCRIPT" "$TYPE" "$DATA_FILE" "$AGENT_OUT_DIR" "$TMP_DIR"
rm -f "$AGG_SCRIPT"
# Preliminary output is now at $TMP_DIR/_preliminary.json

# ─── Step 5: Summary agent call (direct OpenAI gpt-4o) ────────────────────────
echo ""
echo "[$(date -u +%H:%M:%S)] Running summary agent..."

ENRICHED_FILE="$TMP_DIR/_enriched_all.json"
SUMMARY_OUT="$AGENT_OUT_DIR/_summary.json"

SUMMARY_SCRIPT=$(mktemp /tmp/trendclaw-summary-XXXXXX.py)
cat > "$SUMMARY_SCRIPT" << 'PYEOF'
import sys, json, os, time
from urllib.request import Request, urlopen

enriched_file = sys.argv[1]
summary_out = sys.argv[2]
today = sys.argv[3]
run_type = sys.argv[4]
api_key = os.environ.get('OPENAI_API_KEY', '')

with open(enriched_file) as f:
    enriched = json.load(f)

prompt = f"""Today is {today}. Run type: {run_type}. You are the TrendClaw summary agent.

Here are {len(enriched)} enriched trends from multiple sources (already analyzed by source agents):

{json.dumps(enriched, indent=1)}

Your job:
1. Cross-reference: find trends that appear across multiple sources and merge them
2. Generate top_movers (top 5 by significance, noting direction)
3. Generate signals: emerging (notable new trends) and fading (if any seem to be losing steam)
4. Write a 3-5 sentence executive summary

Return ONLY a JSON object:
{{
  "top_movers": [{{"title": "...", "direction": "up|down|new", "delta": "brief description"}}],
  "signals": {{"emerging": ["..."], "fading": ["..."]}},
  "summary": "3-5 sentence executive summary"
}}"""

body = json.dumps({
    "model": "gpt-4o",
    "messages": [
        {"role": "system", "content": "You are a trend intelligence analyst. Return ONLY valid JSON, no markdown fences."},
        {"role": "user", "content": prompt}
    ],
    "temperature": 0.3,
    "response_format": {"type": "json_object"}
}).encode()

req = Request(
    "https://api.openai.com/v1/chat/completions",
    data=body,
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
)

try:
    start = time.time()
    resp = urlopen(req, timeout=60)
    result = json.loads(resp.read().decode())
    content = result['choices'][0]['message']['content']
    elapsed = time.time() - start

    with open(summary_out, 'w') as f:
        f.write(content)
    print(f"  ✓ Summary agent: {len(content)}b ({elapsed:.1f}s)")
except Exception as e:
    print(f"  ✗ Summary agent failed: {str(e)[:120]}")
PYEOF

python3 "$SUMMARY_SCRIPT" "$ENRICHED_FILE" "$SUMMARY_OUT" "$TODAY" "$TYPE"
rm -f "$SUMMARY_SCRIPT"

# ─── Step 6: Merge summary into final output ──────────────────────────────────
echo "[$(date -u +%H:%M:%S)] Merging summary..."

MERGE_SCRIPT=$(mktemp /tmp/trendclaw-merge-XXXXXX.py)
cat > "$MERGE_SCRIPT" << 'PYEOF'
import sys, json, re, os
from datetime import datetime, timezone

preliminary_file = sys.argv[1]
summary_file = sys.argv[2]
memory_dir = sys.argv[3]
run_type = sys.argv[4]

today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
now = datetime.now(timezone.utc).isoformat()

# Load preliminary output from file
with open(preliminary_file) as f:
    output = json.load(f)

def extract_json_from_agent(raw_text):
    if not raw_text or not raw_text.strip():
        return None
    text = raw_text.strip()
    try:
        obj = json.loads(text)
        if 'result' in obj and 'payloads' in obj.get('result', {}):
            payload_text = obj['result']['payloads'][0].get('text', '')
            return extract_json_from_text(payload_text)
        if 'top_movers' in obj or 'summary' in obj:
            return obj
        return obj
    except (json.JSONDecodeError, KeyError, IndexError):
        pass
    return extract_json_from_text(text)

def extract_json_from_text(text):
    if not text:
        return None
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    text = text.strip()
    start = text.find('{')
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i+1])
                except json.JSONDecodeError:
                    return None
    return None

# Try to merge summary agent output
summary_merged = False
if os.path.exists(summary_file) and os.path.getsize(summary_file) > 0:
    try:
        with open(summary_file) as f:
            raw = f.read()
        summary_json = extract_json_from_agent(raw)
        if summary_json:
            if 'top_movers' in summary_json and isinstance(summary_json['top_movers'], list):
                output['top_movers'] = summary_json['top_movers']
            if 'signals' in summary_json and isinstance(summary_json['signals'], dict):
                output['signals'] = summary_json['signals']
            if 'summary' in summary_json and isinstance(summary_json['summary'], str):
                output['summary'] = summary_json['summary']
            summary_merged = True
            print("  ✓ Summary agent merged successfully", file=sys.stderr)
    except Exception as e:
        print(f"  ✗ Summary agent parse error: {e}", file=sys.stderr)

if not summary_merged:
    print("  ↩ Using fallback summary (top 5 by score)", file=sys.stderr)

# ── Write to memory file ──
try:
    sources_ok = output.get('data_quality', {}).get('sources_ok', 0)
    total_items = output.get('data_quality', {}).get('total_raw_items', 0)
    agent_enriched = output.get('data_quality', {}).get('agent_enriched', 0)

    lines = [f"## {run_type} — {today} ({total_items} items from {sources_ok} sources, {agent_enriched} agent-enriched)\n"]

    lines.append("### Top Movers")
    for tm in output.get('top_movers', []):
        lines.append(f"- {tm['title']} ({tm.get('direction', '?')}) — {tm.get('delta', '')}")
    lines.append("")

    signals = output.get('signals', {})
    emerging = signals.get('emerging', [])
    fading = signals.get('fading', [])
    if emerging:
        lines.append("### Emerging Signals")
        for s in emerging:
            lines.append(f"- {s}")
        lines.append("")
    if fading:
        lines.append("### Fading Signals")
        for s in fading:
            lines.append(f"- {s}")
        lines.append("")

    lines.append("### Source Highlights")
    for cat in output.get('categories', [])[:10]:
        cat_name = cat['name']
        cat_trends = cat.get('trends', [])
        if cat_trends:
            highlights = [f"{t['title']} ({t['popularity']['score']}pts)" for t in cat_trends[:2]]
            lines.append(f"- **{cat_name}**: {', '.join(highlights)}")
    lines.append("")

    lines.append("### Summary")
    lines.append(output.get('summary', 'No summary available.'))
    lines.append("")

    memory_file = os.path.join(memory_dir, f"{today}.md")
    # Append if file exists (multiple runs per day), otherwise create
    mode = 'a' if os.path.exists(memory_file) else 'w'
    with open(memory_file, mode) as f:
        if mode == 'a':
            f.write("\n---\n\n")
        f.write('\n'.join(lines))
    print(f"  ✓ Memory written to {memory_file}", file=sys.stderr)
except Exception as e:
    print(f"  ✗ Memory write failed: {e}", file=sys.stderr)

# Write final output to file
final_file = os.path.join(os.path.dirname(preliminary_file), '_final.json')
with open(final_file, 'w') as f:
    json.dump(output, f)
print(f"  Final output written to {final_file}", file=sys.stderr)
PYEOF

PRELIM_FILE="$TMP_DIR/_preliminary.json"
python3 "$MERGE_SCRIPT" "$PRELIM_FILE" "$SUMMARY_OUT" "$MEMORY_DIR" "$TYPE"
rm -f "$MERGE_SCRIPT"

FINAL_FILE="$TMP_DIR/_final.json"

# ─── Step 7: POST to webhook ──────────────────────────────────────────────────
echo ""
echo "[$(date -u +%H:%M:%S)] Posting to webhook..."

# Use final output, fall back to preliminary if final doesn't exist or is invalid
POSTFILE="$FINAL_FILE"
if [ ! -s "$POSTFILE" ] || ! python3 -c "import json; json.load(open('$POSTFILE'))" 2>/dev/null; then
    echo "[$(date -u +%H:%M:%S)] WARNING: Final output invalid, falling back to preliminary"
    POSTFILE="$PRELIM_FILE"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -d @"$POSTFILE")

rm -f "$POSTFILE"

if [ "$HTTP_CODE" = "201" ]; then
  echo "[$(date -u +%H:%M:%S)] Success! Delivered to frontend (HTTP $HTTP_CODE)"
else
  echo "[$(date -u +%H:%M:%S)] WARNING: Webhook returned HTTP $HTTP_CODE"
fi

# Cleanup temp files (keep for debugging until stable)
# rm -rf "$TMP_DIR" "$AGENT_OUT_DIR"

echo "[$(date -u +%H:%M:%S)] Done. Debug files at $TMP_DIR and $AGENT_OUT_DIR"
