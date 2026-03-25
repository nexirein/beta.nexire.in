<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/client-dashboard.md ← this module's API contract
-->

# M07 — TASK 01: CREATE SHARE LINK
# Trae: Read CLAUDE.md first.
# A share link lets recruiters send clients a branded, password-optional
# page showing shortlisted candidates for a project.
# No login required for clients — link is the auth token.
# This file: DB schema, share link creation modal, API routes.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the share link system:
1. share_links table (token, expiry, password, project reference)
2. ShareLinkModal — create/manage links from project detail page
3. POST /api/projects/[id]/share       — generate new share link
4. PATCH /api/share/[token]            — update settings (expiry, password, title)
5. DELETE /api/share/[token]           — revoke link
6. GET /api/share/[token]/verify       — public: verify link + optional password

---

## FILE 1 — Supabase SQL: share_links table

```sql
CREATE TABLE share_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),

  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  title           TEXT,                      -- custom title shown to client
  client_name     TEXT,                      -- who you're sharing with (e.g. "Ashish @ Razorpay")
  client_email    TEXT,                      -- optional, for tracking
  password_hash   TEXT,                      -- bcrypt hash if password protected
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  -- What to show
  show_contact    BOOLEAN NOT NULL DEFAULT FALSE,  -- show email/phone to client?
  show_linkedin   BOOLEAN NOT NULL DEFAULT TRUE,
  show_notes      BOOLEAN NOT NULL DEFAULT FALSE,  -- hide internal notes from client

  -- Expiry
  expires_at      TIMESTAMPTZ,               -- null = never expires

  -- Stats (updated by tracking)
  view_count      INTEGER NOT NULL DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_share_links_token      ON share_links(token);
CREATE INDEX idx_share_links_project    ON share_links(project_id);
CREATE INDEX idx_share_links_org        ON share_links(org_id);

-- RLS (only org members can manage their share links)
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage own share links"
  ON share_links
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER share_links_updated_at
  BEFORE UPDATE ON share_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## FILE 2 — components/share/ShareLinkModal.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import {
  X, Link2, Copy, Check, Eye, EyeOff,
  Trash2, Shield, Calendar, User, Mail,
  ExternalLink, RefreshCw, ToggleLeft, ToggleRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareLink {
  id:           string;
  token:        string;
  title:        string | null;
  client_name:  string | null;
  client_email: string | null;
  is_active:    boolean;
  show_contact: boolean;
  show_linkedin:boolean;
  show_notes:   boolean;
  expires_at:   string | null;
  view_count:   number;
  last_viewed_at: string | null;
  created_at:   string;
}

interface ShareLinkModalProps {
  open:       boolean;
  onClose:    () => void;
  projectId:  string;
  projectTitle: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexire.in";

export function ShareLinkModal({ open, onClose, projectId, projectTitle }: ShareLinkModalProps) {
  const [links, setLinks]         = useState<ShareLink[]>([]);
  const [loading, setLoading]     = useState(false);
  const [creating, setCreating]   = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);

  // New link form state
  const [form, setForm] = useState({
    title:        projectTitle,
    client_name:  "",
    client_email: "",
    show_contact: false,
    show_linkedin:true,
    show_notes:   false,
    expires_days: "never",
    password:     "",
  });

  const fetchLinks = async () => {
    setLoading(true);
    const res  = await fetch(`/api/projects/${projectId}/share`);
    const data = await res.json();
    setLinks(data.links ?? []);
    setLoading(false);
  };

  useEffect(() => { if (open) fetchLinks(); }, [open]);

  const createLink = async () => {
    setCreating(true);
    const res = await fetch(`/api/projects/${projectId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        expires_days: form.expires_days === "never" ? null : Number(form.expires_days),
      }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { toast.error(data.error ?? "Failed to create link"); return; }
    toast.success("Share link created");
    setShowCreate(false);
    setForm({ title: projectTitle, client_name: "", client_email: "", show_contact: false, show_linkedin: true, show_notes: false, expires_days: "never", password: "" });
    fetchLinks();
  };

  const revokeLink = async (token: string) => {
    if (!confirm("Revoke this link? The client will no longer be able to view it.")) return;
    await fetch(`/api/share/${token}`, { method: "DELETE" });
    toast.success("Link revoked");
    fetchLinks();
  };

  const copyLink = async (token: string) => {
    const url = `${APP_URL}/c/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  const shareUrl = (token: string) => `${APP_URL}/c/${token}`;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-lg shadow-2xl animate-scale-in max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-[#38BDF8]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#FAFAFA]">Share with client</h2>
              <p className="text-[11px] text-[#555555]">{projectTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Existing links */}
          {!loading && links.map(link => (
            <div key={link.id} className="bg-[#0A0A0A] border border-[#222222] rounded-xl p-4 space-y-3">
              {/* Link title row */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[#FAFAFA]">
                    {link.title ?? projectTitle}
                  </p>
                  {link.client_name && (
                    <p className="text-[11px] text-[#555555] mt-0.5">
                      Shared with: {link.client_name}
                      {link.client_email && ` · ${link.client_email}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-md border font-medium",
                    link.is_active
                      ? "text-green-400 bg-green-400/10 border-green-400/20"
                      : "text-[#555555] bg-[#1A1A1A] border-[#222222]"
                  )}>
                    {link.is_active ? "Active" : "Revoked"}
                  </span>
                </div>
              </div>

              {/* URL row */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-[11px] text-[#555555] truncate font-mono">
                  {shareUrl(link.token)}
                </div>
                <button
                  onClick={() => copyLink(link.token)}
                  className="p-2 rounded-xl bg-[#111111] border border-[#222222] text-[#555555] hover:text-[#38BDF8] hover:border-[#38BDF8]/40 transition-all flex-shrink-0"
                >
                  {copied === link.token ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={shareUrl(link.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-[#111111] border border-[#222222] text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Stats + settings row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[10px] text-[#555555]">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {link.view_count} view{link.view_count !== 1 ? "s" : ""}
                  </span>
                  {link.last_viewed_at && (
                    <span>Last: {new Date(link.last_viewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  )}
                  {link.expires_at && (
                    <span className={cn(
                      "flex items-center gap-1",
                      new Date(link.expires_at) < new Date() ? "text-red-400" : "text-[#555555]"
                    )}>
                      <Calendar className="w-3 h-3" />
                      Exp: {new Date(link.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {link.show_contact && (
                    <span className="text-orange-400">Contact visible</span>
                  )}
                </div>
                {link.is_active && (
                  <button
                    onClick={() => revokeLink(link.token)}
                    className="text-[10px] text-[#555555] hover:text-[#EF4444] transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Revoke
                  </button>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <p className="text-xs text-[#555555] text-center py-4">Loading links...</p>
          )}

          {/* Create new link form */}
          {showCreate ? (
            <div className="bg-[#0A0A0A] border border-[#38BDF8]/20 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">New share link</h3>

              {/* Title */}
              <div>
                <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                  Link title (shown to client)
                </label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                  placeholder="e.g. Backend Engineers for Razorpay"
                />
              </div>

              {/* Client info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                    Client name
                  </label>
                  <input
                    value={form.client_name}
                    onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    className="w-full bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                    placeholder="Ashish Jha"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                    Client email (optional)
                  </label>
                  <input
                    value={form.client_email}
                    onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                    className="w-full bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                    placeholder="ashish@razorpay.com"
                  />
                </div>
              </div>

              {/* Visibility toggles */}
              <div className="space-y-2.5">
                <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Visibility settings</p>
                {[
                  { key: "show_contact",  label: "Show email & phone numbers", icon: Mail,    warn: true  },
                  { key: "show_linkedin", label: "Show LinkedIn profile link",   icon: Link2,   warn: false },
                  { key: "show_notes",    label: "Show recruiter notes",         icon: Eye,     warn: true  },
                ].map(({ key, label, icon: Icon, warn }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("w-3.5 h-3.5", warn ? "text-orange-400/70" : "text-[#555555]")} />
                      <span className="text-xs text-[#A0A0A0]">{label}</span>
                    </div>
                    <button
                      onClick={() => setForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                      className="transition-colors"
                    >
                      {(form as any)[key]
                        ? <ToggleRight className={cn("w-6 h-6", warn ? "text-orange-400" : "text-[#38BDF8]")} />
                        : <ToggleLeft className="w-6 h-6 text-[#333333]" />}
                    </button>
                  </div>
                ))}
              </div>

              {/* Expiry */}
              <div>
                <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                  Link expiry
                </label>
                <select
                  value={form.expires_days}
                  onChange={e => setForm(f => ({ ...f, expires_days: e.target.value }))}
                  className="w-full bg-[#111111] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all appearance-none"
                >
                  <option value="never">Never expires</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                </select>
              </div>

              {/* Password (optional) */}
              <div>
                <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                  Password protect (optional)
                </label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full bg-[#111111] border border-[#222222] rounded-xl pl-9 pr-3 py-2 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                    placeholder="Leave blank for no password"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={createLink}
                  disabled={creating}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create link"}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#222222] text-sm text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[#333333] text-sm text-[#555555] hover:text-[#A0A0A0] hover:border-[#444444] transition-all"
            >
              <Link2 className="w-4 h-4" />
              Create new share link
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 3 — app/api/projects/[id]/share/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

const CreateSchema = z.object({
  title:        z.string().max(200).optional(),
  client_name:  z.string().max(100).optional(),
  client_email: z.string().email().optional().or(z.literal("")),
  show_contact: z.boolean().default(false),
  show_linkedin:z.boolean().default(true),
  show_notes:   z.boolean().default(false),
  expires_days: z.number().int().min(1).max(365).nullable().optional(),
  password:     z.string().max(100).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: links } = await supabase
    .from("share_links")
    .select("id, token, title, client_name, client_email, is_active, show_contact, show_linkedin, show_notes, expires_at, view_count, last_viewed_at, created_at")
    .eq("project_id", params.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ links: links ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const expiresAt = parsed.data.expires_days
    ? new Date(Date.now() + parsed.data.expires_days * 86400000).toISOString()
    : null;

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 10)
    : null;

  const { data: link, error: insertError } = await supabase
    .from("share_links")
    .insert({
      org_id:        profile?.org_id,
      project_id:    params.id,
      created_by:    user.id,
      title:         parsed.data.title ?? null,
      client_name:   parsed.data.client_name ?? null,
      client_email:  parsed.data.client_email || null,
      show_contact:  parsed.data.show_contact,
      show_linkedin: parsed.data.show_linkedin,
      show_notes:    parsed.data.show_notes,
      expires_at:    expiresAt,
      password_hash: passwordHash,
    })
    .select("id, token")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(link, { status: 201 });
}
```

---

## FILE 4 — app/api/share/[token]/verify/route.ts  (public — no auth)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();
  const { password } = await req.json().catch(() => ({}));

  const { data: link } = await supabase
    .from("share_links")
    .select("id, is_active, expires_at, password_hash, project_id")
    .eq("token", params.token)
    .single();

  if (!link || !link.is_active) {
    return NextResponse.json({ error: "Link not found or revoked", code: "NOT_FOUND" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link has expired", code: "EXPIRED" }, { status: 410 });
  }
  if (link.password_hash) {
    if (!password) return NextResponse.json({ error: "Password required", code: "PASSWORD_REQUIRED" }, { status: 403 });
    const ok = await bcrypt.compare(password, link.password_hash);
    if (!ok) return NextResponse.json({ error: "Incorrect password", code: "WRONG_PASSWORD" }, { status: 403 });
  }

  return NextResponse.json({ valid: true, project_id: link.project_id, link_id: link.id });
}
```

---

## INSTALL DEPENDENCY
```bash
npm install bcryptjs @types/bcryptjs
```

---

## COMPLETION CHECKLIST
- [ ] share_links table with RLS, token UNIQUE default, all visibility toggles
- [ ] ShareLinkModal: lists existing links with view counts + last viewed
- [ ] ShareLinkModal: create form with visibility toggles, expiry, optional password
- [ ] "Show contact" + "Show notes" toggles styled orange (privacy warning)
- [ ] GET /api/projects/[id]/share: returns all links for project
- [ ] POST /api/projects/[id]/share: creates link with bcrypt password hash
- [ ] POST /api/share/[token]/verify: public endpoint, checks active/expired/password
- [ ] bcryptjs installed for password hashing
- [ ] DELETE /api/share/[token]: sets is_active = false

## BUILD LOG ENTRY
## M07-01 Create Share Link — [date]
### Files: share_links SQL, ShareLinkModal, share API routes
### Status: ✅ Complete
