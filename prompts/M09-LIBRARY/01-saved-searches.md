<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/library.md         ← this module's API contract
-->

# M09 — TASK 01: SAVED SEARCHES
# Trae: Read CLAUDE.md first.
# Recruiters run the same searches repeatedly — "Senior React engineers in Bangalore",
# "FinTech PMs with Series B experience". Saved Searches lets them bookmark any
# search query + filter state with one click, then re-run with fresh results anytime.
# Shows result delta ("12 new candidates since last run").
# Route: /library/saved-searches
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build Saved Searches:
1. saved_searches table (DB schema + RLS)
2. POST /api/saved-searches — save current search state
3. GET /api/saved-searches — list all saved searches
4. PATCH /api/saved-searches/[id] — rename / update
5. DELETE /api/saved-searches/[id] — delete
6. POST /api/saved-searches/[id]/run — re-run search, update last_run + new_count
7. SavedSearchesPage at /library/saved-searches
8. "Save search" button wired into M03 SearchPage
9. SavedSearchCard with new-count badge + quick-run

---

## FILE 1 — Supabase SQL: saved_searches table

```sql
CREATE TABLE saved_searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id),

  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description     TEXT CHECK (char_length(description) <= 500),

  -- Serialized search state (mirrors M03 SearchFilters type)
  query           TEXT DEFAULT '',
  filters         JSONB NOT NULL DEFAULT '{}',
  -- filters shape: { roles, skills, locations, experience_min, experience_max,
  --                  company_types, education, salary_min, salary_max,
  --                  availability, languages, boolean_query }

  -- Run tracking
  last_run_at     TIMESTAMPTZ,
  last_run_count  INTEGER DEFAULT 0,    -- total results on last run
  new_since_last  INTEGER DEFAULT 0,    -- candidates added to index since last run
  total_runs      INTEGER DEFAULT 0,

  -- Sharing
  is_shared       BOOLEAN DEFAULT FALSE, -- visible to all org members
  shared_by       UUID REFERENCES auth.users(id),

  -- Notifications
  notify_on_new   BOOLEAN DEFAULT FALSE, -- email recruiter when new matches appear
  notify_threshold INTEGER DEFAULT 5,    -- minimum new candidates to trigger email

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_org ON saved_searches(org_id, created_at DESC);
CREATE INDEX idx_saved_searches_user ON saved_searches(created_by, updated_at DESC);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read org searches"
  ON saved_searches FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Members write own searches"
  ON saved_searches FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON saved_searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## FILE 2 — app/api/saved-searches/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const SaveSchema = z.object({
  name:             z.string().min(1).max(200),
  description:      z.string().max(500).optional(),
  query:            z.string().default(""),
  filters:          z.record(z.any()).default({}),
  is_shared:        z.boolean().default(false),
  notify_on_new:    z.boolean().default(false),
  notify_threshold: z.number().int().min(1).default(5),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "true";

  let query = supabase
    .from("saved_searches")
    .select("id, name, description, query, filters, last_run_at, last_run_count, new_since_last, total_runs, is_shared, notify_on_new, created_by, created_at")
    .order("updated_at", { ascending: false });

  if (mine) query = query.eq("created_by", user.id);

  const { data } = await query;
  return NextResponse.json({ saved_searches: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = SaveSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data, error: insertError } = await supabase
    .from("saved_searches")
    .insert({ ...parsed.data, org_id: profile?.org_id, created_by: user.id })
    .select("id, name")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

---

## FILE 3 — app/api/saved-searches/[id]/route.ts  (PATCH + DELETE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["name","description","filters","query","is_shared","notify_on_new","notify_threshold"];
  const update  = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { error: updateError } = await supabase
    .from("saved_searches")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("created_by", user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("saved_searches")
    .delete()
    .eq("id", params.id)
    .eq("created_by", user.id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 4 — app/api/saved-searches/[id]/run/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSearchQuery } from "@/lib/search/query-builder";  // from M03

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the saved search
  const { data: saved } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Execute the search using M03 builder
  const searchResult = await buildSearchQuery({
    query:   saved.query,
    filters: saved.filters,
    page:    1,
    limit:   20,
    orgId:   saved.org_id,
  });

  const newCount   = searchResult.total;
  const newSince   = Math.max(0, newCount - (saved.last_run_count ?? 0));

  // Update run stats
  await supabase
    .from("saved_searches")
    .update({
      last_run_at:    new Date().toISOString(),
      last_run_count: newCount,
      new_since_last: newSince,
      total_runs:     (saved.total_runs ?? 0) + 1,
      updated_at:     new Date().toISOString(),
    })
    .eq("id", params.id);

  // Optionally create a notification if new candidates found + notify_on_new enabled
  if (saved.notify_on_new && newSince >= (saved.notify_threshold ?? 5)) {
    await supabase.from("notifications").insert({
      user_id:  saved.created_by,
      type:     "saved_search_new",
      title:    `${newSince} new candidates for "${saved.name}"`,
      body:     `Your saved search has ${newSince} new matching candidates.`,
      metadata: { saved_search_id: saved.id },
    });
  }

  return NextResponse.json({
    candidates: searchResult.results,
    total:      newCount,
    new_since:  newSince,
  });
}
```

---

## FILE 5 — app/(app)/library/saved-searches/page.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import { Bookmark, Search, Play, Trash2, Edit2, Share2,
         Bell, BellOff, ChevronRight, Users, Clock,
         Sparkles, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { RenameModal } from "./RenameModal";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never run";
  const diff  = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(hours / 24);
  if (hours < 1)  return "Just now";
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function SavedSearchesPage() {
  const router = useRouter();
  const [searches, setSearches] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState<string | null>(null);
  const [editSearch, setEditSearch] = useState<any | null>(null);
  const [filter, setFilter]     = useState<"all" | "mine" | "shared">("all");

  const fetchSearches = async () => {
    setLoading(true);
    const params = filter === "mine" ? "?mine=true" : "";
    const res    = await fetch(`/api/saved-searches${params}`);
    const data   = await res.json();
    let list     = data.saved_searches ?? [];
    if (filter === "shared") list = list.filter((s: any) => s.is_shared);
    setSearches(list);
    setLoading(false);
  };

  useEffect(() => { fetchSearches(); }, [filter]);

  const runSearch = async (search: any) => {
    setRunning(search.id);
    const res  = await fetch(`/api/saved-searches/${search.id}/run`, { method: "POST" });
    const data = await res.json();
    setRunning(null);
    if (!res.ok) { toast.error("Failed to run search"); return; }

    toast.success(
      data.new_since > 0
        ? `${data.new_since} new candidates found!`
        : `${data.total} candidates — no new since last run`,
      { duration: 4000 }
    );

    // Navigate to search page with the saved filters pre-applied
    const params = new URLSearchParams({
      saved: search.id,
      q:     search.query ?? "",
    });
    router.push(`/search?${params}`);
  };

  const deleteSearch = async (id: string) => {
    if (!confirm("Delete this saved search?")) return;
    await fetch(`/api/saved-searches/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    fetchSearches();
  };

  const toggleNotify = async (search: any) => {
    await fetch(`/api/saved-searches/${search.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ notify_on_new: !search.notify_on_new }),
    });
    fetchSearches();
  };

  const toggleShare = async (search: any) => {
    await fetch(`/api/saved-searches/${search.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_shared: !search.is_shared }),
    });
    toast.success(search.is_shared ? "Search made private" : "Search shared with team");
    fetchSearches();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-[#38BDF8]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#FAFAFA]">Saved Searches</h1>
            <p className="text-xs text-[#555555] mt-0.5">{searches.length} saved · Click to re-run with fresh results</p>
          </div>
        </div>
        <a
          href="/search"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
        >
          <Search className="w-4 h-4" /> New search
        </a>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-[#111111] border border-[#1A1A1A] rounded-xl p-1 w-fit mb-5">
        {(["all","mine","shared"] as const).map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-medium transition-all capitalize",
              filter === f ? "bg-[#38BDF8]/10 text-[#38BDF8]" : "text-[#555555] hover:text-[#A0A0A0]"
            )}
          >
            {f === "all" ? "All searches" : f === "mine" ? "My searches" : "Shared with team"}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-[#111111] border border-[#1A1A1A] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : searches.length === 0 ? (
        <div className="text-center py-20">
          <Bookmark className="w-10 h-10 text-[#222222] mx-auto mb-3" />
          <p className="text-sm text-[#555555] mb-1">No saved searches yet</p>
          <p className="text-xs text-[#333333]">Run a search and click "Save search" to bookmark it here</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {searches.map(s => (
            <SavedSearchCard
              key={s.id}
              search={s}
              running={running === s.id}
              onRun={() => runSearch(s)}
              onDelete={() => deleteSearch(s.id)}
              onEdit={() => setEditSearch(s)}
              onToggleNotify={() => toggleNotify(s)}
              onToggleShare={() => toggleShare(s)}
            />
          ))}
        </div>
      )}

      {editSearch && (
        <RenameModal
          search={editSearch}
          onClose={() => setEditSearch(null)}
          onSaved={fetchSearches}
        />
      )}
    </div>
  );
}

// ── SavedSearchCard ──────────────────────────────────────────

interface CardProps {
  search:          any;
  running:         boolean;
  onRun:           () => void;
  onDelete:        () => void;
  onEdit:          () => void;
  onToggleNotify:  () => void;
  onToggleShare:   () => void;
}

function SavedSearchCard({ search, running, onRun, onDelete, onEdit, onToggleNotify, onToggleShare }: CardProps) {
  const activeFilters = Object.entries(search.filters ?? {})
    .filter(([, v]) => (Array.isArray(v) ? (v as any[]).length > 0 : !!v))
    .slice(0, 4);

  return (
    <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl px-5 py-4 hover:border-[#222222] transition-all group">
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">{search.name}</h3>
            {search.is_shared && (
              <span className="text-[9px] text-purple-400 bg-purple-400/10 border border-purple-400/20 px-1.5 py-0.5 rounded-md font-medium flex-shrink-0">
                Shared
              </span>
            )}
            {search.notify_on_new && (
              <span className="text-[9px] text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-md font-medium flex-shrink-0">
                Alerts on
              </span>
            )}
          </div>

          {search.description && (
            <p className="text-xs text-[#555555] mb-2">{search.description}</p>
          )}

          {/* Query preview */}
          {search.query && (
            <div className="flex items-center gap-1.5 mb-2">
              <Search className="w-3 h-3 text-[#333333]" />
              <span className="text-xs text-[#555555] font-mono truncate max-w-xs">"{search.query}"</span>
            </div>
          )}

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeFilters.map(([key, value]) => (
                <span key={key} className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] border border-[#222222] text-[#555555]">
                  {key.replace(/_/g, " ")}: {Array.isArray(value) ? (value as string[]).join(", ") : String(value)}
                </span>
              ))}
              {Object.entries(search.filters ?? {}).filter(([, v]) => Array.isArray(v) ? (v as any[]).length > 0 : !!v).length > 4 && (
                <span className="text-[10px] text-[#333333]">+{Object.entries(search.filters).filter(([, v]) => Array.isArray(v) ? (v as any[]).length > 0 : !!v).length - 4} more</span>
              )}
            </div>
          )}
        </div>

        {/* Right — stats + actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {/* New count badge */}
          {(search.new_since_last ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 bg-[#38BDF8]/10 border border-[#38BDF8]/20 rounded-xl px-2.5 py-1">
              <Sparkles className="w-3 h-3 text-[#38BDF8]" />
              <span className="text-xs font-bold text-[#38BDF8]">{search.new_since_last} new</span>
            </div>
          )}
          {/* Stats */}
          <div className="flex items-center gap-3 text-[11px] text-[#555555]">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {search.last_run_count ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeAgo(search.last_run_at)}
            </span>
          </div>
          {/* Run button */}
          <button
            onClick={onRun}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-xs font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] disabled:opacity-60 transition-all"
          >
            {running
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running...</>
              : <><Play className="w-3.5 h-3.5" /> Run</>}
          </button>
        </div>
      </div>

      {/* Bottom action bar — visible on hover */}
      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-[#1A1A1A] opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
          <Edit2 className="w-3 h-3" /> Rename
        </button>
        <button onClick={onToggleShare}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-purple-400 hover:bg-purple-400/10 transition-all">
          <Share2 className="w-3 h-3" /> {search.is_shared ? "Unshare" : "Share with team"}
        </button>
        <button onClick={onToggleNotify}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all",
            search.notify_on_new
              ? "text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20"
              : "text-[#555555] hover:text-yellow-400 hover:bg-yellow-400/10"
          )}>
          {search.notify_on_new ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
          {search.notify_on_new ? "Alerts on" : "Alert me"}
        </button>
        <button onClick={onDelete}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-red-400 hover:bg-red-400/10 transition-all ml-auto">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  );
}
```

---

## FILE 6 — app/(app)/library/saved-searches/RenameModal.tsx

```tsx
"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

interface Props { search: any; onClose: () => void; onSaved: () => void; }

export function RenameModal({ search, onClose, onSaved }: Props) {
  const [name, setName] = useState(search.name);
  const [desc, setDesc] = useState(search.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/saved-searches/${search.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc }),
    });
    setSaving(false);
    toast.success("Updated");
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Rename search</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"><X className="w-4 h-4" /></button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Search name"
          className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all" />
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Description (optional)"
          className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 resize-none transition-all" />
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#222222] text-sm text-[#555555] hover:text-[#A0A0A0] transition-all">Cancel</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium disabled:opacity-50 transition-all">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 7 — Wire "Save search" button into M03 SearchPage

In `app/(app)/search/SearchClientPage.tsx`, add inside the search bar row:

```tsx
import { Bookmark, BookmarkCheck } from "lucide-react";
import { SaveSearchModal } from "./SaveSearchModal";

// Add state:
const [showSave, setShowSave] = useState(false);

// Add button next to the search bar (right side):
<button
  onClick={() => setShowSave(true)}
  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#222222] text-xs text-[#555555] hover:text-[#38BDF8] hover:border-[#38BDF8]/30 transition-all flex-shrink-0"
  title="Save this search"
>
  <Bookmark className="w-3.5 h-3.5" /> Save
</button>

// Add modal:
{showSave && (
  <SaveSearchModal
    query={query}
    filters={activeFilters}
    onClose={() => setShowSave(false)}
  />
)}
```

---

## FILE 8 — components/search/SaveSearchModal.tsx

```tsx
"use client";
import { useState } from "react";
import { Bookmark, X, Bell } from "lucide-react";
import { toast } from "sonner";

interface Props {
  query:    string;
  filters:  Record<string, any>;
  onClose:  () => void;
}

export function SaveSearchModal({ query, filters, onClose }: Props) {
  const [name, setName]         = useState(query ? `"${query}"` : "");
  const [notifyOnNew, setNotify] = useState(false);
  const [saving, setSaving]     = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    const res = await fetch("/api/saved-searches", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, query, filters, notify_on_new: notifyOnNew }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save"); return; }
    toast.success("Search saved to Library");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#38BDF8]" />
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Save search</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all"><X className="w-4 h-4" /></button>
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Senior React Engineers — Bangalore"
          className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
          autoFocus
        />
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => setNotify(!notifyOnNew)}
            className={`w-10 h-5 rounded-full transition-all flex-shrink-0 ${notifyOnNew ? "bg-[#38BDF8]" : "bg-[#222222]"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow mt-0.5 transition-all ${notifyOnNew ? "ml-5.5" : "ml-0.5"}`} />
          </div>
          <div>
            <p className="text-xs text-[#A0A0A0] font-medium">Alert me on new matches</p>
            <p className="text-[10px] text-[#555555]">Get a notification when 5+ new candidates match</p>
          </div>
        </label>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#222222] text-sm text-[#555555] hover:text-[#A0A0A0] transition-all">Cancel</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium disabled:opacity-50 transition-all">
            {saving ? "Saving..." : "Save search"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] saved_searches table: name, description, query, filters (JSONB), last_run_at, last_run_count, new_since_last, total_runs
- [ ] is_shared, notify_on_new, notify_threshold fields
- [ ] RLS: org members can read all (incl. shared); only creator can write/delete
- [ ] GET /api/saved-searches: list with ?mine=true filter
- [ ] POST /api/saved-searches: create with filters JSONB
- [ ] PATCH /api/saved-searches/[id]: whitelist allowed fields
- [ ] DELETE /api/saved-searches/[id]: creator only
- [ ] POST /api/saved-searches/[id]/run: re-executes search, computes new_since_last, creates notification if notify_on_new + threshold met
- [ ] SavedSearchesPage: All / Mine / Shared tabs, card grid
- [ ] SavedSearchCard: "N new" badge (blue sparkle), run button + loading state, filter pills preview
- [ ] Hover action bar: Rename, Share with team, Alert me, Delete
- [ ] RenameModal: name + description fields
- [ ] "Save search" button added to M03 SearchClientPage search bar
- [ ] SaveSearchModal: name pre-filled from query, toggle alert, saves via API
- [ ] Notification type "saved_search_new" handled by NotificationDropdown (M07/05)

## BUILD LOG ENTRY
## M09-01 Saved Searches — [date]
### Files: saved_searches SQL, CRUD API, run API, SavedSearchesPage, SavedSearchCard, RenameModal, SaveSearchModal, SearchPage wire-in
### Status: ✅ Complete
