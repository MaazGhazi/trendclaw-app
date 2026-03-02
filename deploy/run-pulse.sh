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
  MODEL="openai/gpt-4o-mini"
  MSG="Quick pulse check. Use the trend_monitor skill. Run type: pulse.
Read the pre-collected data from $DATA_FILE.
Analyze top movers. Use 0-2 web_search queries for breaking news.
Return top 5-8 trends with popularity scores.
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
elif [ "$TYPE" = "digest" ]; then
  MODEL="openai/gpt-4o"
  MSG="Daily digest. Use the trend_monitor skill. Run type: digest.
Read the pre-collected data from $DATA_FILE.
Cross-reference trends across platforms. Use 3-5 web_search queries.
Return 12-20 trends with full popularity metrics.
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
else
  MODEL="openai/gpt-4o"
  MSG="Weekly deep dive. Use the trend_monitor skill. Run type: deep_dive.
Read the pre-collected data from $DATA_FILE.
Cross-reference all platforms. Use 8-10 web_search queries.
Return 15-25 trends with full analysis.
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
fi

SESSION_ID="trendclaw-${TYPE}-$(date +%s)"
RESULT=$(openclaw agent --session-id "$SESSION_ID" --message "$MSG" --json --timeout 120 2>&1 || true)

# Save raw result to temp file to avoid shell escaping issues
TMPFILE=$(mktemp /tmp/trendclaw-XXXXXX.json)
echo "$RESULT" > "$TMPFILE"

# Extract and normalize agent output
AGENT_OUTPUT=$(python3 -c "
import sys, json, re
from datetime import datetime, timezone

run_type = '$TYPE'

with open('$TMPFILE') as f:
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

# Extract JSON from markdown code blocks
match = re.search(r'\x60\x60\x60(?:json)?\s*(\{.*?\})\s*\x60\x60\x60', text, re.DOTALL)
if match:
    text = match.group(1)
else:
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if match:
        text = match.group(1)

now = datetime.now(timezone.utc).isoformat()

try:
    agent_data = json.loads(text)

    # Agent returns {trends: [...]} — normalize to dashboard schema
    trends_list = agent_data.get('trends', [])

    # Group into categories
    cat_map = {}
    for t in trends_list:
        src = t.get('source', '')
        if any(k in src.lower() for k in ['coingecko', 'crypto', 'coin']):
            cat_name = 'Crypto & Finance'
        elif any(k in src.lower() for k in ['tiktok', 'reddit', 'bluesky', 'social']):
            cat_name = 'Social Media'
        else:
            cat_name = 'Tech & AI'

        if cat_name not in cat_map:
            cat_map[cat_name] = []

        pop = t.get('popularity', {})
        score = pop.get('metric', 0) if isinstance(pop.get('metric'), (int, float)) else 50
        metric_str = str(pop.get('metric', '')) + ' ' + str(pop.get('unit', ''))
        reach = 'high' if score > 100 else 'medium' if score > 20 else 'low'

        cat_map[cat_name].append({
            'title': t.get('title', 'Unknown'),
            'description': t.get('description', ''),
            'why_trending': t.get('why_trending', ''),
            'momentum': 'rising',
            'popularity': {'score': min(int(score) if isinstance(score, (int,float)) else 50, 100), 'metric': metric_str.strip(), 'reach': reach},
            'sources': [t.get('source', 'Unknown')],
            'urls': [t['url']] if t.get('url') else [],
            'first_seen': None,
            'relevance': 'high' if score > 100 else 'medium'
        })

    categories = [{'name': k, 'trends': v} for k, v in cat_map.items()]
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
        'raw_output': text[:5000],
        'parse_error': str(e),
        'data_quality': {'sources_ok': 0, 'sources_failed': ['agent-parse-error'], 'total_raw_items': 0},
        'categories': [],
        'top_movers': [],
        'signals': {'emerging': [], 'fading': []},
        'summary': 'Agent output could not be parsed as structured JSON.'
    }
    print(json.dumps(fallback))
" 2>&1)

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
