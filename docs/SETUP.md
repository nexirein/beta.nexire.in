# NEXIRE — Local Development Setup
# Owner: nexire-docs
# Last updated: 2026-03-06

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18.x or 20.x LTS | [nodejs.org](https://nodejs.org) |
| npm | 9+ (comes with Node) | — |
| Supabase CLI | latest | `brew install supabase/tap/supabase` |
| Git | any recent | — |

---

## 1. Clone and Install

```bash
git clone <your-repo-url> nexire
cd nexire
npm install
```

---

## 2. Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in every value. See `.env.example` for descriptions.

**Required before local dev works:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROSPEO_API_KEY`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

**Required for billing to work:**
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`

**Required for email to work:**
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL`

---

## 3. Supabase Setup

### Option A — Supabase Cloud (recommended for first setup)
1. Create a project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API → copy your URL and keys into `.env.local`
3. Run migrations:
```bash
supabase db push
```

### Option B — Local Supabase
```bash
supabase start
# Copy the printed URLs and keys into .env.local
supabase db push
```

---

## 4. Run Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 5. Available Scripts

```bash
npm run dev          # Start local dev server (Next.js)
npm run build        # Production build (validates all TypeScript)
npm run start        # Run production build locally
npm run lint         # ESLint check
npm run typecheck    # TypeScript type check (tsc --noEmit)
npm run test         # Run unit tests (Vitest)
npm run test:e2e     # Run end-to-end tests (Playwright)
```

> **Tip:** Run `npm run typecheck` before any commit. It catches errors that ESLint doesn't.

---

## 6. Project Structure

```
nexire-app/
├── app/
│   ├── (auth)/         ← Auth pages (login, onboarding)
│   ├── (app)/          ← Protected app pages
│   ├── api/            ← API routes (Next.js route handlers)
│   └── share/          ← Public client-view pages
├── components/         ← Shared UI components
├── lib/
│   ├── credits/        ← engine.ts — SOLE credit logic
│   ├── prospeo/        ← client.ts — SOLE Prospeo API caller
│   ├── redis/          ← Rate limiters + cache helpers
│   └── supabase/       ← Server + browser clients, query helpers
├── types/              ← TypeScript type definitions
├── supabase/
│   ├── migrations/     ← Ordered SQL migrations
│   └── seed.sql        ← Dev seed data
├── prompts/            ← Agent task prompt files (M01–M11)
├── docs/               ← Technical documentation
├── _meta/              ← Architecture docs, build log
└── .claude/agents/     ← Claude sub-agent definitions
```

---

## 7. Tunnel for Webhook Testing (Razorpay / Resend)

```bash
# Using ngrok
ngrok http 3000

# Update NEXT_PUBLIC_APP_URL in .env.local to your ngrok URL
# Update Razorpay webhook URL in dashboard to: https://<ngrok>.ngrok.io/api/billing/webhook
```

---

## Common Issues

| Problem | Fix |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` missing | Check `.env.local` — this key is never in Next_PUBLIC |
| Hydration errors on dark mode | Clear `.next/` and `npm run dev` |
| Redis connection refused | Check `UPSTASH_REDIS_REST_URL` — must be full https URL |
| Razorpay 400 on webhook | Verify `RAZORPAY_WEBHOOK_SECRET` matches dashboard value |
