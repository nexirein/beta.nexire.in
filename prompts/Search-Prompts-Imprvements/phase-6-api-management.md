# Phase 6 — API Management, Rate Limiting & Multi-Account Admin Panel
> Prepend MASTER_CONTEXT.md before running this prompt.

## Goal
Build the admin panel for managing multiple Prospeo API accounts, rate limiting,
credit monitoring, and automatic account rotation to serve 100+ paid users without hitting limits.

---

## 6.1 — The Problem This Solves

Prospeo rate limit: 15 requests/second per API key.
Target: 100 paid users + 3000 trial users.
Peak load estimate: 50 concurrent searches = 50 req/s needed.
Solution: Pool multiple Prospeo API accounts, round-robin requests across them.

---

## 6.2 — Admin Panel Page

Create `app/(dashboard)/admin/page.tsx` (requires role: ADMIN).

### Sections:

#### API Accounts Management
Table with columns:
```
Label | Status | Priority | Credits Remaining | Daily Requests | Last Used | Actions
```
- Status: Active (green dot) | Rate Limited (orange dot) | Inactive (zinc dot)
- Priority: drag-to-reorder OR numeric input
- Credits Remaining: number, red if < 100, yellow if < 500
- Daily Requests: counter reset at midnight IST
- Actions: Edit (rename, update key) | Deactivate | Delete

**"Add API Account" button:**
Opens modal with:
- Label input: "Account 1", "Account 2", etc.
- API Key input (masked, password type)
- Priority input (1 = highest priority)
- "Test Key" button → calls Prospeo API with the key to validate
On save: encrypts key with AES-256 using ENCRYPTION_SECRET, stores in DB

#### Rate Limit Configuration
- **Global requests per second**: number input (default: 14 — 1 below Prospeo limit as buffer)
- **Max concurrent searches**: number input (default: 20)
- **Cool-down period**: how many seconds to wait before retrying a rate-limited account (default: 60)
- **Rotation strategy**: radio buttons → Round Robin | Least Used | Priority First
- Save button → writes to AdminConfig table

#### System Status Dashboard
Real-time stats (auto-refresh every 30s):
- Total API accounts: X active, Y inactive
- Current requests/second: live Redis counter
- Total searches today: count from DB
- Credits used today: sum across all accounts
- Accounts currently rate-limited: list with time remaining

#### Credit Alerts
- Alert threshold input: "Send alert when any account drops below X credits"
- Alert method: email (input email addresses, comma-separated) — future, mark as coming soon

---

## 6.3 — Rate Limiting Middleware

Create `lib/prospeo/rate-limiter.ts`:

Uses Redis sliding window algorithm:
1. Before each Prospeo API call, check:
   - `RATE_LIMIT:account:{accountId}:second` counter
   - If counter >= configured limit (default 14) → mark account as rate-limited, rotate to next account
2. After each call, increment counter with TTL 1s
3. Also track per-minute: `RATE_LIMIT:account:{accountId}:minute` with TTL 60s
4. Expose `checkAndReserve(accountId)` → returns true if slot available, false if rate-limited
5. Expose `releaseSlot(accountId)` → called after request completes

---

## 6.4 — Account Rotation Algorithm

In `lib/prospeo/account-manager.ts` (extends Phase 0):

```typescript
async function getNextAccount(workspaceId: string): Promise<ApiAccount> {
  // 1. Get all active accounts for workspace, sorted by priority ASC
  // 2. Filter out accounts with Redis block key set
  // 3. If rotation strategy = "Round Robin": pick account by (lastUsed index + 1) % total
  // 4. If rotation strategy = "Least Used": pick account with lowest dailyRequestCount
  // 5. If rotation strategy = "Priority First": pick highest priority account that's not blocked
  // 6. If ALL accounts are blocked: throw NoAccountAvailableError with retry-after seconds
  // 7. Reserve a slot in rate limiter for chosen account
  // 8. Return account (with decrypted API key for this request only)
}
```

On `INSUFFICIENT_CREDITS` error from Prospeo:
- Mark account as inactive (set isActive=false in DB)
- Log to console + AdminConfig error log
- Rotate to next account
- Retry the original request once

On `RATE_LIMITED` error from Prospeo:
- Set Redis block key for 60 seconds
- Rotate to next account immediately
- Retry the original request once

---

## 6.5 — API Account CRUD Routes

Create these API routes (admin only — middleware check role=ADMIN):

### GET /api/admin/accounts
Returns all API accounts for workspace (with decrypted keys masked as `****{last4}`).

### POST /api/admin/accounts
Body: `{ label, apiKey, priority }`
Encrypt key, create ApiAccount record. Test key validity before saving.

### PATCH /api/admin/accounts/[accountId]
Body: `{ label?, priority?, isActive? }`
Update account. If apiKey is in body, re-encrypt and update.

### DELETE /api/admin/accounts/[accountId]
Hard delete. Warn if account has been used in searches (show count).

### POST /api/admin/accounts/[accountId]/test
Calls Prospeo with the stored key (simple search with minimal filters).
Returns: `{ valid: bool, creditsRemaining: int, rateLimitStatus: string }`

### GET /api/admin/stats
Returns system status data (for dashboard).

---

## 6.6 — Credit Sync Job

Create `lib/jobs/sync-credits.ts`:
- Runs every 5 minutes (use `setInterval` on server startup OR Vercel Cron if deployed on Vercel)
- For each active ApiAccount: calls Prospeo account info endpoint to get real credit count
- Updates `creditsRemaining` in DB and Redis cache `ACCOUNT_CREDITS:{accountId}`
- Logs any accounts with < 100 credits to console

---

## Deliverable Checklist
- [ ] Admin panel page accessible only to ADMIN role
- [ ] API accounts table with all columns
- [ ] Add account modal with key encryption + test functionality
- [ ] Rate limit configuration saves to AdminConfig
- [ ] System status dashboard with real data
- [ ] Rate limiting middleware with Redis sliding window
- [ ] Account rotation algorithm (all 3 strategies)
- [ ] Auto-rotation on RATE_LIMITED and INSUFFICIENT_CREDITS errors
- [ ] All 5 admin API routes
- [ ] Credit sync job running every 5 minutes
- [ ] Priority drag-to-reorder in accounts table
