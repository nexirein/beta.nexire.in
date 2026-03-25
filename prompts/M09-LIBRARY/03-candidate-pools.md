<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/library.md         ← this module's API contract
-->

# M09 — TASK 03: CANDIDATE POOLS  [ADDED — essential library feature]
# Trae: Read CLAUDE.md first.
# Talent Pools are curated groups of candidates not tied to a specific project —
# "Dream FinTech Engineers", "Bangalore iOS Bench", "Ex-Zomato Alumni".
# Recruiters build these over time and tap them first when a new role opens.
# Different from shortlists (project-specific). Pools are evergreen.
# Route: /library/pools
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build Talent Pools:
1. talent_pools + pool_candidates tables
2. Full CRUD API for pools and pool membership
3. PoolsPage at /library/pools — grid of pool cards
4. PoolDetailPage — candidate list within a pool
5. AddToPoolModal — add candidate to pool from anywhere (search, shortlist, rediscovery)
6. "Add to pool" button wired into CandidateCard (M03) and RediscoveryResultCard (M09/02)

---

## FILE 1 — Supabase SQL

```sql
CREATE TABLE talent_pools (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id),

  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description  TEXT CHECK (char_length(description) <= 1000),
  emoji        TEXT DEFAULT '🎯',   -- pool icon (emoji)
  color        TEXT DEFAULT '#38BDF8', -- accent color for card

  is_shared    BOOLEAN DEFAULT FALSE,
  tags         TEXT[] DEFAULT '{}',

  -- Stats (denormalized for performance)
  candidate_count INTEGER DEFAULT 0,

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pool_candidates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id      UUID NOT NULL REFERENCES talent_pools(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  added_by     UUID NOT NULL REFERENCES auth.users(id),
  notes        TEXT CHECK (char_length(notes) <= 1000),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, candidate_id)
);

CREATE INDEX idx_pools_org        ON talent_pools(org_id, updated_at DESC);
CREATE INDEX idx_pool_candidates  ON pool_candidates(pool_id, created_at DESC);
CREATE INDEX idx_pool_by_candidate ON pool_candidates(candidate_id, org_id);

-- RLS
ALTER TABLE talent_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org pool access" ON talent_pools
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

ALTER TABLE pool_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org pool_candidates access" ON pool_candidates
  USING  (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Trigger: keep candidate_count in sync
CREATE OR REPLACE FUNCTION sync_pool_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE talent_pools SET candidate_count = candidate_count + 1, updated_at = NOW()
    WHERE id = NEW.pool_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE talent_pools SET candidate_count = GREATEST(0, candidate_count - 1), updated_at = NOW()
    WHERE id = OLD.pool_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pool_count_sync
  AFTER INSERT OR DELETE ON pool_candidates
  FOR EACH ROW EXECUTE FUNCTION sync_pool_count();
```

---

## FILE 2 — app/api/pools/route.ts  (GET + POST)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const PoolSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  emoji:       z.string().max(4).default("🎯"),
  color:       z.string().default("#38BDF8"),
  is_shared:   z.boolean().default(false),
  tags:        z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data } = await supabase
    .from("talent_pools")
    .select("id, name, description, emoji, color, candidate_count, is_shared, tags, created_by, created_at, updated_at")
    .eq("org_id", profile?.org_id)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ pools: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PoolSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { data, error: insertError } = await supabase
    .from("talent_pools")
    .insert({ ...parsed.data, org_id: profile?.org_id, created_by: user.id })
    .select("id, name, emoji")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

---

## FILE 3 — app/api/pools/[id]/candidates/route.ts  (GET + POST + DELETE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page  = Number(searchParams.get("page") ?? 1);
  const limit = 30;

  const { data, count } = await supabase
    .from("pool_candidates")
    .select(`
      id, notes, created_at,
      candidate:candidate_id (
        id, full_name, current_role, current_company,
        skills, location, experience_years
      )
    `, { count: "exact" })
    .eq("pool_id", params.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  return NextResponse.json({ candidates: data ?? [], total: count ?? 0 });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { candidate_id, notes } = await req.json();
  if (!candidate_id) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  const { error: insertError } = await supabase
    .from("pool_candidates")
    .upsert({
      pool_id:      params.id,
      candidate_id,
      org_id:       profile?.org_id,
      added_by:     user.id,
      ...(notes && { notes }),
    }, { onConflict: "pool_id,candidate_id", ignoreDuplicates: true });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { candidate_id } = await req.json();
  await supabase
    .from("pool_candidates")
    .delete()
    .eq("pool_id", params.id)
    .eq("candidate_id", candidate_id);

  return NextResponse.json({ success: true });
}
```

---

## FILE 4 — app/(app)/library/pools/page.tsx  (Pools grid)

```tsx
"use client";
import { useState, useEffect } from "react";
import { Plus, Users, Edit2, Trash2, Share2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CreatePoolModal } from "./CreatePoolModal";
import { useRouter } from "next/navigation";

const POOL_COLORS = ["#38BDF8","#A78BFA","#34D399","#F59E0B","#F87171","#FB923C","#60A5FA"];

export default function PoolsPage() {
  const router = useRouter();
  const [pools, setPools]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchPools = async () => {
    setLoading(true);
    const res  = await fetch("/api/pools");
    const data = await res.json();
    setPools(data.pools ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchPools(); }, []);

  const deletePool = async (id: string) => {
    if (!confirm("Delete this talent pool? Candidates won't be deleted.")) return;
    await fetch(`/api/pools/${id}`, { method: "DELETE" });
    toast.success("Pool deleted");
    fetchPools();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">Talent Pools</h1>
          <p className="text-xs text-[#555555] mt-0.5">Evergreen candidate groups — tap them when a role opens</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium hover:from-[#0EA5E9] hover:to-[#0284C7] transition-all"
        >
          <Plus className="w-4 h-4" /> New pool
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-[#111111] border border-[#1A1A1A] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#1A1A1A] flex items-center justify-center mx-auto mb-4 text-3xl">🎯</div>
          <p className="text-sm text-[#555555] mb-1">No talent pools yet</p>
          <p className="text-xs text-[#333333] mb-4">Create a pool to group candidates by theme, skill, or future role</p>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-sm text-[#38BDF8] hover:bg-[#38BDF8]/20 transition-all">
            Create first pool
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {pools.map(pool => (
            <PoolCard
              key={pool.id}
              pool={pool}
              onOpen={() => router.push(`/library/pools/${pool.id}`)}
              onDelete={() => deletePool(pool.id)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePoolModal
          onClose={() => setShowCreate(false)}
          onSaved={fetchPools}
        />
      )}
    </div>
  );
}

function PoolCard({ pool, onOpen, onDelete }: { pool: any; onOpen: () => void; onDelete: () => void }) {
  return (
    <div
      onClick={onOpen}
      className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5 hover:border-[#2A2A2A] transition-all cursor-pointer group relative overflow-hidden"
    >
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: pool.color }} />

      <div className="flex items-start justify-between mb-3">
        <div className="text-2xl">{pool.emoji}</div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {pool.is_shared
            ? <Share2 className="w-3.5 h-3.5 text-purple-400" />
            : <Lock className="w-3.5 h-3.5 text-[#333333]" />}
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-[#333333] hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-[#FAFAFA] mb-1">{pool.name}</h3>
      {pool.description && (
        <p className="text-xs text-[#555555] leading-relaxed mb-3 line-clamp-2">{pool.description}</p>
      )}

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: pool.color }}>
          <Users className="w-3.5 h-3.5" />
          <span className="font-semibold">{pool.candidate_count}</span>
          <span className="text-[#555555]">candidate{pool.candidate_count !== 1 ? "s" : ""}</span>
        </div>
        {pool.tags?.slice(0, 2).map((tag: string) => (
          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] border border-[#222222] text-[#555555]">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
```

---

## FILE 5 — components/pools/AddToPoolModal.tsx  (used from CandidateCard, RediscoveryCard)

```tsx
"use client";
import { useState, useEffect } from "react";
import { X, Plus, Check, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  candidateId:  string;
  candidateName: string;
  onClose:      () => void;
}

export function AddToPoolModal({ candidateId, candidateName, onClose }: Props) {
  const [pools, setPools]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState<string | null>(null);
  const [added, setAdded]     = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/pools")
      .then(r => r.json())
      .then(d => { setPools(d.pools ?? []); setLoading(false); });
  }, []);

  const addToPool = async (poolId: string) => {
    setAdding(poolId);
    const res = await fetch(`/api/pools/${poolId}/candidates`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ candidate_id: candidateId }),
    });
    setAdding(null);
    if (res.ok) {
      setAdded(prev => new Set(prev).add(poolId));
      toast.success(`Added to pool`);
    } else {
      toast.error("Failed to add");
    }
  };

  const createAndAdd = async () => {
    if (!newPoolName.trim()) return;
    setCreating(true);
    const res  = await fetch("/api/pools", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newPoolName }),
    });
    const pool = await res.json();
    if (res.ok) {
      await addToPool(pool.id);
      setPools(prev => [pool, ...prev]);
      setShowCreate(false);
      setNewPoolName("");
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#111111] border border-[#333333] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[#38BDF8]" />
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Add to talent pool</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-4 py-2.5 text-xs text-[#555555] border-b border-[#1A1A1A]">
          Adding <span className="text-[#A0A0A0] font-medium">{candidateName}</span>
        </p>

        {/* Pool list */}
        <div className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <div className="px-4 py-3 text-xs text-[#555555]">Loading pools...</div>
          ) : pools.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[#555555]">No pools yet — create one below</div>
          ) : (
            pools.map(pool => {
              const isAdded = added.has(pool.id);
              return (
                <button
                  key={pool.id}
                  onClick={() => !isAdded && addToPool(pool.id)}
                  disabled={isAdded || adding === pool.id}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 hover:bg-[#0D0D0D] transition-colors",
                    isAdded && "opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{pool.emoji}</span>
                    <div className="text-left">
                      <p className="text-xs font-medium text-[#FAFAFA]">{pool.name}</p>
                      <p className="text-[10px] text-[#555555]">{pool.candidate_count} candidates</p>
                    </div>
                  </div>
                  {isAdded ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : adding === pool.id ? (
                    <div className="w-4 h-4 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 text-[#555555]" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Create new pool inline */}
        <div className="border-t border-[#1A1A1A] px-4 py-3">
          {showCreate ? (
            <div className="flex gap-2">
              <input
                value={newPoolName}
                onChange={e => setNewPoolName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createAndAdd()}
                placeholder="Pool name..."
                autoFocus
                className="flex-1 bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
              />
              <button
                onClick={createAndAdd}
                disabled={!newPoolName.trim() || creating}
                className="px-3 py-2 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-xs text-[#38BDF8] hover:bg-[#38BDF8]/20 disabled:opacity-50 transition-all"
              >
                {creating ? "..." : "Create"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 text-xs text-[#555555] hover:text-[#38BDF8] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Create new pool
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Wire "Add to pool" into CandidateCard (M03)

In `components/search/CandidateCard.tsx`, add to the action buttons:

```tsx
import { Bookmark } from "lucide-react";
import { AddToPoolModal } from "@/components/pools/AddToPoolModal";

// Add state:
const [showPool, setShowPool] = useState(false);

// In actions row (alongside "Reveal" / "Shortlist"):
<button
  onClick={() => setShowPool(true)}
  className="p-1.5 rounded-lg text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all"
  title="Add to talent pool"
>
  <Bookmark className="w-4 h-4" />
</button>

{showPool && (
  <AddToPoolModal
    candidateId={candidate.id}
    candidateName={candidate.full_name}
    onClose={() => setShowPool(false)}
  />
)}
```

---

## COMPLETION CHECKLIST
- [ ] talent_pools table: name, description, emoji, color, candidate_count (auto via trigger), is_shared, tags
- [ ] pool_candidates table: UNIQUE(pool_id, candidate_id), upsert ignores duplicates
- [ ] DB trigger: sync_pool_count increments/decrements candidate_count on insert/delete
- [ ] GET /api/pools: list all org pools sorted by updated_at
- [ ] POST /api/pools: create pool
- [ ] DELETE /api/pools/[id]: delete pool (candidates unaffected)
- [ ] GET /api/pools/[id]/candidates: paginated candidates in pool with join to candidate table
- [ ] POST /api/pools/[id]/candidates: add candidate, upsert (silent duplicate)
- [ ] DELETE /api/pools/[id]/candidates: remove candidate from pool
- [ ] PoolsPage: 2-col grid, accent color line, emoji, count, hover delete
- [ ] PoolCard: top accent border in pool.color
- [ ] AddToPoolModal: list pools, tick mark when added, inline create-new
- [ ] "Add to pool" (Bookmark icon) wired into CandidateCard from M03
- [ ] "Add to pool" also available from RediscoveryResultCard (M09/02)

## BUILD LOG ENTRY
## M09-03 Candidate Pools — [date]
### Files: talent_pools SQL, pool_candidates SQL, count trigger, CRUD API, PoolsPage, AddToPoolModal
### Status: ✅ Complete
