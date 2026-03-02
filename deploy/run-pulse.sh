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
You MUST return at least 8 trends minimum, ideally 10-12. Returning fewer than 8 is unacceptable.
MUST include trends from ALL 3 categories: Tech & AI, Crypto & Finance, Social Media. At least 3 trends per category.
For each trend include: title, description, why_trending, source, url, momentum (one of: rising, falling, stable, new, viral), and popularity (metric number + unit).
Count your trends before returning. If you have fewer than 8, go back and find more.
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
elif [ "$TYPE" = "digest" ]; then
  MSG="Daily digest. Use the trend_monitor skill. Run type: digest.
Read the pre-collected data from $DATA_FILE.
Cross-reference trends across platforms. Use 3-5 web_search queries.
You MUST return at least 15 trends minimum, ideally 18-20. Returning fewer than 15 is unacceptable.
MUST include trends from ALL 3 categories: Tech & AI, Crypto & Finance, Social Media. At least 5 trends per category.
For each trend include: title, description, why_trending, source, url, momentum (one of: rising, falling, stable, new, viral), and popularity (metric number + unit).
Count your trends before returning. If you have fewer than 15, go back and find more.
IMPORTANT: Return ONLY valid JSON matching the trend_monitor output schema. No markdown, no explanation, just the JSON object."
else
  MSG="Weekly deep dive. Use the trend_monitor skill. Run type: deep_dive.
Read the pre-collected data from $DATA_FILE.
Cross-reference all platforms. Use 8-10 web_search queries.
You MUST return at least 20 trends minimum, ideally 22-25. Returning fewer than 20 is unacceptable.
MUST include trends from ALL 3 categories: Tech & AI, Crypto & Finance, Social Media. At least 6 trends per category.
For each trend include: title, description, why_trending, source, url, momentum (one of: rising, falling, stable, new, viral), and popularity (metric number + unit).
Count your trends before returning. If you have fewer than 20, go back and find more.
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
import sys, json, re, math
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

VALID_MOMENTUM = {'rising', 'falling', 'stable', 'new', 'viral'}

def log_score(raw_val):
    """Logarithmic score normalization: 1→0, 100→30, 1000→51, 10000→72, 100000→100"""
    if raw_val <= 0:
        return 1
    if raw_val <= 1:
        return max(1, int(raw_val))
    return min(100, max(1, int(30 + 70 * math.log10(raw_val) / math.log10(100000))))

json_str = extract_json(text)
now = datetime.now(timezone.utc).isoformat()

try:
    agent_data = json.loads(json_str)

    # Handle both {categories:[{name,trends}]} and {trends:[...]} formats
    if 'categories' in agent_data and isinstance(agent_data['categories'], list):
        # Agent returned full SKILL.md schema: {categories: [{name, trends}]}
        trends_list = []
        for cat in agent_data['categories']:
            cat_name = cat.get('name', '')
            for t in cat.get('trends', []):
                t['_agent_category'] = cat_name
                trends_list.append(t)
    else:
        trends_list = agent_data.get('trends', [])

    # Group into categories
    cat_map = {}
    for t in trends_list:
        # Use agent-assigned category if present
        if '_agent_category' in t:
            cat_name = t.pop('_agent_category')
        else:
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
            raw_score = pop_raw
            metric_str = str(int(raw_score))
        elif isinstance(pop_raw, dict):
            raw_score = pop_raw.get('metric', pop_raw.get('score', 50))
            if raw_score is None:
                raw_score = 50
            if isinstance(raw_score, str):
                try: raw_score = float(raw_score.replace('%','').replace(',',''))
                except: raw_score = 50
            unit = pop_raw.get('unit', '')
            metric_str = (str(raw_score) + ' ' + str(unit)).strip()
        else:
            raw_score = 50
            metric_str = str(pop_raw)

        # Logarithmic score normalization
        if raw_score > 100:
            score = log_score(raw_score)
        else:
            score = min(100, max(1, int(raw_score)))

        reach = 'high' if score >= 70 else 'medium' if score >= 40 else 'low'

        # Use agent's momentum if valid, fallback to "rising"
        agent_momentum = str(t.get('momentum', 'rising')).lower().strip()
        momentum = agent_momentum if agent_momentum in VALID_MOMENTUM else 'rising'

        cat_map[cat_name].append({
            'title': t.get('title', 'Unknown'),
            'description': t.get('description', ''),
            'why_trending': t.get('why_trending', ''),
            'momentum': momentum,
            'popularity': {'score': score, 'metric': metric_str, 'reach': reach},
            'sources': [t.get('source', '')] if t.get('source') else ['Unknown'],
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
    for name, trends in cat_map.items():
        if name not in order:
            categories.append({'name': name, 'trends': trends})

    total_items = sum(len(c['trends']) for c in categories)

    # Build all_trends flat list sorted by score for top_movers derivation
    all_trends = []
    for c in categories:
        all_trends.extend(c['trends'])
    all_trends.sort(key=lambda x: x['popularity']['score'], reverse=True)

    # Top movers: use agent's if provided, otherwise derive top 5 by score
    agent_top_movers = agent_data.get('top_movers', [])
    if isinstance(agent_top_movers, list) and len(agent_top_movers) > 0:
        top_movers = agent_top_movers[:5]
    else:
        direction_map = {'rising': 'up', 'viral': 'up', 'new': 'new', 'falling': 'down', 'stable': 'stable'}
        top_movers = []
        for tr in all_trends[:5]:
            top_movers.append({
                'title': tr['title'],
                'direction': direction_map.get(tr['momentum'], 'up'),
                'delta': f"Score: {tr['popularity']['score']}"
            })

    # Signals: use agent's if provided, otherwise empty
    agent_signals = agent_data.get('signals', {})
    if isinstance(agent_signals, dict) and (agent_signals.get('emerging') or agent_signals.get('fading')):
        signals = {'emerging': agent_signals.get('emerging', []), 'fading': agent_signals.get('fading', [])}
    else:
        signals = {'emerging': [], 'fading': []}

    output = {
        'type': run_type,
        'timestamp': now,
        'data_quality': {'sources_ok': len(cat_map), 'sources_failed': [], 'total_raw_items': total_items},
        'categories': categories,
        'top_movers': top_movers,
        'signals': signals,
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
