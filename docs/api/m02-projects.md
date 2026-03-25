# M02 — Projects API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M02 build

---

## Routes

### GET /api/projects
List all projects for the authenticated org.

**Response**: `{ "data": Project[] }`

---

### POST /api/projects
Create a new project.

**Request**
```json
{ "title": "string", "description": "string?", "jd_text": "string?" }
```

---

### GET /api/projects/:id
Get a single project with metadata.

---

### PATCH /api/projects/:id
Update project title, description, status.

**Request**: partial `{ "title"?, "description"?, "status"?: "active | closed | archived" }`

---

### DELETE /api/projects/:id
Archive a project (soft delete — set `status: 'archived'`).

---

## Types

```typescript
type Project = {
  id: string
  org_id: string
  title: string
  description?: string
  status: 'active' | 'closed' | 'archived'
  jd_text?: string
  created_by: string
  created_at: string
}
```
