#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TrendClaw Cron Job Setup
# Run this AFTER the gateway is running: bash setup-crons.sh
#
# Architecture: Scraper runs first → saves data → OpenClaw agent reads it
# =============================================================================

echo "========================================="
echo "  TrendClaw - Cron Job Setup"
echo "========================================="

WEBHOOK_URL="${TRENDCLAW_WEBHOOK_URL:-http://localhost:3000/api/trends}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SCRAPER_DIR="$REPO_DIR/scraper"

echo ""
echo "Webhook delivery target: $WEBHOOK_URL"
echo "Scraper directory: $SCRAPER_DIR"
echo ""

# =============================================================================
# Part 1: System cron jobs for the scraper (runs BEFORE OpenClaw agent)
# =============================================================================

echo "Setting up scraper cron jobs..."

# Create the scraper runner script
cat > "$REPO_DIR/deploy/run-scraper.sh" << SCRAPEREOF
#!/usr/bin/env bash
set -euo pipefail
source ~/.openclaw/.env 2>/dev/null || true
export SCRAPER_OUTPUT_DIR="\${SCRAPER_OUTPUT_DIR:-\$HOME/.openclaw/workspace/scraper-data}"
cd "$SCRAPER_DIR"
node dist/index.js "\$@" >> /var/log/trendclaw-scraper.log 2>&1
SCRAPEREOF
chmod +x "$REPO_DIR/deploy/run-scraper.sh"

# Install system cron jobs for scraper
# Scraper runs 3 minutes BEFORE the OpenClaw agent
CRON_ENTRIES="
# TrendClaw Scraper - runs before OpenClaw agent
*/15 * * * * $REPO_DIR/deploy/run-scraper.sh --type pulse
57 7 * * * $REPO_DIR/deploy/run-scraper.sh --type digest
57 8 * * 1 $REPO_DIR/deploy/run-scraper.sh --type deep_dive
"

# Add to crontab without duplicating
(crontab -l 2>/dev/null | grep -v "trendclaw\|run-scraper" ; echo "$CRON_ENTRIES") | crontab -
echo "  System cron jobs installed for scraper."

# =============================================================================
# Part 2: OpenClaw cron jobs for the agent (reads pre-collected data)
# =============================================================================

echo ""
echo "Setting up OpenClaw agent cron jobs..."

# --- Quick Pulse: Every 15 minutes (at :00, scraper ran at :57 of previous hour or :12/:27/:42) ---
# Actually scraper runs at same */15 schedule. Agent runs ~3 min after.
# We offset the OpenClaw crons by 3 minutes: */15 starting at :03

echo ""
echo "[1/3] Creating Quick Pulse cron (every 15 min, offset +3)..."
openclaw cron add \
  --name "TrendClaw Quick Pulse" \
  --cron "3,18,33,48 * * * *" \
  --model "openai/gpt-4o-mini" \
  --session isolated \
  --message "Quick pulse check. Use the trend_monitor skill. Run type: pulse.

Read the pre-collected data from ~/.openclaw/workspace/scraper-data/latest.json first.
Then analyze the top movers. Use 0-2 web_search queries for any breaking news.
Return top 5-8 trends with popularity scores. Return structured JSON." \
  --delivery-mode webhook \
  --delivery-to "$WEBHOOK_URL"
echo "  Done."

# --- Daily Digest: Every day at 8am UTC (scraper runs at 7:57) ---
echo ""
echo "[2/3] Creating Daily Digest cron (daily 8am UTC)..."
openclaw cron add \
  --name "TrendClaw Daily Digest" \
  --cron "0 8 * * *" \
  --model "openai/gpt-4o" \
  --session isolated \
  --message "Daily digest. Use the trend_monitor skill. Run type: digest.

Read the pre-collected data from ~/.openclaw/workspace/scraper-data/latest.json first.
This contains data from 15+ sources including HN, CoinGecko, Reddit RSS, GitHub trending, YouTube, Wikipedia, NewsAPI, and more.
Analyze ALL sources. Cross-reference trends across platforms.
Use 3-5 web_search queries for context and gap-filling.
Return 12-20 trends with full popularity metrics and why_trending. Return structured JSON." \
  --delivery-mode webhook \
  --delivery-to "$WEBHOOK_URL"
echo "  Done."

# --- Weekly Deep Dive: Monday 9am UTC (scraper runs at 8:57) ---
echo ""
echo "[3/3] Creating Weekly Deep Dive cron (Monday 9am UTC)..."
openclaw cron add \
  --name "TrendClaw Weekly Deep Dive" \
  --cron "0 9 * * 1" \
  --model "openai/gpt-4o" \
  --session isolated \
  --message "Weekly deep dive. Use the trend_monitor skill. Run type: deep_dive.

Read the pre-collected data from ~/.openclaw/workspace/scraper-data/latest.json first.
This contains comprehensive data from all sources.
Cross-reference trends across all platforms.
Use 8-10 web_search queries for deep context and analysis.
Identify week-over-week trend shifts. Highlight emerging trends.
Provide analysis on WHY each major trend is moving.
Return 15-25 trends with full narrative analysis. Return structured JSON." \
  --delivery-mode webhook \
  --delivery-to "$WEBHOOK_URL"
echo "  Done."

# --- Verify ---
echo ""
echo "========================================="
echo "  All Cron Jobs Created!"
echo "========================================="
echo ""
echo "  System cron (scraper):"
echo "    - Quick Pulse scraper: every 15 min"
echo "    - Daily Digest scraper: 7:57 AM UTC"
echo "    - Weekly Deep Dive scraper: Monday 8:57 AM UTC"
echo ""
echo "  OpenClaw cron (agent):"
openclaw cron list
echo ""
echo "  To test end-to-end:"
echo "    1. Run scraper:  source ~/.openclaw/.env && cd $SCRAPER_DIR && node dist/index.js --type pulse"
echo "    2. Run agent:    openclaw cron run <pulse-job-id>"
echo ""
echo "  To view scraper logs:"
echo "    tail -f /var/log/trendclaw-scraper.log"
echo ""
