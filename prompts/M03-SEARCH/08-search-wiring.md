<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

# M03 — TASK 08: SEARCH PAGE FINAL WIRING
# Trae: Read CLAUDE.md first.
# This task wires together all M03 components into the final SearchPage.
# After this task, the entire search → reveal → shortlist flow should work end to end.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Update the SearchPage (04-search-page.md) to wire in:
- CandidateCard (task 05) for each result
- BulkActionBar (task 07) for multi-select
- SearchHistoryPanel (task 07) slide-in
- Credit counter that updates live after reveals
- Log search to /api/search/history after results load
- "No results" empty state
- Results count + filter summary in header

---

## FILE 1 — app/(app)/search/SearchResults.tsx  [Main wiring component]

```tsx
"use client";
import { useState, useCallback } from "react";
import { CandidateCard, CandidateResult } from "@/components/search/CandidateCard";
import { CandidateCardSkeleton } from "@/components/search/CandidateCardSkeleton";
import { BulkActionBar } from "@/components/search/BulkActionBar";
import { SearchHistoryPanel } from "@/components/search/SearchHistoryPanel";
import { Clock, Search, SlidersHorizontal, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResultsProps {
  results: CandidateResult[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  projects: { id: string; title: string }[];
  initialCredits: number;
  filterSummary: string;
  onRepeatSearch: (filters: any, queryText: string | null) => void;
}

export function SearchResults({
  results, loading, error, totalCount, projects,
  initialCredits, filterSummary, onRepeatSearch,
}: SearchResultsProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [cards, setCards] = useState<CandidateResult[]>(results);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);

  // Sync cards when results prop changes
  useState(() => { setCards(results); }, );

  const handleReveal = useCallback((prospeoId: string, data: any) => {
    setCards(prev => prev.map(c =>
      c.prospeo_id === prospeoId
        ? { ...c, is_revealed: true, email: data.email, phone: data.phone, candidate_id: data.candidate_id }
        : c
    ));
  }, []);

  const handleShortlist = useCallback((candidateId: string, projectId: string) => {
    setCards(prev => prev.map(c =>
      c.candidate_id === candidateId
        ? { ...c, is_shortlisted: true, shortlisted_project_id: projectId }
        : c
    ));
  }, []);

  const handleCreditDeducted = useCallback((count: number = 1) => {
    setCredits(prev => Math.max(0, prev - count));
  }, []);

  const toggleSelect = (prospeoId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(prospeoId) ? next.delete(prospeoId) : next.add(prospeoId);
      return next;
    });
  };

  const handleBulkRevealed = (resultsMap: Record<string, any>) => {
    setCards(prev => prev.map(c => {
      const r = resultsMap[c.prospeo_id];
      return r ? { ...c, is_revealed: true, email: r.email, phone: r.phone, candidate_id: r.candidate_id } : c;
    }));
  };

  const handleBulkShortlisted = (projectId: string, candidateIds: string[]) => {
    setCards(prev => prev.map(c =>
      candidateIds.includes(c.candidate_id ?? "")
        ? { ...c, is_shortlisted: true, shortlisted_project_id: projectId }
        : c
    ));
  };

  // ─── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-fade-in">
        {Array.from({ length: 9 }).map((_, i) => (
          <CandidateCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-[#EF4444]" />
        </div>
        <p className="text-sm font-medium text-[#FAFAFA] mb-1">Search failed</p>
        <p className="text-xs text-[#555555]">{error}</p>
      </div>
    );
  }

  // ─── No results ─────────────────────────────────────────────
  if (cards.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#222222] flex items-center justify-center mb-5">
          <Search className="w-8 h-8 text-[#333333]" />
        </div>
        <h3 className="text-base font-semibold text-[#FAFAFA] mb-2">No candidates found</h3>
        <p className="text-sm text-[#555555] text-center max-w-xs mb-6">
          Try broadening your search — remove a skill, expand the experience range, or include more locations.
        </p>
        <button
          onClick={() => setHistoryOpen(true)}
          className="flex items-center gap-2 text-sm text-[#38BDF8] hover:text-[#0EA5E9] transition-colors"
        >
          <Clock className="w-4 h-4" />
          View search history
        </button>
        <SearchHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} onRepeatSearch={onRepeatSearch} />
      </div>
    );
  }

  const selectedCards = cards.filter(c => selectedIds.has(c.prospeo_id));

  return (
    <>
      {/* Results header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[#FAFAFA]">
            {totalCount.toLocaleString()} candidates
          </span>
          {filterSummary && (
            <span className="text-xs text-[#555555] bg-[#111111] border border-[#222222] rounded-lg px-2.5 py-1 truncate max-w-xs">
              {filterSummary}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Credits badge */}
          <div className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border",
            credits < 10
              ? "text-orange-400 bg-orange-400/10 border-orange-400/30"
              : "text-[#A0A0A0] bg-[#111111] border-[#222222]"
          )}>
            ⚡ {credits} credits
          </div>

          {/* History button */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#111111] transition-all"
            title="Search history"
          >
            <Clock className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(candidate => (
          <div
            key={candidate.prospeo_id}
            className={cn(
              "relative",
              selectedIds.has(candidate.prospeo_id) && "ring-2 ring-[#38BDF8]/50 rounded-2xl"
            )}
          >
            {/* Checkbox overlay */}
            <div
              className="absolute top-3 left-3 z-10 cursor-pointer"
              onClick={() => toggleSelect(candidate.prospeo_id)}
            >
              <div className={cn(
                "w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-all",
                selectedIds.has(candidate.prospeo_id)
                  ? "bg-[#38BDF8] border-[#38BDF8]"
                  : "border-[#333333] bg-[#111111] hover:border-[#555555]"
              )}>
                {selectedIds.has(candidate.prospeo_id) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>

            <CandidateCard
              candidate={candidate}
              onReveal={handleReveal}
              onShortlist={handleShortlist}
              projects={projects}
              creditsBalance={credits}
              onCreditDeducted={() => handleCreditDeducted(1)}
            />
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        selectedIds={[...selectedIds]}
        selectedCards={selectedCards}
        totalCredits={credits}
        projects={projects}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkRevealed={(r) => { handleBulkRevealed(r); setSelectedIds(new Set()); }}
        onBulkShortlisted={(pId, cIds) => { handleBulkShortlisted(pId, cIds); setSelectedIds(new Set()); }}
        onCreditDeducted={handleCreditDeducted}
      />

      {/* History panel */}
      <SearchHistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRepeatSearch={onRepeatSearch}
      />
    </>
  );
}
```

---

## FILE 2 — Update app/(app)/search/page.tsx to log searches

In the existing search page (from 04-search-page.md), after a successful Prospeo search
call returns results, add this line to log the search:

```typescript
// After results are returned from the search API:
await fetch("/api/search/history", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query_text: filters.keyword ?? null,
    filters:    filters,
    results_count: results.length,
    project_id: searchParams.get("project") ?? null,
  }),
});
```

---

## FILE 3 — tailwind.config.ts additions (ensure these exist)

```typescript
// Add to theme.extend in tailwind.config.ts:
boxShadow: {
  "glow-blue-sm": "0 0 20px rgba(56, 189, 248, 0.15)",
  "glow-blue":    "0 0 40px rgba(56, 189, 248, 0.2)",
},
animation: {
  "fade-in":    "fadeIn 0.2s ease-out",
  "slide-up":   "slideUp 0.2s ease-out",
  "slide-down": "slideDown 0.2s ease-out",
  "slide-left": "slideLeft 0.25s ease-out",
},
keyframes: {
  fadeIn:    { from: { opacity: "0" },                    to: { opacity: "1" } },
  slideUp:   { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
  slideDown: { from: { opacity: "0", transform: "translateY(-8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
  slideLeft: { from: { opacity: "0", transform: "translateX(20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
},
```

---

## FULL M03 COMPONENT MAP (for Trae reference)

```
M03 Search Module — complete component tree:

app/(app)/search/
  page.tsx                     ← Server component (fetch profile, projects)
  SearchPage.tsx               ← Client: holds filter state, calls Prospeo API
  FilterPanel.tsx              ← Left panel: skills, location, exp, company
  SearchResults.tsx  ← [THIS TASK] wires all cards + bulk + history

components/search/
  CandidateCard.tsx            ← Task 05: locked/revealing/revealed states
  CandidateCardSkeleton.tsx    ← Task 05: loading placeholder
  ShortlistDropdown.tsx        ← Task 05: project picker dropdown
  BulkActionBar.tsx            ← Task 07: bottom floating bar
  SearchHistoryPanel.tsx       ← Task 07: right slide-in panel

app/api/
  search/route.ts              ← Task 03/04: calls Prospeo people-search
  search/history/route.ts      ← Task 07: GET + POST history
  search/history/[id]/route.ts ← Task 07: DELETE history item
  reveal/route.ts              ← Task 06: credit deduction + Prospeo lookup
  shortlist/route.ts           ← Task 06: add to project

lib/prospeo/client.ts          ← Task 06: typed Prospeo wrapper
```

---

## COMPLETION CHECKLIST
- [ ] SearchResults.tsx — wires CandidateCard + BulkActionBar + SearchHistoryPanel
- [ ] Credit counter updates live in UI after each reveal
- [ ] Checkbox select works, bulk bar appears with correct credit cost
- [ ] No-results state has "View history" link
- [ ] Loading state shows 9 skeleton cards
- [ ] Error state shows red icon + error message
- [ ] Search is logged to /api/search/history after every run
- [ ] tailwind.config.ts has all animations + glow shadows

## BUILD LOG ENTRY
## M03-08 Search Final Wiring — [date]
### Files: SearchResults.tsx, tailwind.config.ts updates, search page POST history
### M03 COMPLETE: full search → reveal → shortlist flow working
### Status: ✅ Complete
