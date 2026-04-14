# ⚡ SupportBot — AI Customer Support as a Service

A production-ready SaaS platform that lets you sell AI-powered customer support chatbots to businesses.
Clients embed a single JS snippet, you collect monthly subscriptions — fully automated.

---

## Architecture Overview

```
supportbot/
├── backend/          # Python + FastAPI (the API server)
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── config.py         # Environment variables
│   │   ├── database.py       # Async SQLAlchemy + pgvector
│   │   ├── models.py         # All DB models
│   │   ├── rag_engine.py     # Core AI logic (retrieve + generate)
│   │   ├── ingestion.py      # PDF/URL → chunks → embeddings
│   │   ├── auth.py           # JWT auth helpers
│   │   └── routers/
│   │       ├── auth.py       # Register / login
│   │       ├── chat.py       # Public chat endpoint (widget calls this)
│   │       ├── ingest.py     # Upload docs / crawl URLs
│   │       ├── clients.py    # Dashboard data + embed code
│   │       └── billing.py    # Stripe checkout + webhooks
│   ├── scripts/
│   │   └── reset_monthly_usage.py  # Cron: resets chat counts monthly
│   ├── alembic/              # DB migrations
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── widget/
│   └── widget.js             # Embeddable chat widget (zero dependencies)
├── dashboard/                # React client portal
│   ├── src/
│   │   ├── App.jsx           # Full dashboard (auth + tabs)
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── landing/
│   └── index.html            # Marketing landing page
└── docker-compose.yml        # Local dev setup
```

---

## Local Development Setup

### Prerequisites
- Docker + Docker Compose
- An Anthropic API key (console.anthropic.com)
- A Stripe account (stripe.com)
- A Supabase project (supabase.com) — free tier works

### Step 1 — Clone and configure

```bash
cd supportbot/backend
cp .env.example .env
# Fill in your .env values (see below)
```

### Step 2 — Fill in .env

```
ANTHROPIC_API_KEY=sk-ant-...          # From console.anthropic.com
SUPABASE_URL=https://xxx.supabase.co  # From Supabase dashboard
SUPABASE_KEY=eyJ...                    # Supabase anon key
DATABASE_URL=postgresql://...          # Supabase connection string
STRIPE_SECRET_KEY=sk_live_...          # From Stripe dashboard
STRIPE_WEBHOOK_SECRET=whsec_...        # After setting up webhook (see below)
STRIPE_PRICE_ID_STARTER=price_...      # Create in Stripe Products
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...
JWT_SECRET=<run: openssl rand -hex 32>
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

### Step 3 — Start everything

```bash
docker-compose up
```

This starts:
- **PostgreSQL + pgvector** on port 5432
- **FastAPI backend** on port 8000 (with hot reload)
- **React dashboard** on port 3000

### Step 4 — Run DB migrations

```bash
docker-compose exec api alembic upgrade head
```

---

## Stripe Setup

### Create products in Stripe
1. Go to Stripe Dashboard → Products → Add Product
2. Create three products: Starter (€99), Pro (€299), Enterprise (€599)
3. Set billing to "Recurring" monthly
4. Copy each Price ID into your .env

### Set up webhook
1. Stripe Dashboard → Webhooks → Add Endpoint
2. URL: `https://your-api-domain.com/billing/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

For local testing, use the Stripe CLI:
```bash
stripe listen --forward-to localhost:8000/billing/webhook
```

---

## Production Deployment

### Backend → Railway (recommended)

1. Create a new Railway project
2. Connect your GitHub repo
3. Set the root directory to `/backend`
4. Add all environment variables from .env
5. Railway auto-detects the Dockerfile and deploys

```bash
# Or deploy via Railway CLI
railway login
railway init
railway up
```

### Database → Supabase

1. Create a new Supabase project
2. Go to Settings → Database → Connection String
3. Enable pgvector: SQL Editor → `CREATE EXTENSION vector;`
4. Use the connection string in DATABASE_URL

### Dashboard → Vercel

```bash
cd dashboard
npm install
vercel deploy
```

Set `VITE_API_URL` environment variable in Vercel to your Railway API URL.

### Widget → Served from your API

The widget.js is served statically from your API. Add this to main.py:

```python
from fastapi.staticfiles import StaticFiles
app.mount("/widget.js", StaticFiles(directory="../widget"), name="widget")
```

### Landing Page → Vercel or Netlify

Just drop `landing/index.html` into any static host.

---

## Monthly Cron Job

Reset chat counts on the 1st of every month.

**Railway cron:**
- Go to your Railway project → Add cron job
- Command: `python -m scripts.reset_monthly_usage`
- Schedule: `0 0 1 * *`

---

## How the widget embed works

Clients paste this on their site:
```html
<script
  src="https://your-api.railway.app/widget.js"
  data-client-id="THEIR_CLIENT_UUID"
  data-color="#2563EB"
  data-name="Support"
  data-position="right"
></script>
```

The widget calls `POST /chat/{client_id}` with each message.
If the client's subscription is inactive → bot is automatically disabled.

---

## Revenue Model

| Plan       | Price   | Chat Limit  | Target customer              |
|------------|---------|-------------|------------------------------|
| Starter    | €99/mo  | 500/mo      | Small e-commerce, freelancers |
| Pro        | €299/mo | 2,000/mo    | Growing SaaS, agencies        |
| Enterprise | €599/mo | Unlimited   | High-traffic businesses       |

**10 clients = €990–€2,990/mo recurring, zero marginal effort.**

---

## Customer Acquisition

### Cold outreach (weeks 1–4)
- Target: Shopify stores, SaaS products, local service businesses
- Tool: Apollo.io or Hunter.io for leads
- Message: Offer a free 14-day trial, no setup needed

### SEO landing pages (month 2+)
Create niche pages targeting searches like:
- "AI chatbot for dentists"
- "automated customer support for Shopify"
- "24/7 support bot small business"

### Agency partnerships
Offer web agencies 20% recurring commission to resell SupportBot to their clients.
One agency with 20 clients = €2,000+/mo passive from a single partner.

---

## Security Checklist (before going live)

- [ ] Rotate JWT_SECRET to a strong random value
- [ ] Switch Stripe to live keys (not test keys)
- [ ] Set CORS origins to specific domains (not `*`)
- [ ] Enable HTTPS on all endpoints
- [ ] Set up database backups in Supabase
- [ ] Configure rate limiting on the chat endpoint
- [ ] Add monitoring (Railway provides basic metrics; add Sentry for errors)
