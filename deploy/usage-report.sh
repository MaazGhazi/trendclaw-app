#!/usr/bin/env bash
# TrendClaw Usage Report — parses OpenClaw session logs for token/cost data
set -euo pipefail

SESSIONS_DIR="${1:-$HOME/.openclaw/agents/main/sessions}"
DAYS="${2:-7}"

echo "========================================"
echo "  TrendClaw Usage Report (last ${DAYS}d)"
echo "========================================"
echo ""

cutoff=$(date -u -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-${DAYS}d +%Y-%m-%dT%H:%M:%S)

python3 - "$SESSIONS_DIR" "$cutoff" << 'PYEOF'
import json, sys, os, glob
from collections import defaultdict

sessions_dir = sys.argv[1]
cutoff = sys.argv[2]

totals = {"input": 0, "output": 0, "totalTokens": 0, "cost": 0.0}
by_model = defaultdict(lambda: {"input": 0, "output": 0, "totalTokens": 0, "cost": 0.0, "calls": 0})
by_day = defaultdict(lambda: {"tokens": 0, "cost": 0.0, "calls": 0})
run_count = 0

for f in sorted(glob.glob(os.path.join(sessions_dir, "*.jsonl"))):
    for line in open(f):
        try:
            entry = json.loads(line)
        except:
            continue
        if entry.get("type") != "message":
            continue
        msg = entry.get("message", {})
        usage = msg.get("usage")
        if not usage:
            continue
        ts = entry.get("timestamp", "")
        if ts < cutoff:
            continue

        model = msg.get("model", "unknown")
        cost_obj = usage.get("cost", {})
        cost_total = cost_obj.get("total", 0) if isinstance(cost_obj, dict) else 0
        day = ts[:10]

        totals["input"] += usage.get("input", 0)
        totals["output"] += usage.get("output", 0)
        totals["totalTokens"] += usage.get("totalTokens", 0)
        totals["cost"] += cost_total

        by_model[model]["input"] += usage.get("input", 0)
        by_model[model]["output"] += usage.get("output", 0)
        by_model[model]["totalTokens"] += usage.get("totalTokens", 0)
        by_model[model]["cost"] += cost_total
        by_model[model]["calls"] += 1

        by_day[day]["tokens"] += usage.get("totalTokens", 0)
        by_day[day]["cost"] += cost_total
        by_day[day]["calls"] += 1
        run_count += 1

if run_count == 0:
    print("  No usage data found in the given period.")
    sys.exit(0)

print(f"  Total API calls:   {run_count}")
print(f"  Total tokens:      {totals['totalTokens']:,}")
print(f"  Input tokens:      {totals['input']:,}")
print(f"  Output tokens:     {totals['output']:,}")
print(f"  Total cost:        ${totals['cost']:.4f}")
print()

print("  By Model:")
print(f"  {'Model':<20} {'Calls':>6} {'Tokens':>12} {'Cost':>10}")
print(f"  {'-'*20} {'-'*6} {'-'*12} {'-'*10}")
for model in sorted(by_model):
    m = by_model[model]
    print(f"  {model:<20} {m['calls']:>6} {m['totalTokens']:>12,} ${m['cost']:>9.4f}")
print()

print("  By Day:")
print(f"  {'Date':<12} {'Calls':>6} {'Tokens':>12} {'Cost':>10}")
print(f"  {'-'*12} {'-'*6} {'-'*12} {'-'*10}")
for day in sorted(by_day):
    d = by_day[day]
    print(f"  {day:<12} {d['calls']:>6} {d['tokens']:>12,} ${d['cost']:>9.4f}")
PYEOF
