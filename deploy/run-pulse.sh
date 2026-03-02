#!/usr/bin/env bash
set -euo pipefail

# Load env
source ~/.openclaw/.env

TYPE="${1:-pulse}"
WEBHOOK_URL="${TRENDCLAW_WEBHOOK_URL:-http://localhost:3000/api/trends}"
WEBHOOK_TOKEN="${OPENCLAW_HOOKS_TOKEN:-}"
SCRAPER_DIR="$HOME/trendclaw-app/scraper"
DATA_FILE="$SCRAPER_DIR/output/latest-${TYPE}.json"

echo "[$(date -u +%H:%M:%S)] TrendClaw $TYPE run starting"

# Step 1: Run scraper
echo "[$(date -u +%H:%M:%S)] Running scraper..."
cd "$SCRAPER_DIR"
node dist/index.js --type "$TYPE" 2>&1 || echo "WARNING: scraper had errors"

# Step 2: Run agent via OpenClaw
echo "[$(date -u +%H:%M:%S)] Running agent..."

if [ "$TYPE" = "pulse" ]; then
  MSG="Quick pulse check. Use the trend_monitor skill. Run type: pulse.
Read the pre-collected data from $DATA_FILE.
Analyze ALL sources. Use 0-2 web_search queries for breaking news.
Return 12-15 trends with popularity scores.
MUST include trends from ALL 3 categories: Tech & AI, Crypto & Finance, Social Media. At least 3 trends per category.
For each trend include: title, description, why_trending, source, url, and popularity (metric number + unit).
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
elif [ "$TYPE" = "digest" ]; then
  MSG="Daily digest. Use the trend_monitor skill. Run type: digest.
Read the pre-collected data from $DATA_FILE.
Cross-reference trends across platforms. Use 3-5 web_search queries.
Return 18-25 trends with full popularity metrics.
MUST include trends from ALL 3 categories: Tech & AI, Crypto & Finance, Social Media. At least 5 trends per category.
For each trend include: title, description, why_trending, source, url, and popularity (metric number + unit).
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
else
  MSG="Weekly deep dive. Use the trend_monitor skill. Run type: deep_dive.
Read the pre-collected data from $DATA_FILE.
Cross-reference all platforms. Use 8-10 web_search queries.
Return 20-30 trends with full analysis.
MUST include trends from ALL 3 categories: Tech & AI, Crypto & Finance, Social Media. At least 6 trends per category.
For each trend include: title, description, why_trending, source, url, and popularity (metric number + unit).
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
fi

SESSION_ID="trendclaw-${TYPE}-$(date +%s)"
RESULT=$(openclaw agent --session-id "$SESSION_ID" --message "$MSG" --json --timeout 120 2>&1 || true)

# Save raw result to temp file to avoid shell escaping issues
TMPFILE=$(mktemp /tmp/trendclaw-XXXXXX.json)
echo "$RESULT" > "$TMPFILE"

# Extract and normalize agent output
PYSCRIPT=$(mktemp /tmp/trendclaw-parse-XXXXXX.py)
cat > "$PYSCRIPT" << 'PYEOF'
import sys, json, re
from datetime import datetime, timezone

run_type = sys.argv[1]

with open(sys.argv[2]) as f:
    raw = f.read()

text = raw

# Parse OpenClaw envelope: result.payloads[].text
try:
    envelope = json.loads(raw)
    payloads = envelope.get('result', {}).get('payloads', [])
    if payloads:
        text = payloads[0].get('text', '')
    elif 'reply' in envelope:
        text = envelope['reply']
    elif 'text' in envelope:
        text = envelope['text']
except:
    pass

# Strip markdown code fences if present
text = re.sub(r'```json\s*', '', text)
text = re.sub(r'```\s*$', '', text.strip())
text = text.strip()

# Find the outermost JSON object by matching braces
def extract_json(s):
    start = s.find('{')
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(s)):
        if s[i] == '{': depth += 1
        elif s[i] == '}': depth -= 1
        if depth == 0:
            return s[start:i+1]
    return None

json_str = extract_json(text)
now = datetime.now(timezone.utc).isoformat()

try:
    agent_data = json.loads(json_str)
    trends_list = agent_data.get('trends', [])

    # Group into categories
    cat_map = {}
    for t in trends_list:
        src = t.get('source', '')
        src_lower = src.lower()
        title_lower = t.get('title', '').lower()

        if any(k in src_lower for k in ['coingecko', 'coindesk', 'crypto', 'coin']) or \
           any(k in title_lower for k in ['bitcoin', 'btc', 'ethereum', 'eth', 'token', 'crypto', 'defi', 'solana']):
            cat_name = 'Crypto & Finance'
        elif any(k in src_lower for k in ['tiktok', 'reddit', 'bluesky', 'social', 'youtube']):
            cat_name = 'Social Media'
        else:
            cat_name = 'Tech & AI'

        if cat_name not in cat_map:
            cat_map[cat_name] = []

        # Handle popularity as number or dict
        pop_raw = t.get('popularity', 0)
        if isinstance(pop_raw, (int, float)):
            score = pop_raw
            metric_str = str(int(score))
        elif isinstance(pop_raw, dict):
            score = pop_raw.get('metric', pop_raw.get('score', 50))
            if isinstance(score, str):
                # e.g. "17.5%"
                try: score = float(score.replace('%',''))
                except: score = 50
            unit = pop_raw.get('unit', '')
            metric_str = (str(score) + ' ' + str(unit)).strip()
        else:
            score = 50
            metric_str = str(pop_raw)

        # Normalize score to 0-100
        if score > 1000: score = 95
        elif score > 500: score = 90
        elif score > 200: score = 80
        elif score > 100: score = 70

        score = min(max(int(score), 1), 100)
        reach = 'high' if score >= 70 else 'medium' if score >= 40 else 'low'

        cat_map[cat_name].append({
            'title': t.get('title', 'Unknown'),
            'description': t.get('description', ''),
            'why_trending': t.get('why_trending', ''),
            'momentum': 'rising',
            'popularity': {'score': score, 'metric': metric_str, 'reach': reach},
            'sources': [src] if src else ['Unknown'],
            'urls': [t['url']] if t.get('url') else [],
            'first_seen': None,
            'relevance': 'high' if score >= 70 else 'medium'
        })

    # Sort categories in preferred order
    order = ['Tech & AI', 'Crypto & Finance', 'Social Media']
    categories = []
    for name in order:
        if name in cat_map:
            categories.append({'name': name, 'trends': cat_map[name]})
    # Add any extras
    for name, trends in cat_map.items():
        if name not in order:
            categories.append({'name': name, 'trends': trends})

    total_items = sum(len(c['trends']) for c in categories)

    output = {
        'type': run_type,
        'timestamp': now,
        'data_quality': {'sources_ok': len(cat_map), 'sources_failed': [], 'total_raw_items': total_items},
        'categories': categories,
        'top_movers': [{'title': trends_list[0]['title'], 'direction': 'new', 'delta': 'Top trend this run'}] if trends_list else [],
        'signals': {'emerging': [], 'fading': []},
        'summary': f'{total_items} trends detected across {len(cat_map)} categories.'
    }
    print(json.dumps(output))

except Exception as e:
    fallback = {
        'type': run_type,
        'timestamp': now,
        'raw_output': (json_str or text)[:5000],
        'parse_error': str(e),
        'data_quality': {'sources_ok': 0, 'sources_failed': ['agent-parse-error'], 'total_raw_items': 0},
        'categories': [],
        'top_movers': [],
        'signals': {'emerging': [], 'fading': []},
        'summary': 'Agent output could not be parsed as structured JSON.'
    }
    print(json.dumps(fallback))
PYEOF
AGENT_OUTPUT=$(python3 "$PYSCRIPT" "$TYPE" "$TMPFILE" 2>&1)
rm -f "$PYSCRIPT"

rm -f "$TMPFILE"

# Step 3: POST to webhook
echo "[$(date -u +%H:%M:%S)] Posting to webhook..."
POSTFILE=$(mktemp /tmp/trendclaw-post-XXXXXX.json)
echo "$AGENT_OUTPUT" > "$POSTFILE"

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

echo "[$(date -u +%H:%M:%S)] Done."
