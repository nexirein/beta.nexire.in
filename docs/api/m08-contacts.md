# M08 — Contacts + DNC API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M08 build

---

## Routes

### GET /api/contacts
List all contacts for the org.

---

### GET /api/settings/dnc
List all DNC entries (emails + domains) for the org.

---

### POST /api/settings/dnc
Add an email or domain to the DNC list.

**Request**
```json
{ "value": "john@example.com", "type": "email | domain", "reason": "string?" }
```

---

### DELETE /api/settings/dnc/:id
Remove a DNC entry.

---

## DNC Check Logic
Before any email sequence step is sent:
1. Check `contacts.dnc = true` for this candidate
2. Check `dnc_list` for the candidate's email domain
3. If either match → skip and mark enrollment as `paused`/`dnc`

## Types
```typescript
type DNCEntry = {
  id: string
  org_id: string
  value: string       // email or domain
  type: 'email' | 'domain'
  reason?: string
  added_by: string    // profile id
  created_at: string
}
```
