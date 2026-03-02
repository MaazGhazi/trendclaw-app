# TrendClaw

Real-time trend monitoring across Tech/AI, Crypto/Finance, and Social Media. Scrapes 15+ sources, analyzes with GPT-4o via OpenClaw, and displays trends on a live dashboard.

## How It Works

```
Scraper (15+ sources) → OpenClaw Agent (GPT-4o) → Webhook POST → Next.js Dashboard
```

1. **Scraper** collects data from APIs, RSS feeds, and browser scraping (Playwright)
2. **OpenClaw agent** reads the collected data, analyzes trends, and outputs structured JSON
3. **run-pulse.sh** parses the agent output and POSTs it to the frontend webhook
4. **Dashboard** displays trends grouped by category with auto-refresh

## Quick Start

### Prerequisites
- DigitalOcean droplet (or any Ubuntu server) with Node 22+
- API keys: OpenAI, Brave Search, YouTube (optional), NewsAPI (optional)
- OpenClaw installed globally (`npm install -g openclaw@latest`)

### 1. Clone and Set Up

```bash
git clone git@github.com:MaazGhazi/trendclaw-app.git
cd trendclaw-app
bash deploy/setup-droplet.sh
```

### 2. Configure API Keys

```bash
nano ~/.openclaw/.env
```

Required keys:
- `OPENAI_API_KEY` — for GPT-4o analysis
- `BRAVE_API_KEY` — for web search gap-filling
- `OPENCLAW_GATEWAY_TOKEN` — gateway auth (any random string)
- `OPENCLAW_HOOKS_TOKEN` — webhook auth (any random string)

Optional keys:
- `YOUTUBE_API_KEY` — YouTube trending videos
- `NEWSAPI_KEY` — news articles

### 3. Build and Start

```bash
# Build the frontend
cd frontend && npm install && npm run build && cd ..

# Build the scraper
cd scraper && npm install && npm run build && cd ..

# Start services
pm2 start openclaw -- gateway --verbose --name trendclaw-gateway
pm2 start npm --name trendclaw-frontend -- start --prefix frontend
pm2 save
```

### 4. Open the Dashboard

```
http://YOUR_SERVER_IP:3000
```

### 5. Run a Test Pulse

```bash
bash deploy/run-pulse.sh pulse
```

## Daily Operations

### Start Everything

```bash
pm2 start trendclaw-gateway
pm2 start trendclaw-frontend
```

Then restore the cron schedule:

```bash
crontab << 'EOF'
# TrendClaw — scraper + agent + webhook (full pipeline)
*/15 * * * * /bin/bash /root/trendclaw-app/deploy/run-pulse.sh pulse >> /var/log/trendclaw-pulse.log 2>&1
0 8 * * * /bin/bash /root/trendclaw-app/deploy/run-pulse.sh digest >> /var/log/trendclaw-digest.log 2>&1
0 9 * * 1 /bin/bash /root/trendclaw-app/deploy/run-pulse.sh deep_dive >> /var/log/trendclaw-deepdive.log 2>&1
EOF
```

### Stop Everything (save tokens)

```bash
crontab -r                      # remove all crons
pm2 stop trendclaw-gateway      # stop the gateway
pm2 save                        # persist state
```

The frontend can stay running — it has zero API cost.

### Check Status

```bash
pm2 list                        # see running services
crontab -l                      # see scheduled jobs
tail -50 /var/log/trendclaw-pulse.log  # check recent pulse logs
```

### Manual Runs

```bash
bash deploy/run-pulse.sh pulse      # quick pulse (~12 trends, 5 sources)
bash deploy/run-pulse.sh digest     # daily digest (~20 trends, all sources)
bash deploy/run-pulse.sh deep_dive  # deep dive (~25 trends, all sources + extra search)
```

### Deploy Code Changes

```bash
# On your Mac — push changes
git add . && git commit -m "your message" && git push

# On the droplet — pull and rebuild
cd ~/trendclaw-app && git pull origin main
cd frontend && npm run build && pm2 restart trendclaw-frontend
```

## Run Types

| Type | Schedule | Sources | Trends | Model |
|------|----------|---------|--------|-------|
| **pulse** | Every 15 min | 5 (HN, CoinGecko, Lobsters, Reddit, GitHub) | ~12 | GPT-4o |
| **digest** | Daily 8 AM | 17+ (all APIs, RSS, browser scraping) | ~20 | GPT-4o |
| **deep_dive** | Monday 9 AM | 17+ (all sources + extra web search) | ~25 | GPT-4o |

## Data Sources

### APIs (fetch)
- Hacker News, CoinGecko, Lobsters, Dev.to, Bluesky, YouTube, Wikipedia, NewsAPI

### RSS Feeds
- Reddit (Popular, Technology, Cryptocurrency, Artificial), TechCrunch, The Verge, Ars Technica, CoinDesk, Product Hunt

### Browser Scraping (Playwright)
- GitHub Trending, Google Trends, TikTok Creative Center

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/trends` | Webhook receiver — stores incoming trend JSON |
| `GET` | `/api/trends` | Returns the latest stored trends |
| `GET` | `/api/trends/history` | Lists all past runs |
| `GET` | `/api/trends/history?file=X` | Returns a specific past run |

### Test the Webhook

```bash
curl -X POST http://localhost:3000/api/trends \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENCLAW_HOOKS_TOKEN" \
  -d '{"type":"pulse","timestamp":"2026-03-01T12:00:00Z","data_quality":{"sources_ok":5,"sources_failed":[],"total_raw_items":60},"categories":[{"name":"Tech & AI","trends":[{"title":"Test","description":"Test trend","why_trending":"Testing","momentum":"rising","popularity":{"score":80,"metric":"test","reach":"high"},"sources":["Test"],"urls":[],"first_seen":null,"relevance":"high"}]}],"top_movers":[],"signals":{"emerging":[],"fading":[]},"summary":"Test pulse."}'
```

## Project Structure

```
trendclaw-app/
├── frontend/                 # Next.js 15 dashboard
│   ├── app/page.tsx          # Main dashboard (30s auto-refresh)
│   ├── app/api/trends/       # Webhook + data endpoints
│   ├── components/           # TrendCard, CategorySection, DataQuality, TopMovers
│   └── data/                 # JSON file storage (last 100 runs)
├── scraper/                  # Playwright + fetch data collector
│   ├── src/index.ts          # Main runner
│   └── src/sources/          # 13 source collectors
├── deploy/
│   ├── run-pulse.sh          # Full pipeline script
│   ├── setup-droplet.sh      # Server setup
│   └── setup-crons.sh        # Legacy cron setup
├── config/openclaw.json      # Gateway configuration
├── skills/trend-monitor/     # Agent skill definition
├── workspace/                # Agent persona files
└── openclaw/                 # OpenClaw source
```

## Troubleshooting

**Dashboard shows "No trend data yet"**
- Run `bash deploy/run-pulse.sh pulse` to generate data

**Agent parse error on dashboard**
- Check logs: `tail -50 /var/log/trendclaw-pulse.log`
- The agent may have returned unexpected format — run manually to debug

**Scraper sources showing 0 items / skipped**
- Check API keys in `~/.openclaw/.env`
- YouTube and NewsAPI require valid keys to work

**Can't access dashboard from browser**
- Ensure port 3000 is open: `ufw allow 3000/tcp`
- Check frontend is running: `pm2 list`

**Gateway won't start**
- Check if port is in use: `lsof -i :18789`
- Try `pm2 delete trendclaw-gateway` then re-add
