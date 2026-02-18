#!/bin/bash
# TrendClaw Droplet Setup Script
# Run as root on a fresh Ubuntu 24.04 droplet
# Usage: ssh root@<droplet-ip> 'bash -s' < setup-droplet.sh

set -euo pipefail

echo "========================================="
echo "  TrendClaw Droplet Setup"
echo "========================================="

# --- 1. System updates ---
echo "[1/8] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# --- 2. Install Docker ---
echo "[2/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# --- 3. Install Node.js 22 (LTS) ---
echo "[3/8] Installing Node.js 22..."
if ! command -v node &> /dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# --- 4. Install pnpm and pm2 ---
echo "[4/8] Installing pnpm and pm2..."
npm install -g pnpm@latest pm2@latest

# --- 5. Install build essentials (needed for some native modules) ---
echo "[5/8] Installing build tools..."
apt-get install -y build-essential git

# --- 6. Set up firewall ---
echo "[6/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# Deny direct access to backend and OpenClaw ports from outside
ufw deny 4000/tcp
ufw deny 18789/tcp
ufw deny 5433/tcp
echo "y" | ufw enable

# --- 7. Start PostgreSQL via Docker ---
echo "[7/8] Starting PostgreSQL..."
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)

if docker ps -a --format '{{.Names}}' | grep -q '^trendclaw-postgres$'; then
  echo "  PostgreSQL container already exists, skipping..."
else
  docker run -d \
    --name trendclaw-postgres \
    --restart unless-stopped \
    -e POSTGRES_USER=postgres \
    -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
    -e POSTGRES_DB=trendclaw \
    -p 127.0.0.1:5433:5432 \
    postgres:16-alpine
  echo "  Waiting for Postgres to be ready..."
  sleep 5
fi

# --- 8. Generate secrets ---
echo "[8/8] Generating secrets..."
JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 48)
WEBHOOK_TOKEN=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 48)
GATEWAY_TOKEN=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 48)

# --- Write env file ---
cat > /root/trendclaw-secrets.env <<SECRETS
# === TrendClaw Generated Secrets ===
# Generated on $(date -u)
# KEEP THIS FILE SAFE — do not commit to git

# PostgreSQL
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5433/trendclaw?schema=public"

# Backend
JWT_SECRET="${JWT_SECRET}"
OPENCLAW_WEBHOOK_TOKEN="${WEBHOOK_TOKEN}"

# OpenClaw Gateway
OPENCLAW_GATEWAY_TOKEN="${GATEWAY_TOKEN}"
SECRETS

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "Secrets saved to: /root/trendclaw-secrets.env"
echo ""
echo "Next steps:"
echo "  1. Clone your repo:  git clone <repo-url> /opt/trendclaw"
echo "  2. Set up OpenClaw:  See instructions below"
echo "  3. Set up Backend:   See instructions below"
echo "  4. Install Caddy:    See instructions below"
echo ""
echo "--- Your generated secrets ---"
cat /root/trendclaw-secrets.env
echo ""
echo "--- IMPORTANT: Save these secrets now! ---"
