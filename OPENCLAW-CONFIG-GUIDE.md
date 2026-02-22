# OpenClaw Configuration Guide for TrendClaw

> Last updated: Feb 21, 2026

## The Problem We Found

OpenClaw IS running and connected, but:
1. **Web search/fetch tools were not enabled** — the agent literally cannot search the internet
2. **No `BRAVE_API_KEY`** — web search needs an API key
3. **`cron.webhookToken` not set** — webhook auth mismatch caused silent 401 rejections, every signal was thrown away
4. **Possibly no LLM API key** — the agent needs `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` to think

---

## Step 1: Get API Keys

| Key | Where to get it | Cost |
|-----|----------------|------|
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | Pay-per-use |
| **OR** `ANTHROPIC_API_KEY` | https://console.anthropic.com | Pay-per-use |
| `BRAVE_API_KEY` | https://brave.com/search/api/ ("Data for Search" plan) | Free tier = 2000 searches/month |

You need **one LLM key** (OpenAI or Anthropic) **plus** the Brave key.

---

## Step 2: Create OpenClaw Config

SSH into the droplet:

```bash
ssh root@143.110.218.58
```

Edit (or create) `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "PICK_A_RANDOM_GATEWAY_TOKEN"
    }
  },

  "cron": {
    "enabled": true,
    "maxConcurrentRuns": 2,
    "sessionRetention": "24h",
    "webhookToken": "PICK_A_RANDOM_WEBHOOK_TOKEN"
  },

  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-4o"
      },
      "timeoutSeconds": 600
    }
  },

  "tools": {
    "web": {
      "search": {
        "enabled": true,
        "maxResults": 10,
        "timeoutSeconds": 30
      },
      "fetch": {
        "enabled": true,
        "maxChars": 50000,
        "timeoutSeconds": 30
      }
    }
  }
}
```

> **Note:** If you prefer Claude over GPT, change `"openai/gpt-4o"` to `"anthropic/claude-sonnet-4-5"` and use `ANTHROPIC_API_KEY` instead of `OPENAI_API_KEY`.

---

## Step 3: Set Environment Variables

Create or edit `~/.openclaw/.env`:

```bash
OPENAI_API_KEY=sk-your-openai-key-here
BRAVE_API_KEY=BSAyour-brave-key-here
OPENCLAW_GATEWAY_TOKEN=PICK_A_RANDOM_GATEWAY_TOKEN
```

Make sure `OPENCLAW_GATEWAY_TOKEN` here matches `gateway.auth.token` in the JSON config above.

---

## Step 4: Update Backend `.env` to Match

Edit `/opt/trendclaw/backend/.env`:

```bash
DATABASE_URL="postgresql://postgres:YOUR_PW@localhost:5433/trendclaw?schema=public"
JWT_SECRET="your-jwt-secret"
OPENCLAW_GATEWAY_URL="ws://localhost:18789"
OPENCLAW_GATEWAY_TOKEN="PICK_A_RANDOM_GATEWAY_TOKEN"
OPENCLAW_WEBHOOK_TOKEN="PICK_A_RANDOM_WEBHOOK_TOKEN"
BACKEND_URL="http://localhost:4000"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
```

**The two tokens that MUST match:**
- `OPENCLAW_GATEWAY_TOKEN` in backend `.env` = `gateway.auth.token` in openclaw.json
- `OPENCLAW_WEBHOOK_TOKEN` in backend `.env` = `cron.webhookToken` in openclaw.json

---

## Step 5: Deploy & Restart

```bash
# Pull latest code
cd /opt/trendclaw
git pull

# Rebuild backend
cd backend
npm run build

# Restart everything
pm2 restart all
```

---

## Step 6: Verify Everything Works

### Check OpenClaw is running
```bash
curl http://localhost:18789/health
```

### Check backend sees OpenClaw
```bash
curl http://localhost:4000/api/health
```
Should show `"openclawConnected": true`.

### Check cron jobs exist
```bash
curl http://localhost:4000/api/debug/openclaw
```
Shows all cron jobs in OpenClaw and their run history.

### Check backend logs after a scan
```bash
pm2 logs trendclaw-backend --lines 30
```
Look for `[webhook]` lines showing signals being received and stored.

### Trigger a test scan
Go to a client detail page in the frontend and click **"Scan Now"**, or:
```bash
# Replace CLIENT_ID and TOKEN with real values
curl -X POST http://localhost:4000/api/clients/CLIENT_ID/scan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## How the Full Pipeline Works

```
1. User clicks "Scan Now" (or cron fires every 12h)
       ↓
2. Backend sends cron.run to OpenClaw via WebSocket (:18789)
       ↓
3. OpenClaw spawns isolated agent session
       ↓
4. Agent uses web_search (Brave API) to find company news
       ↓
5. Agent uses web_fetch to read article pages
       ↓
6. Agent outputs JSON array of signals
       ↓
7. OpenClaw POSTs result to http://localhost:4000/api/webhooks/openclaw
   with Authorization: Bearer <cron.webhookToken>
       ↓
8. Backend parses signals, stores in PostgreSQL
       ↓
9. Frontend fetches and displays signals
```

---

## Config Reference (All Fields)

### Gateway

| Field | Default | Purpose |
|-------|---------|---------|
| `gateway.port` | `18789` | WebSocket + HTTP port |
| `gateway.bind` | `"loopback"` | `"loopback"` or `"0.0.0.0"` |
| `gateway.auth.mode` | — | `"token"` or `"password"` |
| `gateway.auth.token` | — | Shared secret for WebSocket auth |

### Cron

| Field | Default | Purpose |
|-------|---------|---------|
| `cron.enabled` | `true` | Must be true for jobs to run |
| `cron.maxConcurrentRuns` | `1` | How many jobs run at once |
| `cron.sessionRetention` | `"24h"` | How long to keep run history |
| `cron.webhookToken` | — | Bearer token sent on webhook POSTs |

### Agent

| Field | Default | Purpose |
|-------|---------|---------|
| `agents.defaults.model.primary` | — | LLM model (e.g. `"openai/gpt-4o"`) |
| `agents.defaults.model.fallbacks` | `[]` | Backup models if primary fails |
| `agents.defaults.timeoutSeconds` | `300` | Max time per agent run |
| `agents.defaults.maxConcurrent` | `1` | Max parallel agent runs |

### Tools (Web)

| Field | Default | Purpose |
|-------|---------|---------|
| `tools.web.search.enabled` | `false` | **MUST be true** for web search |
| `tools.web.search.apiKey` | — | Brave API key (or use env var) |
| `tools.web.search.maxResults` | `5` | Results per search query |
| `tools.web.fetch.enabled` | `false` | **MUST be true** for page fetching |
| `tools.web.fetch.maxChars` | `50000` | Max chars extracted per page |

### Environment Variables

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | OpenAI LLM access |
| `ANTHROPIC_API_KEY` | Anthropic LLM access (alternative) |
| `BRAVE_API_KEY` | Brave web search API |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway auth token |
| `OPENCLAW_SKIP_CRON` | Set to `1` to disable cron |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "browser tool is currently unavailable" | Browser not enabled, prompt used to require it | Already fixed — prompt now uses web_search |
| Webhook returns 401 | Token mismatch | Make `cron.webhookToken` = `OPENCLAW_WEBHOOK_TOKEN` |
| "Received webhook for unknown job" | Orphaned cron jobs | Clean up: `openclaw cron list` then `openclaw cron remove <id>` |
| Agent returns empty `[]` | No web search API key | Set `BRAVE_API_KEY` |
| Agent errors / no output | No LLM API key | Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| Backend can't connect to OpenClaw | Wrong gateway token or port | Check `OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN` |
| Frontend can't reach backend | CORS misconfigured | Set `CORS_ORIGIN` in backend .env to your frontend URL |
| "OpenClaw not connected" on health check | OpenClaw not running | `pm2 status` and restart if needed |

---

## File Locations on the Droplet

| What | Path |
|------|------|
| OpenClaw config | `~/.openclaw/openclaw.json` |
| OpenClaw env vars | `~/.openclaw/.env` |
| OpenClaw cron jobs | `~/.openclaw/cron/jobs.json` |
| OpenClaw cron run logs | `~/.openclaw/cron/runs/<jobId>.jsonl` |
| OpenClaw app logs | `~/.openclaw/openclaw.log` |
| Backend code | `/opt/trendclaw/backend/` |
| Backend env | `/opt/trendclaw/backend/.env` |
| Backend logs | `pm2 logs trendclaw-backend` |
