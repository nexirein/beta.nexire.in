<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/settings.md        ← this module's API contract
-->

# M11 — TASK 01: PROFILE SETTINGS
# Trae: Read CLAUDE.md first. Read lib/config/plans.ts for plan limits.
# The profile settings page lets recruiters update personal info,
# change password, manage notification preferences, and delete account.
# Route: /settings/profile
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. ProfileSettingsPage at /settings/profile
2. PATCH /api/settings/profile — update name, phone, timezone, avatar_url
3. POST /api/settings/avatar — upload avatar to Supabase Storage
4. POST /api/settings/change-password — via Supabase Auth
5. PATCH /api/settings/notifications — update notification preferences
6. DELETE /api/settings/account — soft delete (requires typed confirmation)
7. SettingsShell — shared sidebar layout for all /settings/* pages

---

## FILE 1 — Supabase SQL: extend profiles table

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS phone             TEXT,
  ADD COLUMN IF NOT EXISTS timezone          TEXT DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS notify_email_seq  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_reply  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_credit_low BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_weekly_digest BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_deleted        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- Supabase Storage bucket for avatars
-- Run in Supabase dashboard: Storage → New bucket → "avatars" → Public: true
```

---

## FILE 2 — components/settings/SettingsShell.tsx

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User, Mail, Users, BarChart3, CreditCard,
  Shield, Bell, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  { href: "/settings/profile",      label: "Profile",         icon: User       },
  { href: "/settings/mailboxes",    label: "Mailboxes",       icon: Mail       },
  { href: "/settings/team",         label: "Team",            icon: Users      },
  { href: "/settings/usage",        label: "Usage & Credits", icon: BarChart3  },
  { href: "/settings/billing",      label: "Billing",         icon: CreditCard },
  { href: "/settings/dnc",          label: "DNC List",        icon: Shield     },
];

interface Props { children: React.ReactNode; }

export function SettingsShell({ children }: Props) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex">
      {/* Left nav */}
      <aside className="w-52 flex-shrink-0 border-r border-[#1A1A1A] px-2 py-8">
        <p className="text-[10px] text-[#333333] uppercase tracking-widest font-medium px-3 mb-3">
          Settings
        </p>
        <nav className="space-y-0.5">
          {SETTINGS_NAV.map(item => {
            const Icon   = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
                  active
                    ? "bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20"
                    : "text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111]"
                )}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 px-10 py-8 max-w-2xl">
        {children}
      </main>
    </div>
  );
}
```

---

## FILE 3 — app/(app)/settings/profile/page.tsx

```tsx
import { SettingsShell } from "@/components/settings/SettingsShell";
import { ProfileSettingsClient } from "./ProfileSettingsClient";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profile Settings | Nexire" };

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .single();

  return (
    <SettingsShell>
      <ProfileSettingsClient profile={profile} email={user?.email ?? ""} />
    </SettingsShell>
  );
}
```

---

## FILE 4 — app/(app)/settings/profile/ProfileSettingsClient.tsx

```tsx
"use client";
import { useState, useRef } from "react";
import { Camera, Save, Eye, EyeOff, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London",
  "America/New_York", "America/Los_Angeles", "UTC",
];

interface Props {
  profile: any;
  email:   string;
}

export function ProfileSettingsClient({ profile, email }: Props) {
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? "",
    phone:     profile?.phone ?? "",
    timezone:  profile?.timezone ?? "Asia/Kolkata",
  });
  const [notifications, setNotifications] = useState({
    notify_email_seq:      profile?.notify_email_seq   ?? true,
    notify_new_reply:      profile?.notify_new_reply   ?? true,
    notify_credit_low:     profile?.notify_credit_low  ?? true,
    notify_weekly_digest:  profile?.notify_weekly_digest ?? true,
  });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [savingPw, setSavingPw]   = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = (form.full_name || email)
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  // Avatar upload
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max avatar size is 2MB"); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res  = await fetch("/api/settings/avatar", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) { toast.error("Failed to upload avatar"); return; }
    setAvatarUrl(data.avatar_url);
    toast.success("Avatar updated");
  };

  // Save profile
  const saveProfile = async () => {
    if (!form.full_name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const res = await fetch("/api/settings/profile", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save profile"); return; }
    toast.success("Profile saved");
  };

  // Save notifications
  const saveNotifications = async () => {
    await fetch("/api/settings/notifications", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(notifications),
    });
    toast.success("Notification preferences saved");
  };

  // Change password
  const changePassword = async () => {
    if (passwords.next !== passwords.confirm) { toast.error("Passwords don't match"); return; }
    if (passwords.next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSavingPw(true);
    const res = await fetch("/api/settings/change-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ current_password: passwords.current, new_password: passwords.next }),
    });
    setSavingPw(false);
    if (!res.ok) { toast.error("Failed to change password — check your current password"); return; }
    toast.success("Password changed");
    setPasswords({ current: "", next: "", confirm: "" });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-[#FAFAFA]">Profile</h1>
        <p className="text-xs text-[#555555] mt-0.5">Manage your personal information and preferences</p>
      </div>

      {/* Avatar */}
      <section className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Photo</h2>
        <div className="flex items-center gap-5">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] overflow-hidden flex items-center justify-center">
              {avatarUrl
                ? <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                : <span className="text-lg font-bold text-[#555555]">{initials}</span>
              }
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {uploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <Camera className="w-5 h-5 text-white" />
              }
            </div>
          </div>
          <div>
            <p className="text-xs text-[#A0A0A0] font-medium">Upload a photo</p>
            <p className="text-[11px] text-[#333333] mt-0.5">JPG, PNG or WebP · Max 2MB</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>
      </section>

      {/* Personal info */}
      <section className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-[#FAFAFA]">Personal information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Full name</label>
            <input
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Email</label>
            <input
              value={email}
              disabled
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-3 py-2.5 text-sm text-[#333333] cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Phone</label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+91 98765 43210"
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Timezone</label>
            <select
              value={form.timezone}
              onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#A0A0A0] focus:outline-none focus:border-[#38BDF8]/50 appearance-none"
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={saveProfile}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving..." : "Save changes"}
        </button>
      </section>

      {/* Notifications */}
      <section className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-[#FAFAFA]">Notifications</h2>
        {[
          { key: "notify_email_seq",     label: "Sequence step sent",        sub: "When a sequence email is delivered" },
          { key: "notify_new_reply",     label: "Candidate replies",         sub: "When a candidate replies to your outreach" },
          { key: "notify_credit_low",    label: "Low credit warning",        sub: "When your credits drop below 20" },
          { key: "notify_weekly_digest", label: "Weekly performance digest", sub: "Summary of opens, replies, placements" },
        ].map(n => (
          <div key={n.key} className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-medium text-[#A0A0A0]">{n.label}</p>
              <p className="text-[11px] text-[#333333]">{n.sub}</p>
            </div>
            <button
              onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key as keyof typeof prev] }))}
              className={cn(
                "w-9 h-5 rounded-full transition-all relative flex-shrink-0",
                notifications[n.key as keyof typeof notifications]
                  ? "bg-[#38BDF8]" : "bg-[#2A2A2A]"
              )}
            >
              <span className={cn(
                "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                notifications[n.key as keyof typeof notifications] ? "left-4" : "left-0.5"
              )} />
            </button>
          </div>
        ))}
        <button
          onClick={saveNotifications}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A1A] border border-[#222222] text-sm text-[#A0A0A0] hover:text-[#FAFAFA] hover:border-[#333333] transition-all"
        >
          <Save className="w-3.5 h-3.5" /> Save preferences
        </button>
      </section>

      {/* Change password */}
      <section className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-[#FAFAFA]">Change password</h2>
        {[
          { key: "current", label: "Current password", placeholder: "Enter current password" },
          { key: "next",    label: "New password",     placeholder: "Min. 8 characters" },
          { key: "confirm", label: "Confirm password", placeholder: "Re-enter new password" },
        ].map(f => (
          <div key={f.key}>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">{f.label}</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={passwords[f.key as keyof typeof passwords]}
                onChange={e => setPasswords(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 pr-10 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
              />
              {f.key === "next" && (
                <button onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#333333] hover:text-[#555555]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={changePassword}
          disabled={!passwords.current || !passwords.next || !passwords.confirm || savingPw}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1A1A] border border-[#222222] text-sm text-[#A0A0A0] hover:text-[#FAFAFA] hover:border-[#333333] disabled:opacity-50 transition-all"
        >
          {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {savingPw ? "Changing..." : "Change password"}
        </button>
      </section>

      {/* Danger zone */}
      <section className="bg-[#111111] border border-red-400/20 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
        <p className="text-xs text-[#555555]">
          Deleting your account is permanent. All your data, sequences, contacts, and shortlists will be removed within 30 days. This cannot be undone.
        </p>
        <div>
          <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
            Type <span className="text-red-400 font-mono">DELETE MY ACCOUNT</span> to confirm
          </label>
          <input
            value={deleteText}
            onChange={e => setDeleteText(e.target.value)}
            placeholder="DELETE MY ACCOUNT"
            className="w-full bg-[#0A0A0A] border border-red-400/20 rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-red-400/50 transition-all"
          />
        </div>
        <button
          onClick={async () => {
            if (deleteText !== "DELETE MY ACCOUNT") return;
            const res = await fetch("/api/settings/account", { method: "DELETE" });
            if (res.ok) window.location.href = "/login?deleted=true";
            else toast.error("Failed to delete account — contact support");
          }}
          disabled={deleteText !== "DELETE MY ACCOUNT"}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-400/10 border border-red-400/20 text-sm text-red-400 hover:bg-red-400/20 disabled:opacity-30 transition-all"
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Delete account permanently
        </button>
      </section>
    </div>
  );
}
```

---

## FILE 5 — app/api/settings/profile/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const ProfileSchema = z.object({
  full_name: z.string().min(1).max(200),
  phone:     z.string().max(20).optional(),
  timezone:  z.string().max(50).optional(),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ProfileSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## FILE 6 — app/api/settings/avatar/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file     = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext     = file.name.split(".").pop();
  const path    = `${user.id}/avatar.${ext}`;
  const buffer  = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, {
      contentType:  file.type,
      upsert:       true,
    });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

  await supabase.from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ avatar_url: publicUrl });
}
```

---

## FILE 7 — app/api/settings/change-password/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { current_password, new_password } = await req.json();
  const supabase = await createClient();

  // Verify current password by re-signing in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email:    user.email,
    password: current_password,
  });
  if (signInError) return NextResponse.json({ error: "Incorrect current password" }, { status: 400 });

  const { error: updateError } = await supabase.auth.updateUser({ password: new_password });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## FILE 8 — app/api/settings/notifications/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const NotifSchema = z.object({
  notify_email_seq:      z.boolean().optional(),
  notify_new_reply:      z.boolean().optional(),
  notify_credit_low:     z.boolean().optional(),
  notify_weekly_digest:  z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = NotifSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  await supabase.from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 9 — app/api/settings/account/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft delete — actual deletion runs via weekly cron
  await supabase.from("profiles").update({
    is_deleted:  true,
    deleted_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).eq("id", user.id);

  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
```

---

## COMPLETION CHECKLIST
- [ ] profiles SQL: avatar_url, phone, timezone, notify_* columns, is_deleted
- [ ] Supabase Storage: "avatars" bucket created (public)
- [ ] SettingsShell: 6-item left nav, active state highlight
- [ ] ProfileSettingsPage: server component loads profile + passes to client
- [ ] Avatar: click to upload, 2MB limit, upsert to avatars/{user_id}/avatar.ext
- [ ] Personal info form: name, phone, timezone — PATCH /api/settings/profile
- [ ] Notifications: 4 toggles (animated), PATCH /api/settings/notifications
- [ ] Change password: verify current → update via Supabase Auth
- [ ] Delete account: type "DELETE MY ACCOUNT" guard → soft delete → sign out
- [ ] Email field: disabled (not editable — Auth manages email)

## BUILD LOG ENTRY
## M11-01 Profile Settings — [date]
### Files: SettingsShell, ProfileSettingsClient, 5 API routes, SQL
### Status: ✅ Complete
