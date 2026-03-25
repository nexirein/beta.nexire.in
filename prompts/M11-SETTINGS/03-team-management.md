<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/settings.md        ← this module's API contract
-->

# M11 — TASK 03: TEAM MANAGEMENT
# Trae: Read CLAUDE.md first. Read lib/config/plans.ts for seat limits.
# Team management lets org admins invite recruiters, set roles,
# and manage seats. Growth allows add-on seats at ₹3,500/seat.
# Route: /settings/team
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. invitations table (pending email invites)
2. TeamManagementPage at /settings/team
3. GET /api/settings/team — list members + pending invites
4. POST /api/settings/team/invite — send email invite
5. DELETE /api/settings/team/[id] — remove member
6. PATCH /api/settings/team/[id]/role — change member role
7. POST /api/settings/team/invite/accept — accept invite via token
8. DELETE /api/settings/team/invite/[id] — cancel pending invite

---

## FILE 1 — Supabase SQL

```sql
-- invitations table
CREATE TABLE invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invited_by   UUID NOT NULL REFERENCES auth.users(id),
  email        TEXT NOT NULL,
  role         TEXT DEFAULT 'recruiter' CHECK (role IN ('recruiter','admin')),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invites_org   ON invitations(org_id, status);
CREATE INDEX idx_invites_token ON invitations(token);
CREATE INDEX idx_invites_email ON invitations(email);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org admins manage invitations"
  ON invitations
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Add member_role to profiles (separate from super_admin role)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS member_role TEXT DEFAULT 'recruiter'
    CHECK (member_role IN ('recruiter', 'admin', 'owner'));
```

---

## FILE 2 — app/(app)/settings/team/page.tsx

```tsx
import { SettingsShell } from "@/components/settings/SettingsShell";
import { TeamManagementClient } from "./TeamManagementClient";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Team | Nexire" };

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, member_role")
    .eq("id", user?.id)
    .single();

  const { data: org } = await supabase
    .from("orgs")
    .select("plan")
    .eq("id", profile?.org_id)
    .single();

  return (
    <SettingsShell>
      <TeamManagementClient
        currentUserId={user?.id ?? ""}
        currentUserRole={profile?.member_role ?? "recruiter"}
        plan={org?.plan ?? "free"}
      />
    </SettingsShell>
  );
}
```

---

## FILE 3 — app/(app)/settings/team/TeamManagementClient.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import {
  Users, UserPlus, Mail, Crown, Shield, User as UserIcon,
  Trash2, ChevronDown, Clock, CheckCircle, XCircle,
  Info, ExternalLink, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PLANS } from "@/lib/config/plans";

const ROLE_CONFIG = {
  owner:     { label: "Owner",     icon: Crown,      color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  admin:     { label: "Admin",     icon: Shield,     color: "text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/20"   },
  recruiter: { label: "Recruiter", icon: UserIcon,   color: "text-[#555555] bg-[#1A1A1A] border-[#222222]"         },
};

interface Props {
  currentUserId:   string;
  currentUserRole: string;
  plan:            string;
}

export function TeamManagementClient({ currentUserId, currentUserRole, plan }: Props) {
  const [members, setMembers]     = useState<any[]>([]);
  const [invites, setInvites]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState("recruiter");
  const [sending, setSending]         = useState(false);
  const [openRoleMenu, setOpenRoleMenu] = useState<string | null>(null);

  const planConfig   = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;
  const isAdmin      = currentUserRole === "owner" || currentUserRole === "admin";
  // Growth allows add-on seats — no hard cap enforced in UI (billing handles it)
  const canInvite    = isAdmin && (plan === "growth" || plan === "custom");

  const load = async () => {
    setLoading(true);
    const res  = await fetch("/api/settings/team");
    const data = await res.json();
    setMembers(data.members ?? []);
    setInvites(data.invites ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    const res = await fetch("/api/settings/team/invite", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    setSending(false);
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to send invite"); return; }
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail("");
    load();
  };

  const removeMember = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from your team? They will lose access immediately.`)) return;
    await fetch(`/api/settings/team/${memberId}`, { method: "DELETE" });
    toast.success(`${name} removed from team`);
    load();
  };

  const cancelInvite = async (inviteId: string) => {
    await fetch(`/api/settings/team/invite/${inviteId}`, { method: "DELETE" });
    toast.success("Invite cancelled");
    load();
  };

  const changeRole = async (memberId: string, role: string) => {
    await fetch(`/api/settings/team/${memberId}/role`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role }),
    });
    toast.success("Role updated");
    setOpenRoleMenu(null);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#FAFAFA]">Team</h1>
        <p className="text-xs text-[#555555] mt-0.5">
          {members.length} member{members.length !== 1 ? "s" : ""}
          {invites.length > 0 && ` · ${invites.length} pending invite${invites.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Plan gate */}
      {!canInvite && (
        <div className="flex items-start gap-3 bg-[#111111] border border-[#222222] rounded-2xl px-4 py-4">
          <Info className="w-4 h-4 text-[#555555] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-[#A0A0A0]">Team invites require Growth or Custom</p>
            <p className="text-[11px] text-[#555555] mt-0.5">
              Add team members at ₹3,500/seat on Growth, or get custom pricing for 3+ seats.
            </p>
            <a href="/settings/billing" className="text-[11px] text-[#38BDF8] mt-1.5 inline-flex items-center gap-1 hover:underline">
              View plans <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Invite form */}
      {canInvite && (
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Invite a team member</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendInvite()}
                placeholder="colleague@company.com"
                type="email"
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
              />
            </div>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#A0A0A0] focus:outline-none focus:border-[#38BDF8]/50 appearance-none"
            >
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={sendInvite}
              disabled={!inviteEmail.trim() || sending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all whitespace-nowrap"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {sending ? "Sending..." : "Send invite"}
            </button>
          </div>
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-[#333333] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#333333]">
              Add-on seats are billed at ₹3,500/month each. The invite expires in 7 days.
            </p>
          </div>
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Pending invites</p>
          {invites.map(invite => (
            <div key={invite.id} className="flex items-center justify-between bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[#A0A0A0]">{invite.email}</p>
                  <p className="text-[10px] text-[#333333]">
                    Invited {new Date(invite.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    · Expires {new Date(invite.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-md border font-medium capitalize",
                  ROLE_CONFIG[invite.role as keyof typeof ROLE_CONFIG]?.color ?? ROLE_CONFIG.recruiter.color
                )}>
                  {invite.role}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => cancelInvite(invite.id)}
                    className="p-1.5 rounded-lg text-[#333333] hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="Cancel invite"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Members */}
      <div className="space-y-2">
        <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Members</p>
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-[#111111] border border-[#1A1A1A] rounded-xl animate-pulse" />
          ))
        ) : (
          members.map(member => {
            const roleInfo   = ROLE_CONFIG[member.member_role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.recruiter;
            const RoleIcon   = roleInfo.icon;
            const isSelf     = member.id === currentUserId;
            const isOwner    = member.member_role === "owner";
            const initials   = (member.full_name ?? member.email ?? "?")
              .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

            return (
              <div key={member.id} className="flex items-center justify-between bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 group relative">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-xs font-bold text-[#555555] overflow-hidden">
                    {member.avatar_url
                      ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                      : initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-[#FAFAFA]">{member.full_name ?? "—"}</p>
                      {isSelf && <span className="text-[9px] text-[#333333] bg-[#1A1A1A] px-1.5 py-0.5 rounded-md">You</span>}
                    </div>
                    <p className="text-[10px] text-[#555555]">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Role badge / dropdown */}
                  {isAdmin && !isSelf && !isOwner ? (
                    <div className="relative">
                      <button
                        onClick={() => setOpenRoleMenu(openRoleMenu === member.id ? null : member.id)}
                        className={cn(
                          "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-medium transition-all hover:opacity-80",
                          roleInfo.color
                        )}
                      >
                        <RoleIcon className="w-3 h-3" />
                        {roleInfo.label}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {openRoleMenu === member.id && (
                        <div className="absolute right-0 top-7 bg-[#111111] border border-[#222222] rounded-xl shadow-xl z-20 py-1 min-w-[130px]">
                          {Object.entries(ROLE_CONFIG).filter(([k]) => k !== "owner").map(([k, v]) => {
                            const Icon = v.icon;
                            return (
                              <button
                                key={k}
                                onClick={() => changeRole(member.id, k)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#FAFAFA] transition-all"
                              >
                                <Icon className="w-3 h-3" /> {v.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={cn("flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-medium", roleInfo.color)}>
                      <RoleIcon className="w-3 h-3" /> {roleInfo.label}
                    </span>
                  )}

                  {/* Remove button */}
                  {isAdmin && !isSelf && !isOwner && (
                    <button
                      onClick={() => removeMember(member.id, member.full_name ?? member.email)}
                      className="p-1.5 rounded-lg text-[#333333] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Roles explainer */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4 space-y-2">
        <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Role permissions</p>
        {[
          { role: "owner",     perms: "Full access. Manage billing, team, and all org settings." },
          { role: "admin",     perms: "Invite/remove members, manage sequences and contacts. Cannot change billing." },
          { role: "recruiter", perms: "Search, reveal, create shortlists and sequences. Cannot manage team." },
        ].map(r => {
          const cfg  = ROLE_CONFIG[r.role as keyof typeof ROLE_CONFIG];
          const Icon = cfg.icon;
          return (
            <div key={r.role} className="flex items-start gap-2.5">
              <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-medium flex-shrink-0 mt-0.5", cfg.color)}>
                <Icon className="w-3 h-3" /> {cfg.label}
              </span>
              <p className="text-[11px] text-[#555555]">{r.perms}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## FILE 4 — app/api/settings/team/route.ts  (GET)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, member_role, created_at")
      .eq("org_id", profile?.org_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, status, created_at, expires_at")
      .eq("org_id", profile?.org_id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    members: membersRes.data ?? [],
    invites: invitesRes.data ?? [],
  });
}
```

---

## FILE 5 — app/api/settings/team/invite/route.ts  (POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { PLANS } from "@/lib/config/plans";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, role } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id, member_role, full_name").eq("id", user.id).single();

  if (!["owner","admin"].includes(profile?.member_role ?? "")) {
    return NextResponse.json({ error: "Only admins can invite team members" }, { status: 403 });
  }

  const { data: org } = await supabase
    .from("orgs").select("name, plan").eq("id", profile?.org_id).single();

  if (!["growth","custom"].includes(org?.plan ?? "")) {
    return NextResponse.json({ error: "Team invites require Growth or Custom plan" }, { status: 403 });
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from("profiles").select("id")
    .eq("org_id", profile?.org_id)
    .eq("id", (await supabase.auth.admin.getUserByEmail(email))?.data?.user?.id ?? "never");

  if (existing?.length) {
    return NextResponse.json({ error: "This person is already a team member" }, { status: 409 });
  }

  // Upsert invite (cancel any existing pending)
  await supabase.from("invitations")
    .update({ status: "cancelled" })
    .eq("org_id", profile?.org_id)
    .eq("email", email.toLowerCase())
    .eq("status", "pending");

  const { data: invite } = await supabase
    .from("invitations")
    .insert({
      org_id:     profile?.org_id,
      invited_by: user.id,
      email:      email.toLowerCase().trim(),
      role:       role ?? "recruiter",
    })
    .select("token")
    .single();

  // Send invite email via Resend
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?token=${invite?.token}`;

  await resend.emails.send({
    from:    "Nexire <team@nexire.in>",
    to:      email,
    subject: `${profile?.full_name} invited you to join ${org?.name} on Nexire`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
        <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">
          You've been invited to ${org?.name}
        </h2>
        <p style="font-size:14px;color:#64748b;margin-bottom:24px;">
          ${profile?.full_name} invited you to join their team on Nexire as a <strong>${role}</strong>.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:white;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
          Accept invite
        </a>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
          This invite expires in 7 days. If you didn't expect this, ignore this email.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
```

---

## FILE 6 — app/api/settings/team/[id]/route.ts  (DELETE member)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id, member_role").eq("id", user.id).single();

  if (!["owner","admin"].includes(profile?.member_role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Can't remove yourself or the org owner
  if (params.id === user.id) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("profiles").select("member_role, org_id").eq("id", params.id).single();

  if (target?.member_role === "owner") {
    return NextResponse.json({ error: "Cannot remove the org owner" }, { status: 403 });
  }
  if (target?.org_id !== profile?.org_id) {
    return NextResponse.json({ error: "Not in your org" }, { status: 403 });
  }

  // Remove from org (set org_id to null — they keep their Supabase Auth account)
  await supabase.from("profiles")
    .update({ org_id: null, member_role: "recruiter" })
    .eq("id", params.id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 7 — app/api/settings/team/[id]/role/route.ts  (PATCH role)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const RoleSchema = z.object({ role: z.enum(["recruiter", "admin"]) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = RoleSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id, member_role").eq("id", user.id).single();

  if (!["owner","admin"].includes(profile?.member_role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabase.from("profiles")
    .update({ member_role: parsed.data.role })
    .eq("id", params.id)
    .eq("org_id", profile?.org_id)
    .neq("member_role", "owner");  // never demote owner

  return NextResponse.json({ success: true });
}
```

---

## FILE 8 — app/(app)/invite/accept/page.tsx  (Accept invite link)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;
  if (!token) redirect("/login");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Validate token
  const { data: invite } = await supabase
    .from("invitations")
    .select("id, org_id, email, role, status, expires_at")
    .eq("token", token)
    .single();

  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) < new Date()) {
    redirect("/login?error=invite_expired");
  }

  // If not logged in, redirect to signup with token preserved
  if (!user) {
    redirect(`/signup?invite=${token}`);
  }

  // Accept invite — add user to org
  await supabase.from("profiles").update({
    org_id:      invite.org_id,
    member_role: invite.role,
  }).eq("id", user.id);

  // Mark invite accepted
  await supabase.from("invitations").update({
    status:      "accepted",
    accepted_at: new Date().toISOString(),
  }).eq("id", invite.id);

  redirect("/dashboard?joined=true");
}
```

---

## COMPLETION CHECKLIST
- [ ] invitations table: token (unique hex), expires_at = +7 days, status enum
- [ ] profiles.member_role: owner | admin | recruiter
- [ ] TeamManagementClient: plan-gated (Growth+ only for invites)
- [ ] Invite form: email + role (recruiter/admin) + sends Resend email
- [ ] Pending invites section: cancel button, shows expiry date
- [ ] Members list: initials avatar, role badge, role dropdown for admins
- [ ] Role dropdown: cannot change owner, cannot change own role
- [ ] Remove member: sets org_id = null (keeps Auth account), cannot remove owner or self
- [ ] PATCH /role: prevents demoting owner
- [ ] /invite/accept: validates token + expiry, adds to org, marks accepted
- [ ] Add-on seat note in invite form (₹3,500/seat)
- [ ] Roles explainer card at bottom of page

## BUILD LOG ENTRY
## M11-03 Team Management — [date]
### Files: invitations SQL, TeamManagementClient, 6 API routes, /invite/accept page
### Status: ✅ Complete
