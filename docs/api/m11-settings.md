# M11 — Settings & Team Management API Contracts
# Owner: nexire-backend
# Status: ✅ Complete (all 4 tasks built) — see BUILD-LOG for details

---

## Routes

### Profile

#### GET /api/settings/profile
Return current user's profile.

#### PATCH /api/settings/profile
Update name, avatar, job title, timezone.

---

### Mailbox

#### GET /api/settings/mailbox
List connected mailboxes for the user.

#### POST /api/settings/mailbox/connect
Connect a Gmail or Outlook mailbox via OAuth.

#### DELETE /api/settings/mailbox/:id
Disconnect a mailbox.

---

### Team

#### GET /api/settings/team
List all team members for the org.

#### POST /api/settings/team/invite
Invite a new team member.

**Request**: `{ "email": "string", "role": "admin | member" }`

#### PATCH /api/settings/team/:member_id
Change a team member's role.

#### DELETE /api/settings/team/:member_id
Remove a team member from the org.

---

### Usage

#### GET /api/settings/usage
Return credit usage summary for the current billing cycle.

**Response**
```json
{
  "data": {
    "credits_balance": 200,
    "credits_used": 45,
    "credits_monthly": 200,
    "cycle_resets_at": "ISO8601",
    "recent_transactions": CreditTransaction[]
  }
}
```
