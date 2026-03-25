# M01 — Auth & Onboarding API Contracts
# Owner: nexire-backend
# Status: 🔲 Placeholder — fill in during M01 build

---

## Routes

### POST /api/auth/magic-link
Send a magic link email to the user.

**Request**
```json
{ "email": "string" }
```
**Response**
```json
{ "data": { "message": "Magic link sent" } }
```

---

### GET /api/auth/me
Return the current user's profile + org.

**Response**
```json
{
  "data": {
    "id": "uuid",
    "email": "string",
    "org_id": "uuid",
    "member_role": "owner | admin | member",
    "full_name": "string",
    "org": { "name": "string", "plan": "string", "credits_balance": 0 }
  }
}
```

---

### POST /api/auth/accept-invite
Accept a team invitation by token.

**Request**
```json
{ "token": "string" }
```

---

### POST /api/auth/onboarding
Complete onboarding (org name, job title).

**Request**
```json
{ "org_name": "string", "job_title": "string" }
```
