<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

# M03 — TASK 07: BULK ACTIONS + SEARCH HISTORY + SAVED SEARCHES
# Trae: Read CLAUDE.md first.
# This adds: checkbox multi-select on results, bulk reveal, bulk shortlist,
# search history sidebar panel, and saved search functionality.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
1. BulkActionBar — appears at bottom when 1+ cards are checked
2. Bulk Reveal — reveals all selected with 1 click (deducts N credits)
3. Bulk Shortlist — adds all revealed candidates to a project
4. SearchHistory panel — shows last 20 searches with repeat-search button
5. SavedSearch — pin a filter set for reuse

---

## FILE 1 — components/search/BulkActionBar.tsx

```tsx
"use client";
import { Eye, Plus, X, Loader2, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BulkActionBarProps {
  selectedIds: string[];          // prospeo_ids selected
  selectedCards: any[];           // full card data for selected
  totalCredits: number;
  projects: { id: string; title: string }[];
  onClearSelection: () => void;
  onBulkRevealed: (results: Record<string, { email: string | null; phone: string | null; candidate_id: string }>) => void;
  onBulkShortlisted: (projectId: string, candidateIds: string[]) => void;
  onCreditDeducted: (count: number) => void;
}

export function BulkActionBar({
  selectedIds, selectedCards, totalCredits, projects,
  onClearSelection, onBulkRevealed, onBulkShortlisted, onCreditDeducted,
}: BulkActionBarProps) {
  const [revealLoading, setRevealLoading] = useState(false);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const unrevealedCards = selectedCards.filter(c => !c.is_revealed);
  const revealedCards   = selectedCards.filter(c => c.is_revealed && c.candidate_id);
  const creditCost      = unrevealedCards.length;
  const canReveal       = creditCost > 0 && totalCredits >= creditCost;

  const handleBulkReveal = async () => {
    if (!canReveal) {
      toast.error(`Need ${creditCost} credits. You have ${totalCredits}.`, {
        action: { label: "Top up", onClick: () => window.location.href = "/billing" },
      });
      return;
    }

    setRevealLoading(true);
    const results: Record<string, any> = {};
    let successCount = 0;
    let noContactCount = 0;

    // Sequential to avoid hammering Prospeo rate limits
    for (const card of unrevealedCards) {
      try {
        const res = await fetch("/api/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedin_url: card.linkedin_url, prospeo_id: card.prospeo_id }),
        });
        const data = await res.json();
        if (res.ok) {
          results[card.prospeo_id] = { email: data.email, phone: data.phone, candidate_id: data.candidate_id };
          successCount++;
        } else if (data.error === "NO_CONTACT_FOUND") {
          noContactCount++;
        }
      } catch {
        // continue with next
      }
      // Small delay to respect rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    setRevealLoading(false);
    onBulkRevealed(results);
    onCreditDeducted(successCount);

    if (successCount > 0) {
      toast.success(`Revealed ${successCount} contact${successCount > 1 ? "s" : ""}!`, {
        description: noContactCount > 0 ? `${noContactCount} had no contact info (not charged)` : undefined,
      });
    } else {
      toast.error("No contacts found. No credits were deducted.");
    }
  };

  const handleBulkShortlist = async (projectId: string) => {
    const allRevealedIds = [
      ...revealedCards.map(c => c.candidate_id),
      // Also include newly revealed from this session
    ].filter(Boolean);

    if (allRevealedIds.length === 0) {
      toast.error("Reveal contact info first before shortlisting.");
      return;
    }

    setShortlistLoading(true);
    let count = 0;
    for (const candidateId of allRevealedIds) {
      const res = await fetch("/api/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, project_id: projectId }),
      });
      if (res.ok) count++;
    }
    setShortlistLoading(false);
    setProjectMenuOpen(false);
    onBulkShortlisted(projectId, allRevealedIds);
    toast.success(`Added ${count} candidate${count > 1 ? "s" : ""} to project!`);
  };

  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="flex items-center gap-2 bg-[#1A1A1A] border border-[#333333] rounded-2xl px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
        {/* Count badge */}
        <span className="text-sm font-semibold text-[#FAFAFA] mr-1">
          {selectedIds.length} selected
        </span>

        <div className="w-px h-5 bg-[#333333] mx-1" />

        {/* Bulk Reveal */}
        {unrevealedCards.length > 0 && (
          <button
            onClick={handleBulkReveal}
            disabled={revealLoading || !canReveal}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all",
              canReveal && !revealLoading
                ? "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white hover:from-[#0EA5E9] hover:to-[#0284C7]"
                : "bg-[#111111] text-[#555555] cursor-not-allowed"
            )}
          >
            {revealLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Reveal {unrevealedCards.length} · {creditCost} credits
          </button>
        )}

        {/* Bulk Shortlist */}
        <div className="relative">
          <button
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            disabled={shortlistLoading || revealedCards.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border border-[#333333] text-[#A0A0A0] hover:text-[#FAFAFA] hover:border-[#444444] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {shortlistLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Shortlist {revealedCards.length > 0 ? revealedCards.length : ""}
          </button>

          {projectMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 bg-[#1A1A1A] border border-[#333333] rounded-xl shadow-xl w-56 overflow-hidden animate-slide-up">
              <p className="text-[10px] text-[#555555] uppercase tracking-wider px-3 py-2.5 border-b border-[#222222]">Add to project</p>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleBulkShortlist(p.id)}
                  className="w-full text-left px-3 py-2.5 text-sm text-[#A0A0A0] hover:bg-[#222222] hover:text-[#FAFAFA] transition-all truncate"
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-[#333333] mx-1" />

        {/* Clear */}
        <button
          onClick={onClearSelection}
          className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#222222] transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

---

## FILE 2 — components/search/SearchHistoryPanel.tsx

```tsx
"use client";
import { useEffect, useState } from "react";
import { Clock, RotateCcw, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchRecord {
  id: string;
  query_text: string | null;
  filters: any;
  results_count: number;
  created_at: string;
}

interface SearchHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  onRepeatSearch: (filters: any, queryText: string | null) => void;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SearchHistoryPanel({ open, onClose, onRepeatSearch }: SearchHistoryPanelProps) {
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/search/history")
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .finally(() => setLoading(false));
  }, [open]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/search/history/${id}`, { method: "DELETE" });
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-[#0D0D0D] border-l border-[#222222] shadow-2xl animate-slide-left overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#555555]" />
            <h3 className="text-sm font-semibold text-[#FAFAFA]">Search history</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A]">
            ×
          </button>
        </div>

        <div className="p-3 space-y-2">
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-[#111111] rounded-xl animate-pulse" />
          ))}

          {!loading && history.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-8 h-8 text-[#333333] mx-auto mb-3" />
              <p className="text-sm text-[#555555]">No searches yet</p>
            </div>
          )}

          {!loading && history.map(h => (
            <div key={h.id} className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-3.5 group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-medium text-[#FAFAFA] truncate flex-1">
                  {h.query_text ?? buildFilterSummary(h.filters)}
                </p>
                <span className="text-[10px] text-[#555555] flex-shrink-0">{timeAgo(h.created_at)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#555555]">{h.results_count} results</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { onRepeatSearch(h.filters, h.query_text); onClose(); }}
                    className="flex items-center gap-1 text-[11px] text-[#38BDF8] hover:text-[#0EA5E9] px-2 py-1 rounded-lg hover:bg-[#38BDF8]/10 transition-all"
                  >
                    <RotateCcw className="w-3 h-3" /> Repeat
                  </button>
                  <button
                    onClick={() => handleDelete(h.id)}
                    className="p-1 rounded-lg text-[#555555] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function buildFilterSummary(filters: any): string {
  const parts: string[] = [];
  if (filters?.skills?.length)    parts.push(filters.skills.slice(0, 2).join(", "));
  if (filters?.location)          parts.push(filters.location);
  if (filters?.exp_min !== undefined) parts.push(`${filters.exp_min}+ yrs`);
  return parts.join(" · ") || "Search";
}
```

---

## FILE 3 — app/api/search/history/route.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: history } = await supabase
    .from("search_history")
    .select("id, query_text, filters, results_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return NextResponse.json({ history: history ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { query_text, filters, results_count, project_id } = body;

  const { data } = await supabase
    .from("search_history")
    .insert({ user_id: user.id, query_text, filters, results_count, project_id })
    .select("id")
    .single();

  return NextResponse.json({ id: data?.id }, { status: 201 });
}
```

---

## FILE 4 — app/api/search/history/[id]/route.ts

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("search_history")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
```

---

## COMPLETION CHECKLIST
- [ ] BulkActionBar.tsx — appears when cards selected, shows reveal count + credit cost
- [ ] Bulk reveal is sequential with 200ms delay (Prospeo rate limit)
- [ ] Bulk shortlist disabled until at least 1 revealed card selected
- [ ] SearchHistoryPanel.tsx — slides in from right, lists last 30 searches
- [ ] Repeat search restores filters to search panel
- [ ] DELETE history item removes it from list
- [ ] POST /api/search/history — called after every search with result count
- [ ] Credit insufficient: toast with "Top up" action button

## BUILD LOG ENTRY
## M03-07 Bulk Actions + History — [date]
### Files: BulkActionBar.tsx, SearchHistoryPanel.tsx, api/search/history/route.ts, api/search/history/[id]/route.ts
### Status: ✅ Complete
