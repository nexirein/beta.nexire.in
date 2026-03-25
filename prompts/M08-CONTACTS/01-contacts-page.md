<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/contacts.md        ← this module's API contract
-->

# M08 — TASK 01: CONTACTS PAGE
# Trae: Read CLAUDE.md first.
# The Contacts module is a lightweight CRM for client-side contacts —
# hiring managers, HR leads, decision-makers at client companies.
# Recruiters at Nexire can track every person they interact with,
# tag them, log calls/emails, and see their full history.
# Route: /contacts
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the full Contacts page:
1. contacts table (DB schema + RLS)
2. GET /api/contacts — list with search, filter, pagination
3. POST /api/contacts — create contact
4. PATCH /api/contacts/[id] — update contact
5. DELETE /api/contacts/[id] — soft delete
6. ContactsPage — searchable, filterable table view
7. ContactCard — row component
8. CreateContactModal — add/edit form

---

## FILE 1 — Supabase SQL: contacts table

```sql
CREATE TABLE contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES auth.users(id),

  -- Identity
  full_name        TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 200),
  email            TEXT,
  phone            TEXT,
  linkedin_url     TEXT,

  -- Company context
  company          TEXT,
  job_title        TEXT,
  company_size     TEXT,                    -- "1-10", "11-50", "51-200", "201-500", "500+"
  industry         TEXT,

  -- Location
  city             TEXT,
  country          TEXT DEFAULT 'IN',

  -- CRM fields
  type             TEXT NOT NULL DEFAULT 'client'
                   CHECK (type IN ('client', 'hiring_manager', 'hr', 'agency', 'other')),
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive', 'do_not_contact')),
  tags             TEXT[]  DEFAULT '{}',
  notes            TEXT    CHECK (char_length(notes) <= 5000),
  last_contacted_at TIMESTAMPTZ,

  -- Relationships
  project_ids      UUID[]  DEFAULT '{}',   -- projects this contact is linked to

  -- Meta
  is_archived      BOOLEAN NOT NULL DEFAULT FALSE,
  source           TEXT DEFAULT 'manual',  -- "manual", "import", "linkedin"

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_org        ON contacts(org_id, is_archived, status);
CREATE INDEX idx_contacts_email      ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_company    ON contacts(org_id, company);
CREATE INDEX idx_contacts_tags       ON contacts USING gin(tags);
CREATE INDEX idx_contacts_fts        ON contacts USING gin(
  to_tsvector('english', coalesce(full_name,'') || ' ' || coalesce(company,'') || ' ' || coalesce(job_title,''))
);

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage own contacts"
  ON contacts
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## FILE 2 — app/api/contacts/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const ContactSchema = z.object({
  full_name:    z.string().min(1).max(200),
  email:        z.string().email().optional().or(z.literal("")),
  phone:        z.string().max(20).optional(),
  linkedin_url: z.string().url().optional().or(z.literal("")),
  company:      z.string().max(200).optional(),
  job_title:    z.string().max(200).optional(),
  company_size: z.string().optional(),
  industry:     z.string().optional(),
  city:         z.string().optional(),
  country:      z.string().default("IN"),
  type:         z.enum(["client","hiring_manager","hr","agency","other"]).default("client"),
  status:       z.enum(["active","inactive","do_not_contact"]).default("active"),
  tags:         z.array(z.string()).default([]),
  notes:        z.string().max(5000).optional(),
  source:       z.string().default("manual"),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const type     = searchParams.get("type") ?? "";
  const status   = searchParams.get("status") ?? "active";
  const tag      = searchParams.get("tag") ?? "";
  const company  = searchParams.get("company") ?? "";
  const page     = Number(searchParams.get("page") ?? 1);
  const limit    = 50;
  const offset   = (page - 1) * limit;

  let query = supabase
    .from("contacts")
    .select("id, full_name, email, phone, linkedin_url, company, job_title, type, status, tags, last_contacted_at, created_at, notes", { count: "exact" })
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (type)   query = query.eq("type", type);
  if (company)query = query.ilike("company", `%${company}%`);
  if (tag)    query = query.contains("tags", [tag]);
  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%,job_title.ilike.%${q}%`
    );
  }

  const { data, count, error: fetchError } = await query;
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ContactSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Check for duplicate email within org
  if (parsed.data.email) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", profile?.org_id)
      .eq("email", parsed.data.email)
      .eq("is_archived", false)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "A contact with this email already exists", code: "DUPLICATE_EMAIL" }, { status: 409 });
  }

  const { data: contact, error: insertError } = await supabase
    .from("contacts")
    .insert({ ...parsed.data, org_id: profile?.org_id, created_by: user.id })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(contact, { status: 201 });
}
```

---

## FILE 3 — app/api/contacts/[id]/route.ts  (PATCH + DELETE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { error: updateError } = await supabase
    .from("contacts")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft delete
  await supabase
    .from("contacts")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", params.id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 4 — app/(app)/contacts/page.tsx  (server wrapper)

```tsx
import { ContactsClientPage } from "./ContactsClientPage";

export const metadata = { title: "Contacts | Nexire" };
export default function ContactsPage() {
  return <ContactsClientPage />;
}
```

---

## FILE 5 — app/(app)/contacts/ContactsClientPage.tsx  (main UI)

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Filter, Users, Download, Upload,
         Building2, Tag, Mail, Phone, Linkedin, MoreHorizontal,
         ChevronLeft, ChevronRight } from "lucide-react";
import { CreateContactModal } from "./CreateContactModal";
import { ContactRow } from "./ContactRow";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";

const TYPE_OPTIONS = [
  { value: "",               label: "All types"        },
  { value: "client",         label: "Client"           },
  { value: "hiring_manager", label: "Hiring Manager"   },
  { value: "hr",             label: "HR / Talent"      },
  { value: "agency",         label: "Agency"           },
  { value: "other",          label: "Other"            },
];

const STATUS_OPTIONS = [
  { value: "active",          label: "Active"          },
  { value: "inactive",        label: "Inactive"        },
  { value: "do_not_contact",  label: "Do Not Contact"  },
];

export function ContactsClientPage() {
  const [contacts, setContacts]     = useState<any[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [q, setQ]                   = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [editContact, setEditContact] = useState<any | null>(null);
  const debouncedQ = useDebounce(q, 300);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      ...(debouncedQ && { q: debouncedQ }),
      ...(typeFilter && { type: typeFilter }),
      ...(statusFilter && { status: statusFilter }),
    });
    const res  = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, debouncedQ, typeFilter, statusFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { setPage(1); }, [debouncedQ, typeFilter, statusFilter]);

  const totalPages = Math.ceil(total / 50);

  const handleDelete = async (id: string) => {
    if (!confirm("Archive this contact?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    fetchContacts();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Contacts</h1>
          <p className="text-sm text-[#555555] mt-0.5">
            {total.toLocaleString()} contact{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/contacts/import"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#222222] text-xs text-[#A0A0A0] hover:border-[#333333] hover:text-[#FAFAFA] transition-all"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </a>
          <button
            onClick={() => { setEditContact(null); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all shadow-glow-blue"
          >
            <Plus className="w-4 h-4" /> Add contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name, email, company..."
            className="w-full bg-[#111111] border border-[#222222] rounded-xl pl-8 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-[#111111] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#A0A0A0] focus:outline-none focus:border-[#38BDF8]/50 appearance-none"
        >
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-[#111111] border border-[#222222] rounded-xl p-1">
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setStatusFilter(o.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                statusFilter === o.value
                  ? o.value === "do_not_contact"
                    ? "bg-red-400/20 text-red-400"
                    : "bg-[#38BDF8]/10 text-[#38BDF8]"
                  : "text-[#555555] hover:text-[#A0A0A0]"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1A1A1A]">
              {["Contact", "Company", "Type", "Tags", "Last contacted", ""].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-[10px] text-[#555555] uppercase tracking-wider font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-[#0D0D0D]">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3.5 bg-[#1A1A1A] rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-16">
                  <Users className="w-10 h-10 text-[#222222] mx-auto mb-3" />
                  <p className="text-sm text-[#555555]">No contacts found</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-3 text-xs text-[#38BDF8] hover:underline"
                  >
                    Add your first contact
                  </button>
                </td>
              </tr>
            ) : contacts.map(contact => (
              <ContactRow
                key={contact.id}
                contact={contact}
                onEdit={() => { setEditContact(contact); setShowCreate(true); }}
                onDelete={() => handleDelete(contact.id)}
                onUpdate={fetchContacts}
              />
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#1A1A1A]">
            <p className="text-xs text-[#555555]">
              Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-[#555555] px-2">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreate && (
        <CreateContactModal
          open={showCreate}
          contact={editContact}
          onClose={() => { setShowCreate(false); setEditContact(null); }}
          onSaved={fetchContacts}
        />
      )}
    </div>
  );
}
```

---

## FILE 6 — app/(app)/contacts/ContactRow.tsx

```tsx
"use client";
import { useState } from "react";
import { ExternalLink, Mail, Phone, MoreHorizontal, Edit2, Trash2,
         Ban, CheckCircle, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  client:          { label: "Client",          color: "text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/20" },
  hiring_manager:  { label: "Hiring Mgr",      color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  hr:              { label: "HR / Talent",      color: "text-green-400 bg-green-400/10 border-green-400/20" },
  agency:          { label: "Agency",           color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  other:           { label: "Other",            color: "text-[#555555] bg-[#1A1A1A] border-[#222222]" },
};

interface Props {
  contact:   any;
  onEdit:    () => void;
  onDelete:  () => void;
  onUpdate:  () => void;
}

export function ContactRow({ contact, onEdit, onDelete, onUpdate }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const type = TYPE_LABELS[contact.type] ?? TYPE_LABELS.other;

  const initials = (contact.full_name ?? "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const markDNC = async () => {
    const isDNC = contact.status === "do_not_contact";
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: isDNC ? "active" : "do_not_contact" }),
    });
    toast.success(isDNC ? "Contact re-activated" : "Marked as Do Not Contact");
    onUpdate();
    setMenuOpen(false);
  };

  return (
    <tr className={cn(
      "border-b border-[#0D0D0D] hover:bg-[#0D0D0D] transition-colors group",
      contact.status === "do_not_contact" && "opacity-50"
    )}>
      {/* Contact name + avatar */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1A1A1A] to-[#222222] border border-[#2A2A2A] flex items-center justify-center text-[11px] font-bold text-[#555555] flex-shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-[#FAFAFA]">{contact.full_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-[11px] text-[#555555] hover:text-[#38BDF8] transition-colors">
                  <Mail className="w-2.5 h-2.5" /> {contact.email}
                </a>
              )}
            </div>
          </div>
          {contact.status === "do_not_contact" && (
            <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded-md font-medium">
              DNC
            </span>
          )}
        </div>
      </td>

      {/* Company */}
      <td className="px-5 py-4">
        <p className="text-sm text-[#A0A0A0]">{contact.company ?? "—"}</p>
        {contact.job_title && <p className="text-[11px] text-[#555555] mt-0.5">{contact.job_title}</p>}
      </td>

      {/* Type badge */}
      <td className="px-5 py-4">
        <span className={cn("text-[10px] px-2 py-0.5 rounded-md border font-medium", type.color)}>
          {type.label}
        </span>
      </td>

      {/* Tags */}
      <td className="px-5 py-4">
        <div className="flex flex-wrap gap-1 max-w-[180px]">
          {(contact.tags ?? []).slice(0, 3).map((tag: string) => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] text-[#555555] border border-[#222222]">
              {tag}
            </span>
          ))}
          {(contact.tags ?? []).length > 3 && (
            <span className="text-[10px] text-[#333333]">+{contact.tags.length - 3}</span>
          )}
          {(contact.tags ?? []).length === 0 && (
            <span className="text-[11px] text-[#333333]">—</span>
          )}
        </div>
      </td>

      {/* Last contacted */}
      <td className="px-5 py-4">
        <p className="text-xs text-[#555555]">
          {contact.last_contacted_at
            ? new Date(contact.last_contacted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
            : "Never"}
        </p>
      </td>

      {/* Actions */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-[#111111] border border-[#222222] rounded-xl shadow-xl z-10 w-44 py-1 overflow-hidden">
                <button
                  onClick={markDNC}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                    contact.status === "do_not_contact"
                      ? "text-green-400 hover:bg-green-400/10"
                      : "text-red-400 hover:bg-red-400/10"
                  )}
                >
                  {contact.status === "do_not_contact"
                    ? <><CheckCircle className="w-3.5 h-3.5" /> Re-activate</>
                    : <><Ban className="w-3.5 h-3.5" /> Mark Do Not Contact</>
                  }
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#555555] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Archive contact
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
```

---

## FILE 7 — app/(app)/contacts/CreateContactModal.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { X, User, Building2, Mail, Phone, Linkedin, Tag, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS  = ["client","hiring_manager","hr","agency","other"];
const COMMON_TAGS   = ["Decision maker","Budget holder","Technical","Warm lead","Cold","Referred","VIP"];

interface Props {
  open:      boolean;
  contact:   any | null;
  onClose:   () => void;
  onSaved:   () => void;
}

export function CreateContactModal({ open, contact, onClose, onSaved }: Props) {
  const isEdit = !!contact?.id;
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const [form, setForm] = useState({
    full_name:    "", email: "", phone: "", linkedin_url: "",
    company: "", job_title: "", company_size: "", industry: "",
    city: "", country: "IN",
    type: "client", status: "active",
    tags: [] as string[], notes: "",
  });

  useEffect(() => {
    if (contact) {
      setForm({
        full_name: contact.full_name ?? "", email: contact.email ?? "",
        phone: contact.phone ?? "", linkedin_url: contact.linkedin_url ?? "",
        company: contact.company ?? "", job_title: contact.job_title ?? "",
        company_size: contact.company_size ?? "", industry: contact.industry ?? "",
        city: contact.city ?? "", country: contact.country ?? "IN",
        type: contact.type ?? "client", status: contact.status ?? "active",
        tags: contact.tags ?? [], notes: contact.notes ?? "",
      });
    } else {
      setForm({
        full_name: "", email: "", phone: "", linkedin_url: "",
        company: "", job_title: "", company_size: "", industry: "",
        city: "", country: "IN", type: "client", status: "active",
        tags: [], notes: "",
      });
    }
  }, [contact]);

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || form.tags.includes(t)) return;
    set("tags", [...form.tags, t]);
    setTagInput("");
  };
  const removeTag = (tag: string) => set("tags", form.tags.filter(t => t !== tag));

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const url    = isEdit ? `/api/contacts/${contact.id}` : "/api/contacts";
    const method = isEdit ? "PATCH" : "POST";
    const res    = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      if (data.code === "DUPLICATE_EMAIL") toast.error("A contact with this email already exists");
      else toast.error(data.error ?? "Failed to save");
      return;
    }
    toast.success(isEdit ? "Contact updated" : "Contact created");
    onSaved(); onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-xl shadow-2xl animate-scale-in max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">
            {isEdit ? "Edit contact" : "New contact"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                Full name *
              </label>
              <input value={form.full_name} onChange={e => set("full_name", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                placeholder="Ashish Jha" />
            </div>
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                Contact type
              </label>
              <select value={form.type} onChange={e => set("type", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#A0A0A0] focus:outline-none focus:border-[#38BDF8]/50 appearance-none">
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{t.replace("_", " ").replace(/\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
                <input value={form.email} onChange={e => set("email", e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                  placeholder="ashish@razorpay.com" type="email" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
                <input value={form.phone} onChange={e => set("phone", e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                  placeholder="+91 98765 43210" />
              </div>
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">LinkedIn URL</label>
            <div className="relative">
              <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
              <input value={form.linkedin_url} onChange={e => set("linkedin_url", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                placeholder="https://linkedin.com/in/ashishjha" />
            </div>
          </div>

          {/* Company + Job title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Company</label>
              <input value={form.company} onChange={e => set("company", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                placeholder="Razorpay" />
            </div>
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Job title</label>
              <input value={form.job_title} onChange={e => set("job_title", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                placeholder="VP Engineering" />
            </div>
          </div>

          {/* City + Country */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">City</label>
              <input value={form.city} onChange={e => set("city", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
                placeholder="Mumbai" />
            </div>
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Country</label>
              <select value={form.country} onChange={e => set("country", e.target.value)}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#A0A0A0] focus:outline-none focus:border-[#38BDF8]/50 appearance-none">
                <option value="IN">India</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="SG">Singapore</option>
                <option value="AE">UAE</option>
                <option value="AU">Australia</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-white transition-colors">×</button>
                </span>
              ))}
            </div>
            {/* Quick tag buttons */}
            <div className="flex flex-wrap gap-1 mb-2">
              {COMMON_TAGS.filter(t => !form.tags.includes(t)).map(t => (
                <button key={t} onClick={() => addTag(t)}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] text-[#555555] border border-[#222222] hover:text-[#A0A0A0] hover:border-[#333333] transition-all">
                  + {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
                placeholder="Add custom tag, press Enter"
                className="flex-1 bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              placeholder="Internal notes about this contact..."
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 resize-none transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#1A1A1A] flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#222222] text-sm text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.full_name.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] contacts table: full_name, email, phone, linkedin_url, company, job_title, type, status, tags[], notes
- [ ] FTS index on full_name + company + job_title for search
- [ ] RLS: org-scoped read/write
- [ ] GET /api/contacts: search (q), type filter, status filter, tag filter, pagination (50/page)
- [ ] POST /api/contacts: duplicate email check (409 DUPLICATE_EMAIL)
- [ ] PATCH /api/contacts/[id]: partial update
- [ ] DELETE /api/contacts/[id]: soft delete (is_archived = true)
- [ ] ContactsClientPage: search + type + status filter bar, paginated table
- [ ] ContactRow: initials avatar, DNC badge, hover action buttons, mark DNC from menu
- [ ] CreateContactModal: name/type/email/phone/linkedin/company/city, tag chips, common tag shortcuts, notes
- [ ] "Import" button in header links to /contacts/import (built in 03-contact-import.md)

## BUILD LOG ENTRY
## M08-01 Contacts Page — [date]
### Files: contacts SQL, contacts API (GET/POST/PATCH/DELETE), ContactsClientPage, ContactRow, CreateContactModal
### Status: ✅ Complete
