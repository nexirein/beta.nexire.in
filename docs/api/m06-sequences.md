# M06 — Email Sequences API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M06 build

---

## Routes

### GET /api/sequences
List all sequences for the org.

---

### POST /api/sequences
Create a new sequence.

**Request**
```json
{
  "project_id": "uuid",
  "name": "string",
  "steps": [
    { "delay_days": 0, "subject": "string", "body": "string" },
    { "delay_days": 3, "subject": "string", "body": "string" }
  ]
}
```

---

### POST /api/sequences/:id/enroll
Enroll candidates in a sequence.

**Request**
```json
{ "candidate_ids": ["uuid"], "mailbox_id": "uuid" }
```

---

### POST /api/sequences/:id/pause
Pause an active sequence.

---

### DELETE /api/sequences/:enrollment_id/unenroll
Remove a candidate from a sequence.

---

## Cron job: /api/cron/sequence-runner
Runs every 15 minutes. Sends pending emails for enrolled candidates.
Validates `Authorization: Bearer ${CRON_SECRET}`.

---

## Types
```typescript
type SequenceStep = {
  delay_days: number
  subject: string
  body: string        // supports {first_name}, {company}, {role} tokens
}
```
