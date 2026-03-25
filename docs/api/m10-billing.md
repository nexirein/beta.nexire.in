# M10 — Billing API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M10 build

---

## Routes

### GET /api/billing/plans
Return available plans and current org plan.

---

### POST /api/billing/subscribe
Initiate a Razorpay subscription.

**Request**
```json
{ "plan": "solo | growth | custom" }
```
**Response**: `{ "data": { "razorpay_subscription_id": "string", "checkout_url": "string" } }`

---

### POST /api/billing/topup
Purchase a credit top-up pack.

**Request**
```json
{ "pack": 50 | 100 | 200 }
```

---

### POST /api/billing/webhook
Razorpay webhook handler (POST — no auth, but verifies `x-razorpay-signature` header).

Handles events:
- `subscription.activated` → update org plan
- `subscription.cancelled` → downgrade org
- `payment.captured` → add credits for top-up
- `payment.failed` → log and notify

---

### GET /api/billing/usage
Return credit usage for the current billing cycle.

---

### Cron: /api/cron/reset-credits
Runs on 1st of each month. Grants monthly credits + handles rollover.
Validates `Authorization: Bearer ${CRON_SECRET}`.

---

## Plans

| Plan | Credits/mo | Seats | Price |
|---|---|---|---|
| Free | 50 | 1 | ₹0 |
| Solo | 200 | 1 | TBD |
| Growth | 600 | 5 | TBD |
| Custom | TBD | unlimited | TBD |
