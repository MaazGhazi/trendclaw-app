#!/usr/bin/env bash
set -uo pipefail

# Load env (set -a exports all sourced vars to child processes like node)
# Try project .env first, fall back to ~/.openclaw/.env (droplet)
# Disable trace to prevent secrets from leaking in debug output
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
{ set +x; } 2>/dev/null
set -a
# Source both env files — openclaw first, project .env overrides
if [ -f ~/.openclaw/.env ]; then
  source ~/.openclaw/.env
fi
if [ -f "$PROJECT_DIR/.env" ]; then
  source "$PROJECT_DIR/.env"
fi
set +a

TYPE="${1:-pulse}"
TARGET_USER_ID="${2:-}"
SCRAPER_DIR="$PROJECT_DIR/scraper"
SCRAPER_OUTPUT="${SCRAPER_OUTPUT_DIR:-$SCRAPER_DIR/output}"
MEMORY_DIR="$HOME/.openclaw/workspace/memory"
FRONTEND_DIR="$PROJECT_DIR/frontend"
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
    target = '${TARGET_USER_ID}'
    base = '${SUPABASE_URL}/rest/v1/profiles'
    if target:
        url = base + '?user_id=eq.' + target + '&select=user_id,region,niche,platforms,role,keywords,content_formats'
    else:
        url = base + '?onboarding_complete=eq.true&select=user_id,region,niche,platforms,role,keywords,content_formats'
    req = urllib.request.Request(url, headers={
        'apikey': '${SUPABASE_KEY}',
        'Authorization': 'Bearer ${SUPABASE_KEY}',
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        rows = json.loads(resp.read())
    if not rows:
        rows = [{'user_id': 'default', 'region': 'US', 'niche': 'tech', 'platforms': [], 'role': 'creator', 'keywords': [], 'content_formats': []}]
    with open('$USERS_FILE', 'w') as f:
        json.dump(rows, f)
    label = f'user {target}' if target else f'{len(rows)} active users'
    print(f'Found {label}')
except Exception as e:
    print(f'Supabase query failed: {e}, using default user')
    with open('$USERS_FILE', 'w') as f:
        json.dump([{'user_id': 'default', 'region': 'US', 'niche': 'tech', 'platforms': [], 'role': 'creator', 'keywords': [], 'content_formats': []}], f)
" 2>&1
else
  echo '[{"user_id":"default","region":"US","niche":"tech","platforms":[],"role":"creator","keywords":[],"content_formats":[]}]' > "$USERS_FILE"
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
  # Write per-source details to marker file
  python3 -c "
import json
try:
    with open('$SCRAPER_OUTPUT/latest-${TYPE}-global.json') as f:
        d = json.load(f)
    sources = [{'name':s.get('source',''),'status':s.get('status','error'),'items':len(s.get('items',[]))} for s in d.get('sources',[])]
except: sources = []
with open('$MARKERS_DIR/global.done','w') as f:
    json.dump({'sources':sources},f)
" 2>/dev/null || echo '{"sources":[]}' > "$MARKERS_DIR/global.done"
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
    python3 -c "
import json
try:
    with open('$REGION_OUT/latest-${TYPE}-region.json') as f:
        d = json.load(f)
    sources = [{'name':s.get('source',''),'status':s.get('status','error'),'items':len(s.get('items',[]))} for s in d.get('sources',[])]
except: sources = []
with open('$MARKERS_DIR/region-${REGION}.done','w') as f:
    json.dump({'sources':sources},f)
" 2>/dev/null || echo '{"sources":[]}' > "$MARKERS_DIR/region-${REGION}.done"
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
    python3 -c "
import json
try:
    with open('$USER_TMP/latest-${TYPE}-topic.json') as f:
        d = json.load(f)
    sources = [{'name':s.get('source',''),'status':s.get('status','error'),'items':len(s.get('items',[]))} for s in d.get('sources',[])]
except: sources = []
with open('$MARKERS_DIR/topic-${USER_ID}.done','w') as f:
    json.dump({'sources':sources},f)
" 2>/dev/null || echo '{"sources":[]}' > "$MARKERS_DIR/topic-${USER_ID}.done"
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
    python3 -c "
import json, os, glob
pf = '$PROGRESS_FILE'
markers = '$MARKERS_DIR'
try:
    with open(pf) as f:
        p = json.load(f)
except:
    p = {'run_id': '$RUN_ID', 'type': '$TYPE', 'started_at': '$STARTED_AT', 'status': 'running', 'steps': {'scraping': {}, 'users': {'status': 'pending', 'total': 0, 'completed': 0}}}
done_jobs = []
source_details = {}
for mf in sorted(glob.glob(os.path.join(markers, '*.done'))):
    job = os.path.basename(mf).replace('.done', '')
    done_jobs.append(job)
    try:
        with open(mf) as f:
            data = json.load(f)
        source_details[job] = data.get('sources', [])
    except:
        source_details[job] = []
p['steps']['scraping']['status'] = 'running'
p['steps']['scraping']['completed'] = len(done_jobs)
p['steps']['scraping']['total'] = $TOTAL_SCRAPE_JOBS
p['steps']['scraping']['done_jobs'] = done_jobs
p['steps']['scraping']['source_details'] = source_details
with open(pf, 'w') as f:
    json.dump(p, f)
" 2>/dev/null
    DONE=$(find "$MARKERS_DIR" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    [ "$DONE" -ge "$TOTAL_SCRAPE_JOBS" ] && break
    sleep 2
  done
) &
MONITOR_PID=$!

# ── Wait for ALL scrapes to finish (with timeout) ──────────────────────────
SCRAPE_TIMEOUT=300  # 5 minutes max for all scrapes

(
  sleep $SCRAPE_TIMEOUT
  echo "[$(date -u +%H:%M:%S)] ⚠️  Scrape timeout (${SCRAPE_TIMEOUT}s) — killing remaining jobs"
  for pid in $SCRAPE_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
) &
TIMEOUT_PID=$!

for pid in $SCRAPE_PIDS; do
  wait "$pid" 2>/dev/null || true
done

# Cancel the timeout watcher (scrapes finished in time)
kill $TIMEOUT_PID 2>/dev/null; wait $TIMEOUT_PID 2>/dev/null || true

# Stop the progress monitor
kill $MONITOR_PID 2>/dev/null; wait $MONITOR_PID 2>/dev/null || true

# ── Final marker scan — catches any markers the monitor missed ─────────────
python3 -c "
import json, os, glob
pf = '$PROGRESS_FILE'
markers = '$MARKERS_DIR'
try:
    with open(pf) as f:
        p = json.load(f)
except:
    p = {'run_id': '$RUN_ID', 'type': '$TYPE', 'started_at': '$STARTED_AT', 'status': 'running', 'steps': {'scraping': {}, 'users': {'status': 'pending', 'total': 0, 'completed': 0}}}
done_jobs = []
source_details = {}
for mf in sorted(glob.glob(os.path.join(markers, '*.done'))):
    job = os.path.basename(mf).replace('.done', '')
    done_jobs.append(job)
    try:
        with open(mf) as f:
            data = json.load(f)
        source_details[job] = data.get('sources', [])
    except:
        source_details[job] = []
p['steps']['scraping']['completed'] = len(done_jobs)
p['steps']['scraping']['total'] = $TOTAL_SCRAPE_JOBS
p['steps']['scraping']['done_jobs'] = done_jobs
p['steps']['scraping']['source_details'] = source_details
with open(pf, 'w') as f:
    json.dump(p, f)
" 2>/dev/null || true

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
p['steps']['scraping']['completed'] = $TOTAL_SCRAPE_JOBS
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

active = [s for s in manifest if s.get('file') and s.get('name') != 'Social Trend Blogs']
api_key = os.environ.get('OPENAI_API_KEY', '')
niche = '$NICHE'

succeeded = 0
failed = 0

def call_openai(source_name, safe_name, item_count, source_file):
    with open(source_file) as f:
        source_data = json.dumps(json.load(f))

    prompt = f'''Today is $TODAY. Run type: $TYPE. User niche: {niche}.
You are analyzing {source_name} ({item_count} items) for a trend dashboard.

IMPORTANT: Include ALL items from the data — do NOT filter out items that are unrelated to \"{niche}\".
For EVERY item, provide:
- Momentum: rising|falling|stable|new|viral
- Why it's trending (1-2 sentences)
- Score 0-100 based on overall engagement and virality (NOT niche relevance)
- Relevance to \"{niche}\": high|medium|low

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

  # ── Scoring agent ────────────────────────────────────────────────────────────
  write_progress "p['steps']['users']['current_step'] = 'scoring'"
  echo "[$(date -u +%H:%M:%S)]   Running scoring agent..."

  SCORED_FILE="$USER_TMP/_scored.json"
  python3 "$SCRIPT_DIR/scoring-agent.py" \
    --agents-dir "$USER_AGENTS" \
    --sources-dir "$USER_SOURCES" \
    --raw-data "$COMBINED_FILE" \
    --output "$SCORED_FILE"

  # ── Orchestration agent ──────────────────────────────────────────────────────
  write_progress "p['steps']['users']['current_step'] = 'personalizing'"
  echo "[$(date -u +%H:%M:%S)]   Running orchestration agent..."

  ORCHESTRATED_FILE="$USER_TMP/_orchestrated.json"
  python3 "$SCRIPT_DIR/orchestration-agent.py" \
    --scored-file "$SCORED_FILE" \
    --user-profile "$USER_TMP/config.json" \
    --output "$ORCHESTRATED_FILE" || {
    echo "  Orchestration failed, using scored output"
    cp "$SCORED_FILE" "$ORCHESTRATED_FILE"
  }

  # ── Bridging agent ──────────────────────────────────────────────────────────
  write_progress "p['steps']['users']['current_step'] = 'briefing'"
  echo "[$(date -u +%H:%M:%S)]   Running bridging agent..."

  BRIDGED_FILE="$USER_TMP/_bridged.json"
  python3 "$SCRIPT_DIR/bridging-agent.py" \
    --orchestrated-file "$ORCHESTRATED_FILE" \
    --sources-dir "$USER_SOURCES" \
    --user-profile "$USER_TMP/config.json" \
    --run-type "$TYPE" \
    --output "$BRIDGED_FILE" || {
    echo "  Bridging failed, using orchestrated output"
    cp "$ORCHESTRATED_FILE" "$BRIDGED_FILE"
  }

  # ── Summary agent + Final output ─────────────────────────────────────────────
  write_progress "p['steps']['users']['current_step'] = 'summarizing'"
  echo "[$(date -u +%H:%M:%S)]   Running summary agent..."

  export USER_TMP BRIDGED_FILE TYPE NICHE TODAY

  python3 << 'AGGEOF'
import json, os, time, sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen

user_tmp = os.environ.get('USER_TMP', '/tmp')
orchestrated_file = os.environ.get('BRIDGED_FILE', '') or os.environ.get('ORCHESTRATED_FILE', '')
run_type = os.environ.get('TYPE', 'pulse')
niche = os.environ.get('NICHE', 'tech')
today = os.environ.get('TODAY', '')
api_key = os.environ.get('OPENAI_API_KEY', '')

# Load orchestrated data (or scored data as fallback)
with open(orchestrated_file) as f:
    output = json.load(f)

output['type'] = run_type

# Collect all trends for summary agent
all_trends = []
for cat in output.get('categories', []):
    all_trends.extend(cat.get('trends', []))
all_trends.sort(key=lambda x: x.get('popularity', {}).get('score', 0), reverse=True)

total_items = len(all_trends)

# ── Summary agent (gpt-4o) ──
print(f"  Running summary agent...", file=sys.stderr)
try:
    prompt = f"""Today is {today}. Run type: {run_type}. User niche: {niche}.

{len(all_trends)} scored trends (cross-platform duplicates already merged, scores are signal-based):

{json.dumps(all_trends[:30], indent=1)}

1. Generate top_movers (top 5 by significance for this niche)
2. Generate signals: emerging (new notable trends) and fading
3. Write a 3-5 sentence summary focused on what matters for the "{niche}" niche

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
    output['summary'] = f'{total_items} trends from {output["data_quality"]["sources_ok"]} sources for niche: {niche}.'

# Write final output
final_file = os.path.join(user_tmp, '_final.json')
with open(final_file, 'w') as f:
    json.dump(output, f)
print(f"  Final: {total_items} trends, {output['data_quality']['sources_ok']} sources", file=sys.stderr)
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

  # ── Also save to frontend local data dir for JSON file-based serving ───────
  if [ -s "$FINAL_FILE" ]; then
    FRONTEND_DATA="$FRONTEND_DIR/data"
    mkdir -p "$FRONTEND_DATA"
    TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
    LOCAL_FILENAME="${TYPE}-${TIMESTAMP}.json"
    python3 -c "
import json
with open('$FINAL_FILE') as f:
    data = json.load(f)
out = {'type': '$TYPE', 'region': '$REGION', 'created_at': '$TIMESTAMP', 'data': data}
with open('$FRONTEND_DATA/$LOCAL_FILENAME', 'w') as f:
    json.dump(out, f)
print(f'  ✓ Saved to frontend/data/$LOCAL_FILENAME')
" 2>&1 || echo "  ✗ Local file save failed"
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
