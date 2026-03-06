#!/usr/bin/env bash
set -uo pipefail

# Load env (set -a exports all sourced vars to child processes like node)
set -a
source ~/.openclaw/.env
set +a

TYPE="${1:-pulse}"
SCRAPER_DIR="$HOME/trendclaw-app/scraper"
SCRAPER_OUTPUT="${SCRAPER_OUTPUT_DIR:-$SCRAPER_DIR/output}"
MEMORY_DIR="$HOME/.openclaw/workspace/memory"
FRONTEND_DIR="$HOME/trendclaw-app/frontend"
PROGRESS_FILE="$FRONTEND_DIR/data/progress.json"
RUN_ID="${TYPE}-$(date +%s)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
TODAY=$(date -u +%Y-%m-%d)

# ─── Progress tracking ────────────────────────────────────────────────────────
mkdir -p "$(dirname "$PROGRESS_FILE")" "$MEMORY_DIR" "$SCRAPER_OUTPUT"

# Marker dir: each background scrape writes a file here when done
MARKERS_DIR="/tmp/trendclaw-markers-$$"
rm -rf "$MARKERS_DIR"
mkdir -p "$MARKERS_DIR"
TOTAL_SCRAPE_JOBS=0

write_progress() {
  local update_expr="$1"
  python3 -c "
import json, os
pf = '$PROGRESS_FILE'
try:
    with open(pf) as f:
        p = json.load(f)
except:
    p = {
        'run_id': '$RUN_ID',
        'type': '$TYPE',
        'started_at': '$STARTED_AT',
        'status': 'running',
        'current_user': '',
        'steps': {
            'scraping': {'status': 'pending'},
            'users': {'status': 'pending', 'total': 0, 'completed': 0}
        }
    }
$update_expr
with open(pf, 'w') as f:
    json.dump(p, f)
" 2>/dev/null || true
}

echo "[$(date -u +%H:%M:%S)] TrendClaw $TYPE run starting (parallel pipeline)"

# Reset progress
rm -f "$PROGRESS_FILE"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 0: Query all active users with profiles
# ═══════════════════════════════════════════════════════════════════════════════

USERS_FILE="/tmp/trendclaw-users.json"

if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_KEY" ]; then
  python3 -c "
import json, urllib.request
try:
    url = '${SUPABASE_URL}/rest/v1/profiles?onboarding_complete=eq.true&select=user_id,region,niche,platforms,role,keywords'
    req = urllib.request.Request(url, headers={
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        rows = json.loads(resp.read())
    if not rows:
        rows = [{'user_id': 'default', 'region': 'US', 'niche': 'tech', 'platforms': [], 'role': 'creator', 'keywords': []}]
    with open('$USERS_FILE', 'w') as f:
        json.dump(rows, f)
    print(f'Found {len(rows)} active users')
except Exception as e:
    print(f'Supabase query failed: {e}, using default user')
    with open('$USERS_FILE', 'w') as f:
        json.dump([{'user_id': 'default', 'region': 'US', 'niche': 'tech', 'platforms': [], 'role': 'creator', 'keywords': []}], f)
" 2>&1
else
  echo '[{"user_id":"default","region":"US","niche":"tech","platforms":[],"role":"creator","keywords":[]}]' > "$USERS_FILE"
  echo "No Supabase configured, using default user"
fi

# Extract unique regions and user count
REGIONS=$(python3 -c "
import json
with open('$USERS_FILE') as f:
    users = json.load(f)
regions = list(set(u.get('region', 'US') for u in users))
print(' '.join(regions))
" 2>/dev/null || echo "US")

USER_COUNT=$(python3 -c "
import json
with open('$USERS_FILE') as f:
    print(len(json.load(f)))
" 2>/dev/null || echo "1")

echo "[$(date -u +%H:%M:%S)] Users: $USER_COUNT | Regions: $REGIONS"

write_progress "
p['steps']['scraping']['status'] = 'running'
p['steps']['users']['total'] = $USER_COUNT
"

# ═══════════════════════════════════════════════════════════════════════════════
# PARALLEL SCRAPING — global + region + topic all launch simultaneously
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════"
echo "[$(date -u +%H:%M:%S)] Launching all scrapes in parallel"
echo "═══════════════════════════════════════════════"

SCRAPE_START=$(date +%s)
SCRAPE_PIDS=""

# ── Global scrape (background) ──────────────────────────────────────────────
GLOBAL_OUTPUT="$SCRAPER_OUTPUT/latest-${TYPE}-global.json"
(
  cd "$SCRAPER_DIR"
  echo "[$(date -u +%H:%M:%S)] [global] Starting..."
  SCRAPER_OUTPUT_DIR="$SCRAPER_OUTPUT" node dist/index.js --type "$TYPE" --phase global 2>&1 || true
  echo "done" > "$MARKERS_DIR/global.done"
  echo "[$(date -u +%H:%M:%S)] [global] Done"
) > /tmp/trendclaw-log-global.txt 2>&1 &
SCRAPE_PIDS="$SCRAPE_PIDS $!"
TOTAL_SCRAPE_JOBS=$((TOTAL_SCRAPE_JOBS + 1))
echo "[$(date -u +%H:%M:%S)]   Global scrape launched (PID $!)"

# ── Region scrapes (background, one per unique region) ──────────────────────
for REGION in $REGIONS; do
  REGION_OUT="/tmp/trendclaw-region-${REGION}"
  mkdir -p "$REGION_OUT"
  (
    REGION_CONFIG="/tmp/trendclaw-config-region-${REGION}.json"
    echo "{\"region\":\"$REGION\",\"niche\":\"tech\",\"platforms\":[],\"role\":\"creator\",\"keywords\":[]}" > "$REGION_CONFIG"
    cd "$SCRAPER_DIR"
    echo "[$(date -u +%H:%M:%S)] [region:$REGION] Starting..."
    SCRAPER_USER_CONFIG="$REGION_CONFIG" SCRAPER_OUTPUT_DIR="$REGION_OUT" \
      node dist/index.js --type "$TYPE" --phase region 2>&1 || true
    echo "done" > "$MARKERS_DIR/region-${REGION}.done"
    echo "[$(date -u +%H:%M:%S)] [region:$REGION] Done"
  ) > "/tmp/trendclaw-log-region-${REGION}.txt" 2>&1 &
  SCRAPE_PIDS="$SCRAPE_PIDS $!"
  TOTAL_SCRAPE_JOBS=$((TOTAL_SCRAPE_JOBS + 1))
  echo "[$(date -u +%H:%M:%S)]   Region scrape ($REGION) launched (PID $!)"
done

# ── Per-user topic scrapes (background, one per user) ───────────────────────
USER_LINES="/tmp/trendclaw-user-lines.txt"
python3 -c "
import json
with open('$USERS_FILE') as f:
    users = json.load(f)
for u in users:
    print(json.dumps(u))
" > "$USER_LINES"

while IFS= read -r user_json; do
  USER_ID=$(echo "$user_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_id','default'))")
  USER_TMP="/tmp/trendclaw-user-${USER_ID}"
  mkdir -p "$USER_TMP"
  echo "$user_json" > "$USER_TMP/config.json"

  (
    cd "$SCRAPER_DIR"
    echo "[$(date -u +%H:%M:%S)] [topic:$USER_ID] Starting..."
    SCRAPER_USER_CONFIG="$USER_TMP/config.json" SCRAPER_OUTPUT_DIR="$USER_TMP" \
      node dist/index.js --type "$TYPE" --phase topic 2>&1 || true
    # Create empty topic output if scraper failed
    if [ ! -f "$USER_TMP/latest-${TYPE}-topic.json" ]; then
      echo '{"runType":"'"$TYPE"'","phase":"topic","collectedAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","sources":[],"totalItems":0,"failedSources":[]}' \
        > "$USER_TMP/latest-${TYPE}-topic.json"
    fi
    echo "done" > "$MARKERS_DIR/topic-${USER_ID}.done"
    echo "[$(date -u +%H:%M:%S)] [topic:$USER_ID] Done"
  ) > "/tmp/trendclaw-log-topic-${USER_ID}.txt" 2>&1 &
  SCRAPE_PIDS="$SCRAPE_PIDS $!"
  TOTAL_SCRAPE_JOBS=$((TOTAL_SCRAPE_JOBS + 1))
  echo "[$(date -u +%H:%M:%S)]   Topic scrape ($USER_ID) launched (PID $!)"
done < "$USER_LINES"

# ── Progress monitor (background) — updates progress.json every 2s ──────────
echo ""
echo "[$(date -u +%H:%M:%S)] All $TOTAL_SCRAPE_JOBS scrapes launched — monitoring progress..."
(
  while true; do
    DONE=$(find "$MARKERS_DIR" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    DONE_NAMES=$(ls "$MARKERS_DIR"/*.done 2>/dev/null | xargs -I{} basename {} .done | sort | tr '\n' ',' | sed 's/,$//' || echo "")
    python3 -c "
import json, os
pf = '$PROGRESS_FILE'
try:
    with open(pf) as f:
        p = json.load(f)
except:
    p = {'run_id': '$RUN_ID', 'type': '$TYPE', 'started_at': '$STARTED_AT', 'status': 'running', 'steps': {'scraping': {}, 'users': {'status': 'pending', 'total': 0, 'completed': 0}}}
p['steps']['scraping']['status'] = 'running'
p['steps']['scraping']['completed'] = int('$DONE')
p['steps']['scraping']['total'] = $TOTAL_SCRAPE_JOBS
p['steps']['scraping']['done_jobs'] = [x for x in '$DONE_NAMES'.split(',') if x]
with open(pf, 'w') as f:
    json.dump(p, f)
" 2>/dev/null
    [ "$DONE" -ge "$TOTAL_SCRAPE_JOBS" ] && break
    sleep 2
  done
) &
MONITOR_PID=$!

# ── Wait for ALL scrapes to finish ──────────────────────────────────────────
for pid in $SCRAPE_PIDS; do
  wait "$pid" 2>/dev/null || true
done

# Stop the progress monitor
kill $MONITOR_PID 2>/dev/null; wait $MONITOR_PID 2>/dev/null || true

SCRAPE_ELAPSED=$(($(date +%s) - SCRAPE_START))
echo "[$(date -u +%H:%M:%S)] All scrapes done (${SCRAPE_ELAPSED}s — ran in parallel)"

# Print scrape summaries
echo ""
echo "── Scrape results ──"
tail -1 /tmp/trendclaw-log-global.txt 2>/dev/null || true
for REGION in $REGIONS; do
  tail -1 "/tmp/trendclaw-log-region-${REGION}.txt" 2>/dev/null || true
done
while IFS= read -r user_json; do
  uid=$(echo "$user_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_id','default'))")
  tail -1 "/tmp/trendclaw-log-topic-${uid}.txt" 2>/dev/null || true
done < "$USER_LINES"

# Copy region outputs to expected paths for merge step
for REGION in $REGIONS; do
  cp "/tmp/trendclaw-region-${REGION}/latest-${TYPE}-region.json" \
     "$SCRAPER_OUTPUT/region-${REGION}.json" 2>/dev/null || true
done

# Count global results
GLOBAL_ITEMS=$(python3 -c "
import json
try:
    with open('$GLOBAL_OUTPUT') as f:
        d = json.load(f)
    print(d.get('totalItems', 0))
except:
    print(0)
" 2>/dev/null || echo "0")
echo ""
echo "[$(date -u +%H:%M:%S)] Global: $GLOBAL_ITEMS items collected"

write_progress "
p['steps']['scraping']['status'] = 'completed'
p['steps']['scraping']['duration_s'] = $SCRAPE_ELAPSED
p['steps']['users']['status'] = 'running'
"

# ═══════════════════════════════════════════════════════════════════════════════
# PER-USER AI PIPELINES — merge + enrich + store (scraping already done)
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════"
echo "[$(date -u +%H:%M:%S)] Per-user AI pipelines"
echo "═══════════════════════════════════════════════"

COMPLETED_USERS=0

while IFS= read -r user_json; do
  USER_ID=$(echo "$user_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user_id','default'))")
  REGION=$(echo "$user_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('region','US'))")
  NICHE=$(echo "$user_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('niche','tech'))")

  echo ""
  echo "────────────────────────────────────────────"
  echo "[$(date -u +%H:%M:%S)] User: $USER_ID ($NICHE / $REGION)"
  echo "────────────────────────────────────────────"

  USER_TMP="/tmp/trendclaw-user-${USER_ID}"
  USER_SOURCES="$USER_TMP/sources"
  USER_AGENTS="$USER_TMP/agents"
  mkdir -p "$USER_SOURCES" "$USER_AGENTS"

  write_progress "
p['current_user'] = '$USER_ID'
p['steps']['users']['current_step'] = 'merging'
"

  # ── Merge global + region + topic ──────────────────────────────────────────
  echo "[$(date -u +%H:%M:%S)]   Merging data..."
  REGION_OUTPUT="$SCRAPER_OUTPUT/region-${REGION}.json"
  TOPIC_OUTPUT="$USER_TMP/latest-${TYPE}-topic.json"
  COMBINED_FILE="$USER_TMP/combined.json"

  python3 -c "
import json, os

combined_sources = []

# Load global
if os.path.exists('$GLOBAL_OUTPUT'):
    with open('$GLOBAL_OUTPUT') as f:
        d = json.load(f)
    combined_sources.extend(d.get('sources', []))

# Load region
if os.path.exists('$REGION_OUTPUT'):
    with open('$REGION_OUTPUT') as f:
        d = json.load(f)
    combined_sources.extend(d.get('sources', []))

# Load topic
if os.path.exists('$TOPIC_OUTPUT'):
    with open('$TOPIC_OUTPUT') as f:
        d = json.load(f)
    combined_sources.extend(d.get('sources', []))

# Dedupe by source name (keep the one with more items)
by_name = {}
for s in combined_sources:
    name = s.get('source', '')
    if name not in by_name or len(s.get('items', [])) > len(by_name[name].get('items', [])):
        by_name[name] = s

sources = list(by_name.values())
total = sum(len(s.get('items', [])) for s in sources)
ok_sources = [s for s in sources if s.get('status') == 'ok']

output = {
    'runType': '$TYPE',
    'collectedAt': '$(date -u +%Y-%m-%dT%H:%M:%SZ)',
    'sources': sources,
    'totalItems': total,
    'failedSources': [s.get('source','') for s in sources if s.get('status') == 'error']
}

with open('$COMBINED_FILE', 'w') as f:
    json.dump(output, f)
print(f'  Combined: {total} items from {len(ok_sources)} sources')
"

  # ── Split into per-source files ────────────────────────────────────────────
  echo "[$(date -u +%H:%M:%S)]   Splitting sources..."
  python3 -c "
import sys, json, re, os

with open('$COMBINED_FILE') as f:
    data = json.load(f)

manifest = []
for src in data.get('sources', []):
    name = src.get('source', 'Unknown')
    status = src.get('status', 'error')
    items = src.get('items', [])
    if status != 'ok' or not items:
        manifest.append({'name': name, 'status': status, 'items': 0, 'file': None})
        continue
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name.lower().replace(' ', '_'))
    out_file = os.path.join('$USER_SOURCES', f'{safe_name}.json')
    with open(out_file, 'w') as f:
        json.dump({'source': name, 'items': items}, f)
    manifest.append({'name': name, 'status': 'ok', 'items': len(items), 'file': out_file, 'safe_name': safe_name})

with open(os.path.join('$USER_SOURCES', '_manifest.json'), 'w') as f:
    json.dump(manifest, f)
ok = sum(1 for s in manifest if s['status'] == 'ok')
print(f'  Split: {ok} active sources')
"

  # ── Per-source AI agents (parallel via ThreadPool) ─────────────────────────
  write_progress "p['steps']['users']['current_step'] = 'analyzing'"
  echo "[$(date -u +%H:%M:%S)]   Running per-source agents..."
  python3 -c "
import json, os, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen

with open('$USER_SOURCES/_manifest.json') as f:
    manifest = json.load(f)

active = [s for s in manifest if s.get('file')]
api_key = os.environ.get('OPENAI_API_KEY', '')
niche = '$NICHE'

succeeded = 0
failed = 0

def call_openai(source_name, safe_name, item_count, source_file):
    with open(source_file) as f:
        source_data = json.dumps(json.load(f))

    prompt = f'''Today is $TODAY. Run type: $TYPE. User niche: {niche}.
You are analyzing {source_name} ({item_count} items) for a user interested in \"{niche}\".

Prioritize items most relevant to the \"{niche}\" niche. For each relevant item:
- Momentum: rising|falling|stable|new|viral
- Why it's trending (1-2 sentences)
- Score 0-100 based on engagement + relevance to \"{niche}\"

Data:
{source_data}

Return ONLY JSON:
{{\"source\": \"{source_name}\", \"trends\": [{{\"title\": \"...\", \"description\": \"...\", \"why_trending\": \"...\", \"momentum\": \"rising|falling|stable|new|viral\", \"popularity\": {{\"score\": 0-100, \"metric\": \"raw numbers\", \"reach\": \"high|medium|low\"}}, \"urls\": [\"...\"], \"first_seen\": \"ISO date or null\", \"relevance\": \"high|medium|low\"}}]}}'''

    body = json.dumps({
        'model': 'gpt-4o-mini',
        'messages': [
            {'role': 'system', 'content': 'You are a trend analysis agent. Return ONLY valid JSON.'},
            {'role': 'user', 'content': prompt}
        ],
        'temperature': 0.3,
        'response_format': {'type': 'json_object'}
    }).encode()

    req = Request('https://api.openai.com/v1/chat/completions', data=body, headers={
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    })

    start = time.time()
    resp = urlopen(req, timeout=60)
    result = json.loads(resp.read().decode())
    content = result['choices'][0]['message']['content']
    elapsed = time.time() - start

    out_file = os.path.join('$USER_AGENTS', f'{safe_name}.json')
    with open(out_file, 'w') as f:
        f.write(content)
    return safe_name, source_name, len(content), elapsed

with ThreadPoolExecutor(max_workers=10) as pool:
    futures = {pool.submit(call_openai, s['name'], s['safe_name'], s['items'], s['file']): s for s in active}
    for fut in as_completed(futures):
        src = futures[fut]
        try:
            safe, name, size, elapsed = fut.result()
            succeeded += 1
            print(f'    ✓ {name}: {size}b ({elapsed:.1f}s)')
        except Exception as e:
            failed += 1
            print(f'    ✗ {src[\"name\"]}: {str(e)[:100]}')

print(f'  Agents done: {succeeded} ok, {failed} failed')
"

  # ── Aggregate + Summary + Final output ─────────────────────────────────────
  write_progress "p['steps']['users']['current_step'] = 'summarizing'"
  echo "[$(date -u +%H:%M:%S)]   Aggregating and summarizing..."

  export USER_SOURCES USER_AGENTS USER_TMP COMBINED_FILE TYPE NICHE TODAY

  python3 << 'AGGEOF'
import json, os, re, math, time, sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen

user_sources = os.environ.get('USER_SOURCES', '/tmp')
user_agents = os.environ.get('USER_AGENTS', '/tmp')
user_tmp = os.environ.get('USER_TMP', '/tmp')
combined_file = os.environ.get('COMBINED_FILE', '')
run_type = os.environ.get('TYPE', 'pulse')
niche = os.environ.get('NICHE', 'tech')
today = os.environ.get('TODAY', '')
api_key = os.environ.get('OPENAI_API_KEY', '')

now = datetime.now(timezone.utc).isoformat()

VALID_MOMENTUM = {'rising', 'falling', 'stable', 'new', 'viral'}

def log_score(raw_val):
    if raw_val <= 0: return 1
    if raw_val <= 1: return max(1, int(raw_val))
    return min(100, max(1, int(30 + 70 * math.log10(raw_val) / math.log10(100000))))

def build_metric(item):
    parts = []
    if item.get('score') and item.get('comments'):
        parts.append(f"{item['score']} pts, {item['comments']} comments")
    elif item.get('score'):
        parts.append(f"{item['score']} pts")
    if item.get('views'):
        v = item['views']
        if v >= 1_000_000: parts.append(f"{v/1_000_000:.1f}M views")
        elif v >= 1_000: parts.append(f"{v/1_000:.1f}K views")
        else: parts.append(f"{v} views")
    if item.get('stars'):
        s = item['stars']
        parts.append(f"{s/1_000:.1f}K stars" if s >= 1_000 else f"{s} stars")
    if item.get('priceChange'): parts.append(item['priceChange'])
    return ' | '.join(parts)

def get_raw_score(item):
    for key in ['score', 'views', 'stars']:
        val = item.get(key)
        if val and isinstance(val, (int, float)) and val > 0:
            return val
    c = item.get('comments')
    if c and isinstance(c, (int, float)) and c > 0:
        return c * 5
    return 0

def derive_momentum(item):
    pc = item.get('priceChange', '')
    if isinstance(pc, str) and pc:
        try:
            num = float(pc.replace('%','').replace('(24h)','').replace('+','').strip())
            if num > 10: return 'viral'
            elif num > 0: return 'rising'
            elif num < -5: return 'falling'
        except ValueError: pass
    return 'new'

def fallback_parse(name, items):
    trends = []
    for item in items:
        title = item.get('title', '').strip()
        if not title: continue
        raw = get_raw_score(item)
        score = log_score(raw) if raw > 0 else 10
        reach = 'high' if score >= 70 else 'medium' if score >= 40 else 'low'
        raw_url = item.get('url', '')
        if isinstance(raw_url, dict): raw_url = raw_url.get('@_href', '')
        urls = [raw_url] if raw_url and isinstance(raw_url, str) else []
        trends.append({
            'title': title, 'description': item.get('description', '') or '',
            'why_trending': '', 'momentum': derive_momentum(item),
            'popularity': {'score': score, 'metric': build_metric(item), 'reach': reach},
            'sources': [name], 'urls': urls,
            'first_seen': item.get('publishedAt'), 'relevance': reach
        })
    trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
    return trends

# Load manifest + scraper data
with open(os.path.join(user_sources, '_manifest.json')) as f:
    manifest = json.load(f)
with open(combined_file) as f:
    scraper_data = json.load(f)
scraper_by_name = {s.get('source', ''): s for s in scraper_data.get('sources', [])}

categories = []
all_trends = []
sources_ok = 0
sources_failed = []
agent_enriched = 0
fallback_used = 0

for entry in manifest:
    name = entry['name']
    if entry['status'] != 'ok' or not entry.get('file'):
        if entry['status'] in ('error', 'skipped'):
            sources_failed.append(name)
        continue
    sources_ok += 1
    safe_name = entry.get('safe_name', '')
    agent_file = os.path.join(user_agents, f"{safe_name}.json")
    trends = None

    if os.path.exists(agent_file) and os.path.getsize(agent_file) > 0:
        try:
            with open(agent_file) as f:
                raw = f.read()
            text = raw.strip()
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text).strip()
            agent_json = json.loads(text)
            if 'trends' in agent_json and isinstance(agent_json['trends'], list):
                trends = []
                for t in agent_json['trends']:
                    mom = t.get('momentum', 'new')
                    if mom not in VALID_MOMENTUM: mom = 'new'
                    score = t.get('popularity', {}).get('score', 50)
                    if not isinstance(score, (int, float)): score = 50
                    score = max(1, min(100, int(score)))
                    reach = t.get('popularity', {}).get('reach', 'medium')
                    if reach not in ('high', 'medium', 'low'):
                        reach = 'high' if score >= 70 else 'medium' if score >= 40 else 'low'
                    urls = t.get('urls', [])
                    if isinstance(urls, str): urls = [urls]
                    trends.append({
                        'title': t.get('title', ''), 'description': t.get('description', ''),
                        'why_trending': t.get('why_trending', ''), 'momentum': mom,
                        'popularity': {'score': score, 'metric': t.get('popularity', {}).get('metric', ''), 'reach': reach},
                        'sources': [name], 'urls': urls,
                        'first_seen': t.get('first_seen'), 'relevance': t.get('relevance', 'medium')
                    })
                trends.sort(key=lambda x: x['popularity']['score'], reverse=True)
                agent_enriched += 1
        except Exception as e:
            print(f"    Agent parse error for {name}: {e}", file=sys.stderr)

    if trends is None:
        items = scraper_by_name.get(name, {}).get('items', [])
        if items:
            trends = fallback_parse(name, items)
            fallback_used += 1

    if trends:
        categories.append({'name': name, 'trends': trends})
        all_trends.extend(trends)

categories.sort(key=lambda c: len(c['trends']), reverse=True)
all_trends.sort(key=lambda x: x['popularity']['score'], reverse=True)

# Build preliminary output
direction_map = {'rising': 'up', 'viral': 'up', 'new': 'new', 'falling': 'down', 'stable': 'stable'}
top_movers = [{'title': t['title'], 'direction': direction_map.get(t['momentum'], 'up'), 'delta': f"Score: {t['popularity']['score']}"} for t in all_trends[:5]]
total_items = sum(len(c['trends']) for c in categories)

output = {
    'type': run_type, 'timestamp': now,
    'data_quality': {'sources_ok': sources_ok, 'sources_failed': sources_failed, 'total_raw_items': total_items, 'agent_enriched': agent_enriched, 'fallback_used': fallback_used},
    'categories': categories, 'top_movers': top_movers,
    'signals': {'emerging': [], 'fading': []},
    'summary': f'{total_items} trends from {sources_ok} sources ({agent_enriched} agent-enriched) for niche: {niche}.'
}

# ── Summary agent (gpt-4o) ──
print(f"  Running summary agent...", file=sys.stderr)
try:
    prompt = f"""Today is {today}. Run type: {run_type}. User niche: {niche}.

{len(all_trends)} enriched trends from multiple sources for a user interested in "{niche}":

{json.dumps(all_trends[:30], indent=1)}

1. Cross-reference trends across sources
2. Generate top_movers (top 5 by significance for this niche)
3. Generate signals: emerging (new notable trends) and fading
4. Write a 3-5 sentence summary focused on what matters for the "{niche}" niche

Return ONLY JSON:
{{"top_movers": [{{"title": "...", "direction": "up|down|new", "delta": "brief"}}], "signals": {{"emerging": ["..."], "fading": ["..."]}}, "summary": "3-5 sentences"}}"""

    body = json.dumps({
        'model': 'gpt-4o', 'messages': [
            {'role': 'system', 'content': 'You are a trend intelligence analyst. Return ONLY valid JSON.'},
            {'role': 'user', 'content': prompt}
        ], 'temperature': 0.3, 'response_format': {'type': 'json_object'}
    }).encode()

    req = Request('https://api.openai.com/v1/chat/completions', data=body, headers={
        'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'
    })
    start = time.time()
    resp = urlopen(req, timeout=90)
    result = json.loads(resp.read().decode())
    content = result['choices'][0]['message']['content']
    summary_json = json.loads(content)

    if 'top_movers' in summary_json: output['top_movers'] = summary_json['top_movers']
    if 'signals' in summary_json: output['signals'] = summary_json['signals']
    if 'summary' in summary_json: output['summary'] = summary_json['summary']
    print(f"    ✓ Summary agent: {len(content)}b ({time.time()-start:.1f}s)", file=sys.stderr)
except Exception as e:
    print(f"    ✗ Summary agent failed: {str(e)[:120]}", file=sys.stderr)

# Write final output
final_file = os.path.join(user_tmp, '_final.json')
with open(final_file, 'w') as f:
    json.dump(output, f)
print(f"  Final: {total_items} trends, {sources_ok} sources", file=sys.stderr)
AGGEOF

  # ── Store to Supabase with user_id ─────────────────────────────────────────
  FINAL_FILE="$USER_TMP/_final.json"

  if [ -s "$FINAL_FILE" ] && [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_KEY" ]; then
    write_progress "p['steps']['users']['current_step'] = 'storing'"
    echo "[$(date -u +%H:%M:%S)]   Storing to Supabase..."

    python3 -c "
import json, urllib.request

with open('$FINAL_FILE') as f:
    data = json.load(f)

user_id = '$USER_ID'
body_obj = {
    'region': '$REGION',
    'run_type': '$TYPE',
    'data': data,
}

# Only add user_id if it's a real UUID (not 'default')
if user_id != 'default' and len(user_id) > 10:
    body_obj['user_id'] = user_id

body = json.dumps(body_obj).encode()
req = urllib.request.Request(
    '${SUPABASE_URL}/rest/v1/trend_runs',
    data=body,
    headers={
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    },
    method='POST'
)
urllib.request.urlopen(req, timeout=15)
print(f'  ✓ Stored for user={user_id} region=$REGION niche=$NICHE')
" 2>&1 || echo "  ✗ Supabase store failed"
  fi

  COMPLETED_USERS=$((COMPLETED_USERS + 1))
  write_progress "
p['steps']['users']['completed'] = $COMPLETED_USERS
"
  echo "[$(date -u +%H:%M:%S)]   Done for user $USER_ID"
done < "$USER_LINES"

write_progress "
p['steps']['users']['status'] = 'completed'
p['status'] = 'completed'
"

TOTAL_ELAPSED=$(($(date +%s) - $(date -d "$STARTED_AT" +%s 2>/dev/null || python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('$STARTED_AT'.replace('Z','+00:00')).timestamp()))")))

# Cleanup
rm -rf "$MARKERS_DIR"

echo ""
echo "═══════════════════════════════════════════════"
echo "[$(date -u +%H:%M:%S)] All done! Scraping: ${SCRAPE_ELAPSED}s (parallel) | Total: ${TOTAL_ELAPSED}s"
echo "═══════════════════════════════════════════════"
