# TrendClaw — Architecture & Implementation Plan

## Context

TrendClaw is a multi-tenant SaaS monitoring platform built on top of OpenClaw. It monitors a user's client list for buying signals (new executives, funding, hiring spikes, product launches) and trending topics by scraping their LinkedIn and social media pages, then generates daily actionable reports with outreach and content suggestions.

**Key decisions:**
- OpenClaw powers the AI engine (cron scheduling, LLM via OpenAI, web search agent)
- **Three-tier architecture**: Next.js frontend (Vercel) + Express backend API + OpenClaw engine (both on Digital Ocean droplet)
- PostgreSQL for multi-tenant data (on the droplet)
- Dashboard-only delivery for MVP
- **Monitoring sources**: Company LinkedIn pages + social media pages (Twitter/X, etc.)

---

## Architecture Overview

```
trendclaw-app/
  ├── openclaw/          ← AI engine (cron, search, LLM) — runs on DO droplet
  ├── frontend/          ← Next.js app (dashboard UI) — deployed to Vercel
  └── backend/           ← Express API server + DB — runs on DO droplet
```

```
┌──────────────────────┐
│  Next.js (Vercel)    │
│  Dashboard UI        │
│  - Auth pages        │
│  - Client management │
│  - Report viewer     │
│  - Signal feed       │
└─────────┬────────────┘
          │ HTTP (REST API)
          v
┌─────────────────────────────────────────────┐
│  Digital Ocean Droplet                      │
│                                             │
│  ┌─────────────────────┐  ┌──────────────┐ │
│  │ Express Backend API │  │ OpenClaw     │ │
│  │ - Auth (JWT)        │  │ (Docker)     │ │
│  │ - Client CRUD       │  │ - Cron       │ │
│  │ - Signal ingestion  │  │ - AI Agent   │ │
│  │ - Report generation │  │ - Web Search │ │
│  │ - Webhook receiver  │  │ - LLM Task   │ │
│  └────────┬────────────┘  └──────────────┘ │
│           │ Prisma                          │
│           v                                 │
│  ┌──────────────┐                           │
│  │ PostgreSQL   │                           │
│  │ tenants      │                           │
│  │ clients      │                           │
│  │ signals      │                           │
│  │ reports      │                           │
│  └──────────────┘                           │
└─────────────────────────────────────────────┘
```

### How the Three Parts Connect

There are only **2 connection points** — the frontend never talks to OpenClaw:

```
                         HTTPS
  Vercel (frontend) ───────────────▶ DO Droplet (:4000 backend)
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                     WebSocket       HTTP webhook         │
                     (cron.add,      (job results)        │
                      cron.remove)        │               │
                          │               │               │
                          ▼               │               │
                     OpenClaw (:18789) ────┘          PostgreSQL
                          │
                     runs AI agent
                     searches social
                     returns JSON signals
```

1. **Backend → OpenClaw (WebSocket on :18789)**: Backend creates/removes cron jobs
2. **OpenClaw → Backend (HTTP POST to :4000)**: OpenClaw sends job results via webhook

Both live on the same droplet so they communicate over `localhost`.

See `OPENCLAW-SETUP.md` for detailed setup instructions.

### How Multi-Tenancy Works with Single-User OpenClaw

OpenClaw stays as-is (single instance). The backend API acts as an orchestration layer:
- Creates per-client cron jobs in OpenClaw via gateway API (`cron.add`)
- Each job's `message` prompt embeds tenant/client context
- Job `name` follows convention: `tc:{tenantId}:{clientId}:{jobType}`
- Results POST back via webhook → backend API route → stored in PostgreSQL under correct tenant

---

## Monitoring Pipeline (Step-by-Step)

### 1. User adds a client
- `POST /api/clients` → insert into PostgreSQL
- Backend calls OpenClaw `cron.add` with monitoring prompt + webhook delivery
- First scan runs immediately (`wakeMode: "now"`)

### 2. Cron fires (every 12h per client)
- OpenClaw creates isolated agent session
- Agent scrapes/searches the client's LinkedIn page, Twitter/X, and other social media pages
- Agent outputs structured JSON signals via `llm-task` tool
- OpenClaw POSTs result to backend webhook endpoint

### 3. Webhook receives signals
- Parse `jobId` → look up tenant/client from `monitoring_jobs` table
- Extract signals from `summary` field (JSON)
- Store in `signals` table

### 4. Daily report generation (9 AM per tenant)
- Cron job triggers, or backend endpoint `/api/reports/generate` called
- Query today's signals from PostgreSQL
- Send to OpenClaw agent for synthesis (outreach suggestions, content ideas)
- Store structured report in `reports` table

---

## Database Schema (PostgreSQL via Prisma)

| Table | Purpose |
|-------|---------|
| `tenants` | Organizations (id, name, slug, plan, max_clients) |
| `users` | Auth users linked to tenant (email, role) |
| `clients` | Monitored companies (name, domain, LinkedIn, social URLs, keywords, cron_job_id) |
| `content_niches` | Topic areas to monitor (keywords, sources, cron_job_id) |
| `signals` | Detected buying signals (type, title, summary, source_url, confidence) |
| `reports` | Daily aggregated reports (date, status, structured content as JSONB) |
| `report_signals` | Links signals to report sections |
| `monitoring_jobs` | Maps OpenClaw cron job IDs to tenants/targets |

Signal types: `executive_change`, `funding`, `hiring`, `product_launch`, `expansion`, `partnership`, `trending_topic`

### Full SQL Schema

```sql
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'free',
  max_clients   INT NOT NULL DEFAULT 10,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'member',
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  domain        TEXT,
  description   TEXT,
  linkedin_url  TEXT,
  twitter_url   TEXT,
  facebook_url  TEXT,
  instagram_url TEXT,
  custom_urls   JSONB DEFAULT '[]',
  industry      TEXT,
  keywords      TEXT[] DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  cron_job_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE content_niches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  keywords      TEXT[] NOT NULL,
  sources       TEXT[] DEFAULT '{}',
  cron_job_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  niche_id      UUID REFERENCES content_niches(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  source_url    TEXT,
  source_name   TEXT,
  confidence    REAL NOT NULL DEFAULT 0.5,
  raw_data      JSONB,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  report_date   DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  content       JSONB,
  signal_count  INT NOT NULL DEFAULT 0,
  cron_job_id   TEXT,
  generated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_signals (
  report_id     UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  signal_id     UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  section       TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (report_id, signal_id)
);

CREATE TABLE monitoring_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cron_job_id   TEXT NOT NULL UNIQUE,
  job_type      TEXT NOT NULL,
  target_id     UUID,
  schedule      TEXT NOT NULL,
  last_run_at   TIMESTAMPTZ,
  last_status   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_tenant ON clients(tenant_id);
CREATE INDEX idx_signals_tenant ON signals(tenant_id);
CREATE INDEX idx_signals_client ON signals(client_id);
CREATE INDEX idx_signals_detected ON signals(detected_at);
CREATE INDEX idx_reports_tenant_date ON reports(tenant_id, report_date);
CREATE INDEX idx_monitoring_jobs_tenant ON monitoring_jobs(tenant_id);
CREATE INDEX idx_monitoring_jobs_cron ON monitoring_jobs(cron_job_id);
```

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Frontend | Next.js 14+ (App Router) | SSR dashboard, deployed to Vercel |
| Styling | Tailwind + shadcn/ui | Fast dashboard prototyping |
| Backend API | Express.js + TypeScript | Lightweight REST API on DO droplet |
| Database | PostgreSQL (on droplet) | Relational multi-tenant data, JSONB for reports, co-located with backend |
| ORM | Prisma | Type-safe, easy migrations |
| Auth | JWT (issued by backend) | Stateless, tenant-aware tokens |
| AI Engine | OpenClaw | Cron, LLM task runner, web search — already built |
| LLM | OpenAI (via OpenClaw) | User preference |
| Deployment | Vercel (frontend) + Digital Ocean droplet (backend + OpenClaw + Postgres) | Frontend on CDN edge, everything else co-located on droplet |

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/login`, `/register` | Auth + tenant creation |
| `/` (dashboard) | Stats overview, recent signals, next report time |
| `/clients` | Client list with add/edit/delete |
| `/clients/[id]` | Client detail, recent signals, monitoring status |
| `/clients/new` | Add client form (name, website, LinkedIn URL, social pages, keywords) |
| `/niches` | Content niche management |
| `/reports` | Report list by date |
| `/reports/[id]` | Full report: buying signals, trends, content ideas, outreach drafts |
| `/signals` | Filterable signal feed (by type, client, date) |
| `/settings` | Tenant settings, plan, team |

---

## Backend API Routes (Express)

```
POST   /api/auth/register          Register + create tenant
POST   /api/auth/login             Login → JWT
GET    /api/auth/me                Current user + tenant

GET    /api/clients                List clients (tenant-scoped)
POST   /api/clients                Create client + provision OpenClaw cron
GET    /api/clients/:id            Get client details
PATCH  /api/clients/:id            Update client
DELETE /api/clients/:id            Delete client + deprovision cron

GET    /api/niches                 List content niches
POST   /api/niches                 Create niche
PATCH  /api/niches/:id             Update niche
DELETE /api/niches/:id             Delete niche

GET    /api/signals                List signals (filterable by type, client, date)
GET    /api/reports                List reports by date
GET    /api/reports/:id            Get full report
POST   /api/reports/generate       Manual report trigger

GET    /api/dashboard/stats        Aggregate metrics

POST   /api/webhooks/openclaw      Webhook receiver (from OpenClaw cron)
```

---

## Key OpenClaw Integration Points

| File | Purpose |
|------|---------|
| `openclaw/src/cron/types.ts` | CronJob, CronJobCreate, CronSchedule types |
| `openclaw/src/gateway/server-methods/cron.ts` | Gateway API: cron.add/update/remove/run |
| `openclaw/src/gateway/server-cron.ts:235-265` | Webhook POST logic (sends full event JSON with Bearer auth) |
| `openclaw/extensions/llm-task/src/llm-task-tool.ts` | Structured JSON LLM output with schema validation |

### Webhook Payload Shape (from OpenClaw → TrendClaw)

```json
{
  "action": "finished",
  "jobId": "...",
  "status": "ok",
  "summary": "<agent JSON output>",
  "sessionId": "...",
  "sessionKey": "...",
  "durationMs": 12345,
  "model": "gpt-4o",
  "provider": "openai"
}
```

Auth: `Authorization: Bearer <cron.webhookToken>`

---

## File Structure

### Backend (`backend/`)

```
backend/
  package.json
  tsconfig.json
  Dockerfile
  prisma/
    schema.prisma
  src/
    index.ts               — Express app entry point
    config.ts              — Env vars, constants
    middleware/
      auth.ts              — JWT verification + tenant extraction
      error.ts             — Error handler
    routes/
      auth.ts              — Register, login, me
      clients.ts           — CRUD + cron provisioning
      niches.ts            — CRUD
      signals.ts           — List/filter
      reports.ts           — List, detail, generate
      dashboard.ts         — Stats
      webhooks.ts          — OpenClaw webhook receiver
    lib/
      db.ts                — Prisma singleton
      jwt.ts               — Token sign/verify
      openclaw/
        client.ts          — Gateway WebSocket client wrapper
        prompts.ts         — Monitoring prompt templates
        schemas.ts         — JSON schemas for signal output
        sync.ts            — Cron job provisioning/deprovisioning
    types/index.ts
```

### Frontend (`frontend/`)

```
frontend/
  package.json
  next.config.ts
  tailwind.config.ts
  src/
    app/
      layout.tsx
      (auth)/login/page.tsx, register/page.tsx
      (dashboard)/
        layout.tsx (sidebar)
        page.tsx (dashboard home)
        clients/page.tsx, [id]/page.tsx, new/page.tsx
        niches/page.tsx, new/page.tsx
        reports/page.tsx, [id]/page.tsx
        signals/page.tsx
        settings/page.tsx
    lib/
      api.ts               — Backend API client (fetch wrapper with JWT)
      auth.ts              — Auth context, token storage
    components/
      ui/                  — shadcn/ui
      layout/sidebar.tsx, top-nav.tsx
      dashboard/stats-cards.tsx, recent-signals.tsx
      clients/client-card.tsx, client-form.tsx
      signals/signal-card.tsx, signal-filter.tsx, signal-type-badge.tsx
      reports/report-viewer.tsx, report-section.tsx, outreach-suggestion.tsx
    hooks/
      use-clients.ts, use-signals.ts, use-reports.ts
    types/index.ts
```

---

## Implementation Order

1. Scaffold backend: Express + TypeScript + Prisma in `backend/`
2. Database: Create Prisma schema, run migrations on local Postgres
3. Auth: JWT-based register/login with tenant creation
4. OpenClaw client: WebSocket wrapper in `backend/src/lib/openclaw/client.ts`
5. Client CRUD: Express routes + cron job provisioning
6. Webhook receiver: `/api/webhooks/openclaw` to ingest signals
7. Scaffold frontend: Next.js in `frontend/` with Tailwind, shadcn/ui
8. Frontend API client: Fetch wrapper with JWT auth pointing to backend
9. Frontend pages: Dashboard, client management, signal feed, report viewer
10. Monitoring prompts: Craft and test agent prompts for social media signal detection
11. Daily report job: Cron job for report synthesis
12. Content niche monitoring: Similar pipeline to client monitoring
13. Deployment: Dockerize backend + OpenClaw on DO droplet, deploy frontend to Vercel

---

## Verification

- **Cron integration**: Add a test client → verify OpenClaw creates the cron job → force-run → verify webhook receives signal data
- **End-to-end**: Register → add client → wait for scan → check signals page → trigger report → view report
- **Auth**: Verify tenant isolation (user A can't see user B's clients/signals)
- **OpenClaw health**: Dashboard should show gateway connection status
