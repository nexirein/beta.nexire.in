# M04 — Candidate Reveal API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M04 build

---

## Routes

### POST /api/reveal/email
Reveal email for a candidate. Costs 1 Nexire credit.

**Request**
```json
{ "candidate_id": "uuid", "person_id": "string" }
```
**Response**
```json
{ "data": { "email": "string", "status": "verified | unverified", "credits_remaining": 0 } }
```

**Note**: Re-enriching an already-revealed email is FREE (Prospeo re-enrich is free).

---

### POST /api/reveal/phone
Reveal phone number. Costs 8 Nexire credits.

**Request**
```json
{ "candidate_id": "uuid", "person_id": "string" }
```
**Response**
```json
{ "data": { "phone": "string", "whatsapp_link": "string", "credits_remaining": 0 } }
```

---

## Credit Logic
- All credit deductions go through `lib/credits/engine.ts`
- Never write credit logic in route handler directly
- Always check credit balance BEFORE calling Prospeo
- If Prospeo call fails, do NOT deduct credits (roll back)

---

## Types
```typescript
type RevealResult = {
  email?: string
  phone?: string
  status: 'verified' | 'unverified'
  credits_remaining: number
  whatsapp_link?: string  // generated only for phone reveals
}
```
