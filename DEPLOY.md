# TrendClaw Deployment Guide

## Prerequisites

- A Digital Ocean account
- Your OpenAI API key (you said you have credits)
- Your repo pushed to GitHub (or available to clone)

---

## Step 1: Create the Droplet

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Create Droplet:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic, 2GB RAM / 1 vCPU ($12/mo) — 4GB recommended
   - **Region**: Pick closest to you
   - **Auth**: SSH key
   - **Hostname**: `trendclaw`
3. Note the IP address

---

## Step 2: Run the Setup Script

From your local machine:

```bash
ssh root@<DROPLET_IP> 'bash -s' < setup-droplet.sh
```

This installs Docker, Node.js 22, pnpm, pm2, starts PostgreSQL, generates all secrets, and configures the firewall.

**Save the output** — it prints your generated secrets.

---

## Step 3: Clone the Repo on the Droplet

```bash
ssh root@<DROPLET_IP>

# Clone
git clone <your-repo-url> /opt/trendclaw
cd /opt/trendclaw
```

---

## Step 4: Set Up OpenClaw

```bash
cd /opt/trendclaw/openclaw

# Install dependencies (OpenClaw uses pnpm)
pnpm install

# Build
pnpm build
```

### Configure OpenClaw

Create the config directory and file:

```bash
mkdir -p ~/.openclaw

cat > ~/.openclaw/openclaw.json <<'EOF'
{
  "cron": {
    "enabled": true,
    "webhookToken": "PASTE_OPENCLAW_WEBHOOK_TOKEN_HERE"
  }
}
EOF
```

Replace `PASTE_OPENCLAW_WEBHOOK_TOKEN_HERE` with the `OPENCLAW_WEBHOOK_TOKEN` from `/root/trendclaw-secrets.env`.

### Set OpenAI API Key

```bash
# Add to system environment (persists across reboots)
echo 'export OPENAI_API_KEY="sk-your-openai-key-here"' >> /root/.bashrc
echo 'export OPENCLAW_GATEWAY_TOKEN="PASTE_GATEWAY_TOKEN_HERE"' >> /root/.bashrc
source /root/.bashrc
```

Replace with your actual OpenAI key and the `OPENCLAW_GATEWAY_TOKEN` from `/root/trendclaw-secrets.env`.

### Start OpenClaw with pm2

```bash
cd /opt/trendclaw/openclaw
pm2 start pnpm --name openclaw -- start -- gateway --port 18789
pm2 save
```

### Verify

```bash
# Check it's running
pm2 status

# Check logs
pm2 logs openclaw --lines 20

# Test the gateway (should get a WebSocket upgrade or connection response)
curl -s http://localhost:18789/ || echo "Gateway is WebSocket-only, this is expected"
```

---

## Step 5: Set Up the Backend

```bash
cd /opt/trendclaw/backend
npm install
```

### Create the production `.env`

```bash
# Use the secrets from /root/trendclaw-secrets.env
cat > /opt/trendclaw/backend/.env <<'EOF'
DATABASE_URL="postgresql://postgres:PASTE_POSTGRES_PASSWORD@localhost:5433/trendclaw?schema=public"
JWT_SECRET="PASTE_JWT_SECRET"
OPENCLAW_GATEWAY_URL="ws://localhost:18789"
OPENCLAW_WEBHOOK_TOKEN="PASTE_WEBHOOK_TOKEN"
BACKEND_URL="http://localhost:4000"
PORT=4000
CORS_ORIGIN="http://DROPLET_IP"
EOF
```

Replace the `PASTE_*` values from `/root/trendclaw-secrets.env`.
Set `CORS_ORIGIN` to your droplet IP for now (will change to domain later).

### Push the database schema

```bash
cd /opt/trendclaw/backend
npx prisma db push
```

### Build and start

```bash
npm run build
pm2 start npm --name trendclaw-backend -- start
pm2 save
```

### Verify

```bash
# Check it's running
pm2 status

# Test the API
curl -s http://localhost:4000/api/auth/me
# Should return 401 (unauthorized) — that means it's working

# Check logs
pm2 logs trendclaw-backend --lines 20
```

---

## Step 6: Install Caddy (Reverse Proxy + Auto-SSL)

When you get a domain later, Caddy gives you automatic HTTPS. For now, we'll use it as a simple reverse proxy.

```bash
# Install Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y caddy
```

### Configure Caddy (IP-only for now)

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
    reverse_proxy localhost:4000
}
EOF

systemctl restart caddy
```

### Test from your local machine

```bash
curl http://<DROPLET_IP>/api/auth/me
# Should return 401 — backend is reachable!
```

### Later: Add a domain

When you have a domain, update the Caddyfile:

```
api.yourdomain.com {
    reverse_proxy localhost:4000
}
```

Caddy will auto-provision SSL certificates.

---

## Step 7: Set pm2 to Start on Boot

```bash
pm2 startup
# Run the command it outputs
pm2 save
```

---

## Step 8: Update Frontend (Vercel)

In your Vercel project settings, set:

```
NEXT_PUBLIC_API_URL=http://<DROPLET_IP>
```

(Change to `https://api.yourdomain.com` once you have a domain + SSL)

---

## Quick Reference

| Service | Port | Access |
|---------|------|--------|
| Backend API | 4000 | Via Caddy on :80/:443 |
| OpenClaw Gateway | 18789 | localhost only |
| PostgreSQL | 5433 | localhost only |
| Caddy | 80/443 | Public |

### Useful Commands

```bash
# Check all services
pm2 status

# View logs
pm2 logs openclaw
pm2 logs trendclaw-backend

# Restart services
pm2 restart openclaw
pm2 restart trendclaw-backend

# Check Postgres
docker logs trendclaw-postgres

# Pull latest code and redeploy
cd /opt/trendclaw && git pull
cd openclaw && pnpm install && pnpm build && pm2 restart openclaw
cd ../backend && npm install && npm run build && npx prisma db push && pm2 restart trendclaw-backend
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend can't connect to OpenClaw | `pm2 logs openclaw` — is it running? Port 18789? |
| Webhook not working | Check `OPENCLAW_WEBHOOK_TOKEN` matches in both `backend/.env` and `~/.openclaw/openclaw.json` |
| Database connection failed | `docker ps` — is postgres running? Check `DATABASE_URL` password |
| Frontend can't reach backend | Check `CORS_ORIGIN` in backend `.env`, check Caddy is running |
| OpenClaw agent fails | Check `OPENAI_API_KEY` is set: `echo $OPENAI_API_KEY` |
