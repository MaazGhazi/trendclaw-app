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

# Save a debug copy of scraper output
DEBUG_DIR="$HOME/trendclaw-app/debug"
mkdir -p "$DEBUG_DIR"
cp "$DATA_FILE" "$DEBUG_DIR/scraper-${TYPE}-$(date +%s).json" 2>/dev/null || true
echo "[$(date -u +%H:%M:%S)] Scraper output saved to $DEBUG_DIR"

# Step 2: Parse scraper output directly (no agent)
echo "[$(date -u +%H:%M:%S)] Parsing scraper data..."

PYSCRIPT=$(mktemp /tmp/trendclaw-parse-XXXXXX.py)
cat > "$PYSCRIPT" << 'PYEOF'
import sys, json, math
from datetime import datetime, timezone

run_type = sys.argv[1]
data_file = sys.argv[2]
now = datetime.now(timezone.utc).isoformat()

with open(data_file) as f:
    scraper_data = json.load(f)

VALID_MOMENTUM = {'rising', 'falling', 'stable', 'new', 'viral'}

def log_score(raw_val):
    """Logarithmic score normalization: 1->0, 100->30, 1000->51, 10000->72, 100000->100"""
    if raw_val <= 0:
        return 1
    if raw_val <= 1:
        return max(1, int(raw_val))
    return min(100, max(1, int(30 + 70 * math.log10(raw_val) / math.log10(100000))))

def build_metric(item):
    """Build a human-readable metric string from available fields."""
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
    if item.get('volume') and str(item['volume']) != 'undefined':
        parts.append(f"vol {item['volume']}")
    if item.get('marketCap') and str(item['marketCap']) != 'undefined':
        parts.append(f"mcap {item['marketCap']}")
    if item.get('rank'):
        parts.append(f"#{item['rank']}")
    if not parts and item.get('comments'):
        parts.append(f"{item['comments']} comments")
    return ' | '.join(parts)

def get_raw_score(item):
    """Pick the best numeric signal for scoring: score > views > stars > comments."""
    if item.get('score') and isinstance(item['score'], (int, float)) and item['score'] > 0:
        return item['score']
    if item.get('views') and isinstance(item['views'], (int, float)) and item['views'] > 0:
        return item['views']
    if item.get('stars') and isinstance(item['stars'], (int, float)) and item['stars'] > 0:
        return item['stars']
    if item.get('comments') and isinstance(item['comments'], (int, float)) and item['comments'] > 0:
        return item['comments'] * 5  # weight comments up
    return 0

def derive_momentum(item):
    """Derive momentum from priceChange/growth fields."""
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

sources = scraper_data.get('sources', [])
categories = []
sources_ok = 0
sources_failed = []
all_trends = []

for src in sources:
    name = src.get('source', 'Unknown')
    status = src.get('status', 'error')
    items = src.get('items', [])

    if status != 'ok' or not items:
        if status == 'error':
            sources_failed.append(name)
        elif status == 'skipped':
            sources_failed.append(f"{name} (skipped)")
        continue

    sources_ok += 1
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

        # Handle URL as string or RSS object {"@_href": "..."}
        raw_url = item.get('url', '')
        if isinstance(raw_url, dict):
            raw_url = raw_url.get('@_href', raw_url.get('href', ''))
        urls = [raw_url] if raw_url and isinstance(raw_url, str) else []

        trend = {
            'title': title,
            'description': item.get('description', '') or '',
            'why_trending': '',
            'momentum': momentum,
            'popularity': {'score': score, 'metric': metric, 'reach': reach},
            'sources': [name],
            'urls': urls,
            'first_seen': item.get('publishedAt', None),
            'relevance': 'high' if score >= 70 else 'medium' if score >= 40 else 'low'
        }
        trends.append(trend)
        all_trends.append(trend)

    # Sort trends within each source by score descending
    trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
    categories.append({'name': name, 'trends': trends})

# Sort categories by number of trends descending
categories.sort(key=lambda c: len(c['trends']), reverse=True)

# Top movers: top 5 items by score across all sources
all_trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
direction_map = {'rising': 'up', 'viral': 'up', 'new': 'new', 'falling': 'down', 'stable': 'stable'}
top_movers = []
for tr in all_trends[:5]:
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
        'total_raw_items': total_items
    },
    'categories': categories,
    'top_movers': top_movers,
    'signals': {'emerging': [], 'fading': []},
    'summary': f'{total_items} items from {sources_ok} sources.'
}
print(json.dumps(output))
PYEOF
PARSED_OUTPUT=$(python3 "$PYSCRIPT" "$TYPE" "$DATA_FILE" 2>&1)
rm -f "$PYSCRIPT"

# Step 3: POST to webhook
echo "[$(date -u +%H:%M:%S)] Posting to webhook..."
POSTFILE=$(mktemp /tmp/trendclaw-post-XXXXXX.json)
echo "$PARSED_OUTPUT" > "$POSTFILE"

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
