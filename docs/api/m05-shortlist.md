# M05 — Shortlist API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M05 build

---

## Routes

### GET /api/shortlist/:project_id
Get all shortlisted candidates for a project.

---

### POST /api/shortlist
Add a candidate to project shortlist.

**Request**
```json
{ "project_id": "uuid", "candidate_id": "uuid" }
```

---

### PATCH /api/shortlist/:entry_id
Update shortlist status or notes.

**Request**
```json
{
  "status": "new | screening | interview | offer | rejected",
  "notes": "string?",
  "ctc_lpa": 12.5
}
```

---

### DELETE /api/shortlist/:entry_id
Remove a candidate from the shortlist.

---

## Types

```typescript
type ShortlistEntry = {
  id: string
  org_id: string
  project_id: string
  candidate_id: string
  status: 'new' | 'screening' | 'interview' | 'offer' | 'rejected'
  notes?: string
  ctc_lpa?: number   // recruiter-filled CTC estimate in LPA
  candidate: Candidate
}
```
