# M07 — Client View (Shared Links) API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M07 build

---

## Routes

### POST /api/client-view
Create a shareable client view for a project.

**Request**
```json
{
  "project_id": "uuid",
  "title": "string",
  "candidate_ids": ["uuid"],
  "password": "string?",
  "expires_at": "ISO8601?"
}
```
**Response**: `{ "data": { "share_url": "https://nexire.in/share/TOKEN" } }`

---

### GET /api/client-view/:token
Get client view data (public — no auth).

**Response**: filtered candidate data (no email/phone unless already revealed and shared)

---

### POST /api/client-view/:token/verify
Verify password for password-protected view.

---

### PATCH /api/client-view/:id
Update the candidate list or title.

---

### DELETE /api/client-view/:id
Delete (deactivate) a shared view.

---

## Public Route: /share/[token]
No Supabase auth required. Uses `token` to look up `client_views`.
Password if set → prompt for password before revealing candidate list.
