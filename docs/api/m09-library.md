# M09 — Search Library (Saved Searches) API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M09 build

---

## Routes

### GET /api/search/saved
List saved searches for the org.

---

### POST /api/search/saved
Save a search filter set.

**Request**
```json
{ "name": "string", "filters_json": {}, "criteria_json": {} }
```

---

### DELETE /api/search/saved/:id
Delete a saved search.

---

### POST /api/search/saved/:id/use
Increment `use_count` and return the saved search (for quick re-run).

---

## Types
```typescript
type SavedSearch = {
  id: string
  org_id: string
  name: string
  filters_json: Record<string, unknown>
  criteria_json: Record<string, unknown>
  use_count: number
  created_at: string
  updated_at: string
}
```
