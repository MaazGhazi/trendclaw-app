# OpenClaw Setup — Connecting to TrendClaw

## Overview

OpenClaw runs on the same Digital Ocean droplet as the backend and Postgres. The frontend (Vercel) never talks to OpenClaw directly.

```
Frontend (Vercel)  ──HTTPS──▶  Backend (:4000)  ──WebSocket──▶  OpenClaw (:18789)
                                    ◀──HTTP webhook POST──
```

## How They Talk

### Connection 1: Backend → OpenClaw (WebSocket)

The backend connects to OpenClaw's gateway via WebSocket to manage cron jobs (create, update, remove, force-run).

**Backend env var:**
```env
OPENCLAW_GATEWAY_URL="ws://localhost:18789"
```

The backend code in `backend/src/lib/openclaw/client.ts` handles:
- Connecting to the gateway on startup
- Auto-reconnecting if the connection drops
- Sending JSON-RPC requests (`cron.add`, `cron.remove`, etc.)

### Connection 2: OpenClaw → Backend (HTTP Webhook)

When a cron job finishes running, OpenClaw POSTs the result back to the backend. This is how signals get ingested.

**Backend env vars:**
```env
BACKEND_URL="http://localhost:4000"
OPENCLAW_WEBHOOK_TOKEN="your-shared-secret-here"
```

The webhook URL `http://localhost:4000/api/webhooks/openclaw` is set on each cron job when it's created. The token must match between OpenClaw's cron config and the backend's `.env`.

### Connection 3: Frontend → Backend (HTTPS)

The Vercel frontend calls the backend API over the public internet.

**Frontend env var (Vercel dashboard):**
```env
NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
```

---

## Droplet Setup Steps

### 1. Provision the Droplet

- Ubuntu 22.04+, minimum 2GB RAM recommended
- Install Docker and Docker Compose
- Point a domain/subdomain to the droplet IP (e.g. `api.yourdomain.com`)

### 2. Clone the Repo

```bash
git clone <your-repo-url> /opt/trendclaw
cd /opt/trendclaw
```

### 3. Set Up OpenClaw

OpenClaw lives in the `openclaw/` directory. It needs:
- Node.js 20+
- An OpenAI API key (for the LLM agent)

```bash
cd /opt/trendclaw/openclaw
npm install
```

Configure OpenClaw's settings (typically in its config or `.env`):
- **Gateway port**: `3010` (default)
- **Webhook token**: Set `cron.webhookToken` to a strong secret — this must match `OPENCLAW_WEBHOOK_TOKEN` in the backend `.env`
- **OpenAI API key**: Set in OpenClaw's config so the agent can call GPT

Start OpenClaw:
```bash
npm start
# or use pm2/systemd for production:
# pm2 start npm --name openclaw -- start
```

Verify it's running:
```bash
curl http://localhost:18789/health
```

### 4. Set Up Postgres

```bash
docker run -d \
  --name trendclaw-postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=<strong-password> \
  -e POSTGRES_DB=trendclaw \
  -p 5433:5432 \
  postgres:16-alpine
```

### 5. Set Up the Backend

```bash
cd /opt/trendclaw/backend
npm install
```

Create `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:<strong-password>@localhost:5433/trendclaw?schema=public"
JWT_SECRET="<generate-a-strong-secret>"
OPENCLAW_GATEWAY_URL="ws://localhost:18789"
OPENCLAW_WEBHOOK_TOKEN="<same-token-as-openclaw>"
BACKEND_URL="http://localhost:4000"
PORT=4000
CORS_ORIGIN="https://yourdomain.com"
```

Push the database schema and start:
```bash
npx prisma db push
npm run build
npm start
# or: pm2 start npm --name trendclaw-backend -- start
```

### 6. Set Up Reverse Proxy (nginx or Caddy)

Only the backend needs to be exposed publicly. OpenClaw and Postgres stay internal.

**Caddy example** (auto-HTTPS):
```
api.yourdomain.com {
    reverse_proxy localhost:4000
}
```

**nginx example:**
```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Let's Encrypt SSL managed by certbot
}
```

### 7. Deploy Frontend to Vercel

In the Vercel dashboard, set the environment variable:
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## Security Checklist

- [ ] Only port 443 (HTTPS) is open on the droplet firewall
- [ ] OpenClaw port (3010) is NOT exposed publicly
- [ ] Postgres port (5433) is NOT exposed publicly
- [ ] `JWT_SECRET` is a strong random string (not the default)
- [ ] `OPENCLAW_WEBHOOK_TOKEN` is a strong random string matching on both sides
- [ ] Postgres password is strong (not `postgres`)
- [ ] CORS_ORIGIN is set to your actual frontend domain

---

## Testing the Full Pipeline

1. Register/login via the frontend
2. Add a client with a LinkedIn URL
3. The backend sends `cron.add` to OpenClaw → creates a monitoring cron job
4. OpenClaw runs the agent → searches LinkedIn/social pages → outputs signal JSON
5. OpenClaw POSTs the result to `http://localhost:4000/api/webhooks/openclaw`
6. Backend parses the signals and stores them in Postgres
7. Signals appear on the dashboard and signals page

**To manually trigger a scan:**
```bash
# From the droplet, force-run a cron job
curl -X POST http://localhost:4000/api/webhooks/openclaw \
  -H "Authorization: Bearer <your-webhook-token>" \
  -H "Content-Type: application/json" \
  -d '{"action":"finished","jobId":"<cron-job-id>","status":"ok","summary":"[{\"type\":\"funding\",\"title\":\"Test Signal\",\"summary\":\"Test signal for debugging\",\"confidence\":0.9}]"}'
```

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| Backend can't connect to OpenClaw | Is OpenClaw running? Check `curl http://localhost:18789/health` |
| Webhook not receiving data | Does `OPENCLAW_WEBHOOK_TOKEN` match on both sides? |
| Frontend can't reach backend | Is the reverse proxy running? Is `NEXT_PUBLIC_API_URL` correct? Is CORS_ORIGIN set? |
| No signals appearing | Check OpenClaw logs for agent errors. Check backend logs for webhook parse errors |
| OpenClaw agent failing | Check OpenAI API key is set and has credits |
