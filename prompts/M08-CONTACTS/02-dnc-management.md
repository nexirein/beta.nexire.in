<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/contacts.md        ← this module's API contract
-->

# M08 — TASK 02: DNC MANAGEMENT
# Trae: Read CLAUDE.md first.
# The Do Not Contact (DNC) list is a legal compliance tool.
# Any email or phone number on the DNC list must NEVER receive
# outreach from Nexire sequences or manual sends.
# Checked at sequence enroll time AND at cron send time.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build DNC management:
1. dnc_list table (org-level + global)
2. GET /api/dnc — list DNC entries with pagination
3. POST /api/dnc — add email/phone to DNC
4. DELETE /api/dnc/[id] — remove from DNC
5. POST /api/dnc/check — bulk check if emails/phones are on DNC (used internally)
6. DNCPage — management UI at /settings/dnc
7. Wire DNC check into sequence enrollment + cron send

---

## FILE 1 — Supabase SQL: dnc_list table

```sql
CREATE TABLE dnc_list (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES orgs(id) ON DELETE CASCADE,
  -- org_id = NULL means global DNC (admin-managed, applies to all orgs)

  type         TEXT NOT NULL CHECK (type IN ('email', 'phone', 'domain')),
  value        TEXT NOT NULL,            -- normalized: lowercase email / E.164 phone / domain
  reason       TEXT,                     -- "Unsubscribed", "Legal request", "Bounced", "Manual"
  source       TEXT DEFAULT 'manual'     -- "manual", "unsubscribe_link", "bounce", "complaint", "import"
               CHECK (source IN ('manual','unsubscribe_link','bounce','complaint','import')),

  added_by     UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Composite unique: value + org_id (allow same email on multiple org DNC lists)
CREATE UNIQUE INDEX idx_dnc_org_value ON dnc_list(coalesce(org_id::TEXT, 'global'), type, lower(value));
CREATE INDEX idx_dnc_value ON dnc_list(lower(value));
CREATE INDEX idx_dnc_org   ON dnc_list(org_id);

-- RLS
ALTER TABLE dnc_list ENABLE ROW LEVEL SECURITY;

-- Org members can read/write own org DNC
CREATE POLICY "Org members manage own DNC"
  ON dnc_list
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()) OR org_id IS NULL)
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Global DNC (org_id IS NULL) visible to all but only writable by service role
```

---

## FILE 2 — lib/compliance/dnc-check.ts  (core DNC guard — used everywhere)

```typescript
import { createServiceClient } from "@/lib/supabase/service";

export interface DNCResult {
  blocked:   boolean;
  reason?:   string;
  source?:   string;
  matched?:  string;  // which value matched (email/domain/phone)
}

/**
 * Checks if a given email (or phone) is on the DNC list for an org.
 * Also checks global DNC and domain-level blocks.
 */
export async function checkDNC(orgId: string, email?: string, phone?: string): Promise<DNCResult> {
  if (!email && !phone) return { blocked: false };

  const supabase = createServiceClient();
  const checks: string[] = [];

  if (email) {
    const normalized = email.toLowerCase().trim();
    const domain     = normalized.split("@")[1];
    checks.push(normalized);
    if (domain) checks.push(domain);
  }
  if (phone) checks.push(phone.trim());

  const { data } = await supabase
    .from("dnc_list")
    .select("id, type, value, reason, source")
    .or(`org_id.eq.${orgId},org_id.is.null`)   // org-specific + global
    .in("value", checks.map(v => v.toLowerCase()));

  if (!data?.length) return { blocked: false };

  const match = data[0];
  return {
    blocked: true,
    reason:  match.reason ?? "Do Not Contact",
    source:  match.source,
    matched: match.value,
  };
}

/**
 * Bulk check — returns a Set of blocked emails/phones for performance
 * (used in sequence cron to pre-filter batch of 100)
 */
export async function bulkCheckDNC(orgId: string, emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();

  const supabase   = createServiceClient();
  const normalized = emails.map(e => e.toLowerCase().trim());
  const domains    = normalized.map(e => e.split("@")[1]).filter(Boolean);
  const allChecks  = [...new Set([...normalized, ...domains])];

  const { data } = await supabase
    .from("dnc_list")
    .select("value")
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .in("value", allChecks);

  const blocked = new Set((data ?? []).map(d => d.value.toLowerCase()));

  // Map back to original emails
  return new Set(normalized.filter(email => {
    const domain = email.split("@")[1];
    return blocked.has(email) || (domain && blocked.has(domain));
  }));
}

/**
 * Auto-add to DNC (called from webhook handlers for bounces/unsubscribes)
 */
export async function addToDNC(params: {
  orgId:   string;
  value:   string;
  type:    "email" | "phone" | "domain";
  reason:  string;
  source:  "bounce" | "complaint" | "unsubscribe_link" | "manual" | "import";
  addedBy?: string;
}) {
  const supabase = createServiceClient();
  await supabase
    .from("dnc_list")
    .upsert({
      org_id:   params.orgId,
      type:     params.type,
      value:    params.value.toLowerCase().trim(),
      reason:   params.reason,
      source:   params.source,
      added_by: params.addedBy ?? null,
    }, { onConflict: "idx_dnc_org_value", ignoreDuplicates: true });
}
```

---

## FILE 3 — app/api/dnc/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const DNCSchema = z.object({
  value:  z.string().min(1).max(500),
  type:   z.enum(["email","phone","domain"]),
  reason: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q      = searchParams.get("q") ?? "";
  const type   = searchParams.get("type") ?? "";
  const source = searchParams.get("source") ?? "";
  const page   = Number(searchParams.get("page") ?? 1);
  const limit  = 50;

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  let query = supabase
    .from("dnc_list")
    .select("id, type, value, reason, source, created_at, added_by", { count: "exact" })
    .or(`org_id.eq.${profile?.org_id},org_id.is.null`)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (q)      query = query.ilike("value", `%${q}%`);
  if (type)   query = query.eq("type", type);
  if (source) query = query.eq("source", source);

  const { data, count } = await query;
  return NextResponse.json({ entries: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = DNCSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const normalized = parsed.data.value.toLowerCase().trim();

  const { error: upsertError } = await supabase
    .from("dnc_list")
    .upsert({
      org_id:   profile?.org_id,
      type:     parsed.data.type,
      value:    normalized,
      reason:   parsed.data.reason ?? "Manual — added by recruiter",
      source:   "manual",
      added_by: user.id,
    }, { onConflict: "idx_dnc_org_value", ignoreDuplicates: false });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  // Also mark any matching contacts as do_not_contact
  if (parsed.data.type === "email") {
    await supabase
      .from("contacts")
      .update({ status: "do_not_contact", updated_at: new Date().toISOString() })
      .eq("org_id", profile?.org_id)
      .eq("email", normalized)
      .neq("status", "do_not_contact");
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
```

---

## FILE 4 — app/api/dnc/[id]/route.ts  (DELETE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  // Can only remove own org's DNC entries (not global)
  const { error: deleteError } = await supabase
    .from("dnc_list")
    .delete()
    .eq("id", params.id)
    .eq("org_id", profile?.org_id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

---

## FILE 5 — app/api/dnc/check/route.ts  (internal — check if email is blocked)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkCheckDNC } from "@/lib/compliance/dnc-check";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { emails } = await req.json();
  if (!Array.isArray(emails)) return NextResponse.json({ error: "emails must be an array" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const blocked = await bulkCheckDNC(profile?.org_id, emails);
  return NextResponse.json({ blocked: Array.from(blocked) });
}
```

---

## FILE 6 — app/(app)/settings/dnc/page.tsx  (DNC management UI)

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { Shield, Plus, Search, Trash2, Ban, Mail, Phone,
         Globe, AlertTriangle, Upload, ChevronLeft, ChevronRight,
         Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manual:           { label: "Manual",       color: "text-[#555555] bg-[#1A1A1A] border-[#222222]" },
  unsubscribe_link: { label: "Unsubscribed",  color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  bounce:           { label: "Bounced",       color: "text-red-400 bg-red-400/10 border-red-400/20" },
  complaint:        { label: "Spam report",   color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  import:           { label: "Imported",      color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  email:  Mail,
  phone:  Phone,
  domain: Globe,
};

export default function DNCPage() {
  const [entries, setEntries]     = useState<any[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAdd, setShowAdd]     = useState(false);
  const [newEntry, setNewEntry]   = useState({ value: "", type: "email", reason: "" });
  const [adding, setAdding]       = useState(false);
  const debouncedQ                = useDebounce(q, 300);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      ...(debouncedQ && { q: debouncedQ }),
      ...(typeFilter && { type: typeFilter }),
    });
    const res  = await fetch(`/api/dnc?${params}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, debouncedQ, typeFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { setPage(1); }, [debouncedQ, typeFilter]);

  const addEntry = async () => {
    if (!newEntry.value.trim()) return;
    setAdding(true);
    const res = await fetch("/api/dnc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEntry),
    });
    setAdding(false);
    if (!res.ok) { toast.error("Failed to add entry"); return; }
    toast.success("Added to DNC list");
    setShowAdd(false);
    setNewEntry({ value: "", type: "email", reason: "" });
    fetchEntries();
  };

  const removeEntry = async (id: string, value: string) => {
    if (!confirm(`Remove "${value}" from DNC list? They may receive outreach again.`)) return;
    await fetch(`/api/dnc/${id}`, { method: "DELETE" });
    toast.success("Removed from DNC list");
    fetchEntries();
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#FAFAFA]">Do Not Contact List</h1>
            <p className="text-xs text-[#555555] mt-0.5">
              {total.toLocaleString()} entr{total !== 1 ? "ies" : "y"} · Sequences will never email contacts on this list
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-400/10 border border-red-400/20 text-sm text-red-400 hover:bg-red-400/20 transition-all"
        >
          <Plus className="w-4 h-4" /> Add entry
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-[#111111] border border-[#222222] rounded-2xl px-4 py-3.5 mb-5">
        <Info className="w-4 h-4 text-[#555555] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#555555] leading-relaxed">
          Emails and phone numbers on this list are <span className="text-[#A0A0A0] font-medium">automatically skipped</span> by all sequences and outreach.
          Entries are added automatically when a candidate unsubscribes, reports spam, or bounces.
          You can also add entries manually for legal or compliance reasons.
        </div>
      </div>

      {/* Add entry form */}
      {showAdd && (
        <div className="bg-[#111111] border border-red-400/20 rounded-2xl p-4 mb-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">Add DNC entry</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Type</label>
              <select
                value={newEntry.type}
                onChange={e => setNewEntry(n => ({ ...n, type: e.target.value }))}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#A0A0A0] focus:outline-none focus:border-red-400/50 appearance-none"
              >
                <option value="email">Email address</option>
                <option value="phone">Phone number</option>
                <option value="domain">Domain (e.g. company.com)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">
                {newEntry.type === "email" ? "Email" : newEntry.type === "phone" ? "Phone" : "Domain"}
              </label>
              <input
                value={newEntry.value}
                onChange={e => setNewEntry(n => ({ ...n, value: e.target.value }))}
                placeholder={newEntry.type === "email" ? "user@example.com" : newEntry.type === "phone" ? "+91 98765 43210" : "company.com"}
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-red-400/50 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Reason (optional)</label>
              <input
                value={newEntry.reason}
                onChange={e => setNewEntry(n => ({ ...n, reason: e.target.value }))}
                placeholder="e.g. Legal request"
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-red-400/50 transition-all"
              />
            </div>
          </div>
          {newEntry.type === "domain" && (
            <div className="flex items-start gap-2 bg-orange-400/10 border border-orange-400/20 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-400">
                Blocking a domain will block ALL email addresses at that domain. Use with caution.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={addEntry}
              disabled={!newEntry.value.trim() || adding}
              className="px-4 py-2.5 rounded-xl bg-red-400/10 border border-red-400/20 text-sm text-red-400 hover:bg-red-400/20 disabled:opacity-50 transition-all"
            >
              {adding ? "Adding..." : "Add to DNC"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2.5 rounded-xl border border-[#222222] text-sm text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search email, domain..."
            className="w-full bg-[#111111] border border-[#222222] rounded-xl pl-8 pr-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#111111] border border-[#222222] rounded-xl p-1">
          {["", "email", "phone", "domain"].map(t => (
            <button key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                typeFilter === t ? "bg-[#38BDF8]/10 text-[#38BDF8]" : "text-[#555555] hover:text-[#A0A0A0]"
              )}
            >
              {t === "" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1A1A1A]">
              {["Type", "Value", "Reason", "Source", "Added", ""].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-[10px] text-[#555555] uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-[#0D0D0D]">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-3.5 bg-[#1A1A1A] rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12">
                  <Shield className="w-8 h-8 text-[#222222] mx-auto mb-2" />
                  <p className="text-xs text-[#555555]">No DNC entries yet</p>
                </td>
              </tr>
            ) : entries.map(entry => {
              const TypeIcon = TYPE_ICONS[entry.type] ?? Mail;
              const src      = SOURCE_LABELS[entry.source] ?? SOURCE_LABELS.manual;
              return (
                <tr key={entry.id} className="border-b border-[#0D0D0D] hover:bg-[#0D0D0D] transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <TypeIcon className="w-3.5 h-3.5 text-[#555555]" />
                      <span className="text-xs text-[#555555] capitalize">{entry.type}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-[#A0A0A0]">{entry.value}</td>
                  <td className="px-5 py-4 text-xs text-[#555555] max-w-[180px] truncate">{entry.reason ?? "—"}</td>
                  <td className="px-5 py-4">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-md border font-medium", src.color)}>
                      {src.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#555555]">
                    {new Date(entry.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-4">
                    {entry.source === "manual" || entry.source === "import" ? (
                      <button
                        onClick={() => removeEntry(entry.id, entry.value)}
                        className="p-1.5 rounded-lg text-[#333333] hover:text-[#EF4444] hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove from DNC"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-[#333333]">Auto</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#1A1A1A]">
            <p className="text-xs text-[#555555]">{total} total entries</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg text-[#555555] hover:bg-[#1A1A1A] disabled:opacity-30 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-[#555555] px-2">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg text-[#555555] hover:bg-[#1A1A1A] disabled:opacity-30 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## FILE 7 — Wire DNC into sequence cron (add to cron-processor.ts)

In `lib/sequences/cron-processor.ts`, inside the `sendPendingEmails()` loop, add before sending:

```typescript
import { checkDNC } from "@/lib/compliance/dnc-check";

// Inside the for loop, before sendSequenceEmail:
const dncResult = await checkDNC(enrollment.org_id, candidate.email);
if (dncResult.blocked) {
  console.log(`[CRON] DNC block: ${candidate.email} — ${dncResult.reason}`);
  await markEnrollment(supabase, enrollment.id, "stopped", {
    notes: `DNC: ${dncResult.reason}`,
  });
  result.skipped++;
  continue;
}
```

---

## FILE 8 — Wire DNC into sequence enrollment (add to enroll API)

In `app/api/sequences/[id]/enroll/route.ts`, add check before inserting enrollment:

```typescript
import { checkDNC } from "@/lib/compliance/dnc-check";

// For each candidate being enrolled, before insert:
const dncCheck = await checkDNC(orgId, candidate.email, candidate.phone);
if (dncCheck.blocked) {
  skipped.push({ candidate_id: c.candidate_id, reason: `DNC: ${dncCheck.reason}` });
  continue;
}
```

Return skipped list in the API response so recruiter knows who was blocked.

---

## FILE 9 — Auto-add bounces + unsubscribes to DNC (webhook-handlers.ts update)

In `lib/sequences/webhook-handlers.ts`, update `handleEmailBounced`:

```typescript
import { addToDNC } from "@/lib/compliance/dnc-check";

// In handleEmailBounced, after marking enrollment stopped:
if (candidate?.email && enrollment?.org_id) {
  await addToDNC({
    orgId:   enrollment.org_id,
    value:   candidate.email,
    type:    "email",
    reason:  "Hard bounce",
    source:  "bounce",
  });
}
```

And in the unsubscribe route (`/api/unsubscribe/[token]/route.ts`):
```typescript
// After marking enrollment unsubscribed, also add to DNC:
const { data: enrollment } = await supabase
  .from("sequence_enrollments")
  .select("org_id, candidates:candidate_id(email)")
  .eq("id", enrollmentId).single();

if (enrollment?.org_id && (enrollment.candidates as any)?.email) {
  await addToDNC({
    orgId:  enrollment.org_id,
    value:  (enrollment.candidates as any).email,
    type:   "email",
    reason: "Unsubscribed via email link",
    source: "unsubscribe_link",
  });
}
```

---

## COMPLETION CHECKLIST
- [ ] dnc_list table: org_id (nullable for global), type, value (normalized), reason, source
- [ ] UNIQUE index: (coalesce(org_id, 'global'), type, lower(value))
- [ ] lib/compliance/dnc-check.ts: checkDNC(), bulkCheckDNC(), addToDNC()
- [ ] GET /api/dnc: search + type filter + pagination
- [ ] POST /api/dnc: manual add, auto-syncs matching contacts to do_not_contact status
- [ ] DELETE /api/dnc/[id]: only manual/import entries removable (auto entries cannot be removed)
- [ ] POST /api/dnc/check: bulk check endpoint
- [ ] DNCPage /settings/dnc: add form with domain warning, table with source badges
- [ ] Manual/Import entries: show Trash icon; Auto entries (bounce/complaint/unsubscribe): show "Auto" label
- [ ] Cron processor: DNC check before each send — marks enrollment "stopped" if blocked
- [ ] Sequence enroll: DNC check before each candidate — returns skipped[] with reasons
- [ ] Webhook bounce: auto-add email to DNC (source: bounce)
- [ ] Unsubscribe link: auto-add email to DNC (source: unsubscribe_link)
- [ ] Domain blocking: blocks ALL emails at that domain (checked via email.split('@')[1])

## BUILD LOG ENTRY
## M08-02 DNC Management — [date]
### Files: dnc_list SQL, dnc-check.ts, DNC API, DNCPage, cron wiring, webhook wiring
### Status: ✅ Complete
