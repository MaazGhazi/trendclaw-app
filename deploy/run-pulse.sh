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

RESULT=$(openclaw agent --local --model "$MODEL" --message "$MSG" --json --timeout 120 2>&1 || true)

# Extract the agent's text response (try to find JSON in it)
AGENT_OUTPUT=$(echo "$RESULT" | python3 -c "
import sys, json, re

raw = sys.stdin.read()

# Try parsing as OpenClaw agent JSON response
try:
    parsed = json.loads(raw)
    text = parsed.get('reply', parsed.get('text', parsed.get('content', '')))
    if not text:
        text = raw
except:
    text = raw

# Extract JSON from markdown code blocks if present
match = re.search(r'\`\`\`(?:json)?\s*(\{.*?\})\s*\`\`\`', text, re.DOTALL)
if match:
    text = match.group(1)
else:
    # Try to find raw JSON object
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if match:
        text = match.group(1)

# Validate it's JSON
try:
    data = json.loads(text)
    # Ensure type field exists
    if 'type' not in data:
        data['type'] = '$TYPE'
    if 'timestamp' not in data:
        from datetime import datetime, timezone
        data['timestamp'] = datetime.now(timezone.utc).isoformat()
    print(json.dumps(data))
except:
    # Wrap raw output as fallback
    from datetime import datetime, timezone
    fallback = {
        'type': '$TYPE',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'raw_output': text[:5000],
        'data_quality': {'sources_ok': 0, 'sources_failed': ['agent-parse-error'], 'total_raw_items': 0},
        'categories': [],
        'top_movers': [],
        'signals': {'emerging': [], 'fading': []},
        'summary': 'Agent output could not be parsed as structured JSON.'
    }
    print(json.dumps(fallback))
" 2>&1)

# Step 3: POST to webhook
echo "[$(date -u +%H:%M:%S)] Posting to webhook..."
AUTH_HEADER=""
if [ -n "$WEBHOOK_TOKEN" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $WEBHOOK_TOKEN\""
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -d "$AGENT_OUTPUT")

if [ "$HTTP_CODE" = "201" ]; then
  echo "[$(date -u +%H:%M:%S)] Success! Delivered to frontend (HTTP $HTTP_CODE)"
else
  echo "[$(date -u +%H:%M:%S)] WARNING: Webhook returned HTTP $HTTP_CODE"
fi

echo "[$(date -u +%H:%M:%S)] Done."
