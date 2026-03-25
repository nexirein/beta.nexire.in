# NEXIRE — Deployment Guide
# Owner: nexire-docs
# Last updated: 2026-03-06

---

## Hosting Platform

Nexire is deployed on **Vercel Pro** with the following setup:
- **Framework**: Next.js 14 (App Router)
- **Region**: `sin1` (Singapore) — closest to Indian user base
- **Cron jobs**: Vercel cron (via `vercel.json`)

---

## Production Checklist

Before any production deploy:

- [ ] `npm run build` passes locally with zero errors
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] All env vars set in Vercel dashboard
- [ ] Supabase migrations applied to production DB (`supabase db push --linked`)
- [ ] Razorpay webhook URL updated if URL changed
- [ ] Resend sending domain verified

---

## Vercel Setup

### 1. Link project
```bash
npm i -g vercel
vercel link
```

### 2. Set environment variables
Set all variables from `.env.example` in:
**Vercel Dashboard → Project → Settings → Environment Variables**

Critical variables for each environment:

| Variable | Local | Preview | Production |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | dev project | staging project | prod project |
| `SUPABASE_SERVICE_ROLE_KEY` | dev key | staging key | prod key |
| `RAZORPAY_KEY_ID` | `rzp_test_*` | `rzp_test_*` | `rzp_live_*` |
| `NEXT_PUBLIC_APP_URL` | localhost:3000 | preview URL | nexire.in |

### 3. Deploy
```bash
vercel --prod         # deploy to production
vercel               # deploy to preview
```

---

## Cron Jobs

Defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reset-credits",
      "schedule": "0 0 1 * *"
    },
    {
      "path": "/api/cron/sequence-runner",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Each cron route validates `Authorization: Bearer ${CRON_SECRET}` header.

---

## Supabase Production Setup

```bash
# Link to production project
supabase link --project-ref your-prod-project-ref

# Apply pending migrations
supabase db push

# Verify RLS is enabled on all tables
supabase db inspect
```

### Required Supabase Auth settings
- Google OAuth: add production redirect URL `https://nexire.in/auth/callback`
- Email: configure custom SMTP with Resend (Settings → Auth → SMTP)

---

## Cloudflare WAF Rules

Set up 5 WAF rules on the `nexire.in` domain:

| Rule | Path | Limit |
|---|---|---|
| Search rate limit | `/api/search*` | 30 req/min per IP |
| Reveal rate limit | `/api/reveal*` | 20 req/min per IP |
| Billing protection | `/api/billing*` | 5 req/min per IP |
| Auth protection | `/api/auth*` | 10 req/min per IP |
| Global DDoS | `/*` | Cloudflare managed |

---

## Domain Configuration

| Record | Type | Value |
|---|---|---|
| `nexire.in` | A/CNAME | Vercel |
| `www.nexire.in` | CNAME | `nexire.in` |
| `app.nexire.in` | (optional) | Vercel alias |

---

## Monitoring

| Tool | What it tracks |
|---|---|
| PostHog | User events, funnel analytics |
| Sentry | Runtime errors, API failures |
| Vercel Analytics | Core Web Vitals, page performance |
| Upstash console | Redis usage, rate limit hits |
| Supabase dashboard | DB performance, slow queries |
