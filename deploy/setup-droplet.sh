#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TrendClaw Droplet Setup Script
# Run this on a fresh Ubuntu droplet: bash setup-droplet.sh
# =============================================================================

echo "========================================="
echo "  TrendClaw - Droplet Setup"
echo "========================================="

# --- 1. Install Node 22+ ---
echo ""
echo "[1/7] Installing Node.js 22..."
if command -v node &>/dev/null && [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -ge 22 ]]; then
    echo "  Node $(node -v) already installed. Skipping."
else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "  Node $(node -v) installed."
fi

# --- 2. Install pnpm (needed for some OpenClaw operations) ---
echo ""
echo "[2/7] Installing pnpm..."
if command -v pnpm &>/dev/null; then
    echo "  pnpm $(pnpm -v) already installed. Skipping."
else
    npm install -g pnpm
    echo "  pnpm installed."
fi

# --- 3. Install OpenClaw ---
echo ""
echo "[3/7] Installing OpenClaw..."
npm install -g openclaw@latest
echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'installed') ready."

# --- 4. Install Playwright + browsers for scraper ---
echo ""
echo "[4/7] Installing Playwright browsers..."
npx playwright install --with-deps chromium
echo "  Chromium installed for Playwright."

# --- 5. Create directory structure ---
echo ""
echo "[5/7] Setting up directories..."
mkdir -p ~/.openclaw/workspace/skills/trend-monitor
mkdir -p ~/.openclaw/workspace/scraper-data
mkdir -p ~/.openclaw/cron

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# --- 6. Build the scraper ---
echo ""
echo "[6/7] Building TrendClaw scraper..."
cd "$REPO_DIR/scraper"
npm install
npm run build
echo "  Scraper built."
cd "$REPO_DIR"

# --- 7. Copy config and workspace files ---
echo ""
echo "[7/7] Copying configuration files..."

# Copy gateway config
cp "$REPO_DIR/config/openclaw.json" ~/.openclaw/openclaw.json
echo "  Copied openclaw.json"

# Copy workspace files
cp "$REPO_DIR/workspace/SOUL.md" ~/.openclaw/workspace/SOUL.md
cp "$REPO_DIR/workspace/AGENTS.md" ~/.openclaw/workspace/AGENTS.md
cp "$REPO_DIR/workspace/IDENTITY.md" ~/.openclaw/workspace/IDENTITY.md
echo "  Copied workspace files (SOUL.md, AGENTS.md, IDENTITY.md)"

# Copy skill
cp "$REPO_DIR/skills/trend-monitor/SKILL.md" ~/.openclaw/workspace/skills/trend-monitor/SKILL.md
echo "  Copied trend-monitor skill"

# --- Environment setup ---
echo ""
echo "Setting up environment..."

if [ ! -f ~/.openclaw/.env ]; then
    cat > ~/.openclaw/.env << 'ENVEOF'
# === LLM ===
OPENAI_API_KEY=sk-your-openai-key-here

# === Search ===
BRAVE_API_KEY=your-brave-search-key-here

# === Data Source APIs (optional but recommended) ===
YOUTUBE_API_KEY=your-youtube-api-key-here
NEWSAPI_KEY=your-newsapi-key-here

# === Proxy for browser scraping (optional) ===
# PROXY_URL=http://user:pass@proxy.scraperapi.com:8001

# === Gateway ===
OPENCLAW_GATEWAY_TOKEN=change-me-to-random-string
OPENCLAW_HOOKS_TOKEN=change-me-to-random-string
TRENDCLAW_WEBHOOK_URL=http://localhost:3000/api/trends

# === Scraper ===
SCRAPER_OUTPUT_DIR=$HOME/.openclaw/workspace/scraper-data
ENVEOF
    echo "  Created ~/.openclaw/.env (EDIT THIS WITH YOUR API KEYS)"
else
    echo "  ~/.openclaw/.env already exists. Skipping."
fi

# --- Done ---
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "  NEXT STEPS:"
echo ""
echo "  1. Edit your API keys:"
echo "     nano ~/.openclaw/.env"
echo ""
echo "  2. Run the onboarding wizard:"
echo "     openclaw onboard"
echo ""
echo "  3. Start the gateway:"
echo "     openclaw gateway --verbose"
echo ""
echo "  4. Set up cron jobs (in a separate terminal):"
echo "     bash $REPO_DIR/deploy/setup-crons.sh"
echo ""
echo "  5. Test the scraper manually:"
echo "     source ~/.openclaw/.env"
echo "     cd $REPO_DIR/scraper && node dist/index.js --type pulse"
echo ""
echo "  6. Verify everything:"
echo "     openclaw cron list"
echo ""
