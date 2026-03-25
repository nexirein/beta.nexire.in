<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

M03 — TASK 04: SEARCH PAGE UI + /api/search ROUTE
Trae: Read CLAUDE.md first. This is THE core feature page of Nexire.
UI: Left panel = filters sidebar, Right = results area.
The search experience must feel INSTANT and CLEAN like Linear or Perplexity.
After completion, append to _meta/BUILD-LOG.md
OBJECTIVE
Build /search page with:

Natural language search bar at top (large, prominent)

Left filter panel: Title, Location (multi), Skills (chips), Seniority, Experience range

India-specific filters: Notice Period (dropdown), Min/Max Experience

"Results used this month" meter (plan limit awareness)

POST /api/search — orchestrates Redis cache + rate limit + Prospeo + AI scorer

DESIGN SPEC
Page layout: full height, no scroll on container — results panel scrolls internally
Search bar: prominent, 2xl, placeholder fades between examples
Filter panel: 280px left, fixed height, scrollable
Results area: flex-1, right side
Loading state: skeleton cards (NOT spinner) — 6 skeleton cards while fetching
Empty state: beautiful illustrated state with search tip

FILE 1 — app/(app)/search/page.tsx [Server Component — minimal]
tsx
import { createClient } from "@/lib/supabase/server";
import { SearchClient } from "./SearchClient";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { project?: string; q?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [profileRes, projectsRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, plan_tier, credits_balance, results_used_mtd").eq("id", user!.id).single(),
    supabase.from("projects").select("id, title, status").eq("user_id", user!.id).eq("status", "active").order("created_at", { ascending: false }),
  ]);

  let linkedProject = null;
  if (searchParams.project) {
    const { data } = await supabase.from("projects").select("*").eq("id", searchParams.project).eq("user_id", user!.id).single();
    linkedProject = data;
  }

  return (
    <SearchClient
      profile={profileRes.data!}
      activeProjects={projectsRes.data ?? []}
      linkedProject={linkedProject}
      initialQuery={searchParams.q ?? ""}
    />
  );
}
FILE 2 — app/(app)/search/SearchClient.tsx
tsx
"use client";
import { useState, useCallback, useRef } from "react";
import { Search, SlidersHorizontal, X, Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { FilterPanel } from "./FilterPanel";
import { SearchResults } from "./SearchResults";
import { SearchSkeleton } from "./SearchSkeleton";
import { SearchEmpty } from "./SearchEmpty";
import { cn } from "@/lib/utils";
import type { NexireSearchFilters } from "@/lib/prospeo/types";
import type { ScoredCandidate } from "@/lib/ai/scorer";

const SEARCH_PLACEHOLDERS = [
  "Senior React developer in Bangalore with 5+ years...",
  "Node.js backend engineer, Pune, notice under 30 days...",
  "Python ML engineer, Hyderabad, 3-6 years...",
  "Full-stack engineer, remote, startup experience...",
  "DevOps/SRE with AWS and Kubernetes, Delhi...",
];

interface SearchClientProps {
  profile: any;
  activeProjects: { id: string; title: string }[];
  linkedProject: any;
  initialQuery: string;
}

export function SearchClient({ profile, activeProjects, linkedProject, initialQuery }: SearchClientProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<NexireSearchFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoredCandidate[] | null>(null);
  const [resultsMeta, setResultsMeta] = useState<{ total: number; cached: boolean; searchId: string } | null>(null);
  const [linkedProjectId, setLinkedProjectId] = useState(linkedProject?.id ?? "");
  const [page, setPage] = useState(1);
  const placeholderIdx = useRef(0);

  const PLAN_RESULT_LIMITS: Record<string, number> = { free: 10, solo: 1500, growth: -1, custom: -1 };
  const planLimit = PLAN_RESULT_LIMITS[profile.plan_tier] ?? 10;
  const usedPct = planLimit > 0 ? Math.min(100, (profile.results_used_mtd / planLimit) * 100) : 0;

  const handleSearch = useCallback(async (currentPage = 1) => {
    if (!query.trim() && Object.keys(filters).length === 0) {
      toast.error("Enter a search query or add filters to search.");
      return;
    }

    setLoading(true);
    if (currentPage === 1) setResults(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          filters,
          project_id: linkedProjectId || undefined,
          page: currentPage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          toast.error(data.message ?? "Rate limit reached. Please wait.");
          return;
        }
        if (res.status === 403 && data.error === "PLAN_LIMIT") {
          toast.error(data.message ?? "Monthly result limit reached. Upgrade your plan.");
          return;
        }
        throw new Error(data.error ?? "Search failed");
      }

      setResults(data.results);
      setResultsMeta({ total: data.total, cached: data.cached, searchId: data.search_id });
      setPage(currentPage);
    } catch (err: any) {
      toast.error(err.message ?? "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [query, filters, linkedProjectId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(1);
  };

  const clearSearch = () => {
    setQuery("");
    setFilters({});
    setResults(null);
    setResultsMeta(null);
  };

  return (
    <div className="flex h-full">
      {/* ── Filter Panel (left) ── */}
      <div
        className={cn(
          "flex-shrink-0 border-r border-[#1A1A1A] transition-all duration-200 overflow-hidden",
          filtersOpen ? "w-72" : "w-0"
        )}
      >
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          activeProjects={activeProjects}
          linkedProjectId={linkedProjectId}
          onProjectChange={setLinkedProjectId}
        />
      </div>

      {/* ── Main area (right) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search bar strip */}
        <div className="px-6 py-4 border-b border-[#1A1A1A] bg-[#0A0A0A]">
          <div className="flex items-center gap-3">
            {/* Filter toggle */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                "p-2.5 rounded-xl border transition-all flex-shrink-0",
                filtersOpen
                  ? "border-[#38BDF8] text-[#38BDF8] bg-[#38BDF8]/10"
                  : "border-[#333333] text-[#555555] hover:border-[#444444] hover:text-[#A0A0A0]"
              )}
              title="Toggle filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555555]" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={SEARCH_PLACEHOLDERS[placeholderIdx.current % SEARCH_PLACEHOLDERS.length]}
                className="w-full bg-[#111111] border border-[#333333] rounded-xl pl-11 pr-10 py-3 text-sm text-[#FAFAFA] placeholder-[#444444] focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/20 transition-all"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555555] hover:text-[#A0A0A0]">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search button */}
            <button
              onClick={() => handleSearch(1)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] hover:from-[#0EA5E9] hover:to-[#0284C7] text-white text-sm font-medium rounded-xl transition-all disabled:opacity-60 flex-shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Search
            </button>
          </div>

          {/* Plan usage bar */}
          {planLimit > 0 && (
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", usedPct > 80 ? "bg-orange-400" : "bg-[#38BDF8]/40")}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <span className="text-[11px] text-[#555555] whitespace-nowrap tabular-nums">
                {profile.results_used_mtd.toLocaleString()} / {planLimit.toLocaleString()} results
              </span>
            </div>
          )}

          {/* Result meta row */}
          {resultsMeta && !loading && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-[#555555]">
                {resultsMeta.total.toLocaleString()} candidates found
              </span>
              {resultsMeta.cached && (
                <span className="text-[10px] bg-[#1A1A1A] border border-[#222222] text-[#555555] px-2 py-0.5 rounded-lg">
                  Cached · no credits used
                </span>
              )}
              <button onClick={clearSearch} className="text-xs text-[#555555] hover:text-[#A0A0A0] ml-auto">
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <SearchSkeleton />
          ) : results === null ? (
            <SearchEmpty />
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-[#555555] text-sm mb-2">No candidates matched your search</p>
                <p className="text-[#333333] text-xs">Try broader job titles or remove some filters</p>
              </div>
            </div>
          ) : (
            <SearchResults
              results={results}
              searchId={resultsMeta!.searchId}
              projectId={linkedProjectId || undefined}
              profile={profile}
            />
          )}
        </div>
      </div>
    </div>
  );
}
FILE 3 — app/(app)/search/FilterPanel.tsx
tsx
"use client";
import { X, Plus, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { NexireSearchFilters } from "@/lib/prospeo/types";

const INDIA_CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Pune",
  "Kolkata", "Noida", "Gurgaon", "Kochi", "Chandigarh", "Ahmedabad",
  "Remote", "Pan India",
];

const SENIORITY_OPTIONS = [
  { value: "entry",    label: "Entry / Fresher" },
  { value: "junior",   label: "Junior (1-3 yrs)" },
  { value: "mid",      label: "Mid (3-6 yrs)" },
  { value: "senior",   label: "Senior (6+ yrs)" },
  { value: "director", label: "Director / Lead" },
  { value: "vp",       label: "VP / Head" },
  { value: "c_suite",  label: "C-Suite" },
];

const NOTICE_OPTIONS = [
  { value: "",    label: "Any notice period" },
  { value: "15",  label: "≤ 15 days" },
  { value: "30",  label: "≤ 30 days" },
  { value: "60",  label: "≤ 60 days" },
  { value: "90",  label: "≤ 90 days" },
];

const POPULAR_SKILLS = [
  "React", "Node.js", "Python", "Java", "TypeScript", "AWS", "Docker",
  "Kubernetes", "SQL", "MongoDB", "Go", "Flutter", "Swift", "Spring Boot",
];

interface FilterPanelProps {
  filters: NexireSearchFilters;
  onChange: (f: NexireSearchFilters) => void;
  activeProjects: { id: string; title: string }[];
  linkedProjectId: string;
  onProjectChange: (id: string) => void;
}

export function FilterPanel({ filters, onChange, activeProjects, linkedProjectId, onProjectChange }: FilterPanelProps) {
  const [skillInput, setSkillInput] = useState("");
  const [titleInput, setTitleInput] = useState("");

  const update = (key: keyof NexireSearchFilters, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const addArrayItem = (key: keyof NexireSearchFilters, value: string) => {
    const arr = (filters[key] as string[] | undefined) ?? [];
    if (!arr.includes(value) && value.trim()) {
      update(key, [...arr, value.trim()]);
    }
  };

  const removeArrayItem = (key: keyof NexireSearchFilters, value: string) => {
    const arr = (filters[key] as string[] | undefined) ?? [];
    update(key, arr.filter(v => v !== value));
  };

  const inputClass = "w-full bg-[#0A0A0A] border border-[#333333] rounded-xl px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#444444] focus:outline-none focus:border-[#38BDF8] transition-all";
  const sectionLabel = "text-[11px] font-semibold text-[#555555] uppercase tracking-wider mb-2";
  const chip = (label: string, onRemove: () => void) => (
    <span key={label} className="flex items-center gap-1 text-xs bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/20 rounded-lg px-2 py-1">
      {label}
      <button onClick={onRemove} className="hover:text-white"><X className="w-3 h-3" /></button>
    </span>
  );

  return (
    <div className="h-full overflow-y-auto px-4 py-5 space-y-6">
      <div>
        <p className="text-sm font-semibold text-[#FAFAFA] mb-1">Filters</p>
        <p className="text-xs text-[#555555]">Refine your search</p>
      </div>

      {/* Link to Project */}
      {activeProjects.length > 0 && (
        <div>
          <p className={sectionLabel}>Link to project</p>
          <select
            value={linkedProjectId}
            onChange={e => onProjectChange(e.target.value)}
            className={cn(inputClass, "cursor-pointer")}
          >
            <option value="" className="bg-[#111111]">No project</option>
            {activeProjects.map(p => (
              <option key={p.id} value={p.id} className="bg-[#111111]">{p.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Job Titles */}
      <div>
        <p className={sectionLabel}>Job titles</p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="e.g. Backend Engineer"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { addArrayItem("job_title", titleInput); setTitleInput(""); } }}
            className={cn(inputClass, "flex-1")}
          />
          <button
            onClick={() => { addArrayItem("job_title", titleInput); setTitleInput(""); }}
            className="p-2 bg-[#1A1A1A] border border-[#333333] rounded-xl text-[#555555] hover:text-[#A0A0A0]"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(filters.job_title ?? []).map(t => chip(t, () => removeArrayItem("job_title", t)))}
        </div>
      </div>

      {/* Location */}
      <div>
        <p className={sectionLabel}>Location</p>
        <div className="grid grid-cols-2 gap-1.5">
          {INDIA_CITIES.map(city => {
            const active = (filters.location ?? []).includes(city);
            return (
              <button
                key={city}
                onClick={() => active ? removeArrayItem("location", city) : addArrayItem("location", city)}
                className={cn(
                  "text-xs px-2.5 py-2 rounded-xl border transition-all text-left",
                  active
                    ? "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]"
                    : "border-[#222222] text-[#555555] hover:border-[#333333] hover:text-[#A0A0A0]"
                )}
              >
                {city}
              </button>
            );
          })}
        </div>
      </div>

      {/* Skills */}
      <div>
        <p className={sectionLabel}>Skills</p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Add a skill..."
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { addArrayItem("skills", skillInput); setSkillInput(""); } }}
            className={cn(inputClass, "flex-1")}
          />
          <button
            onClick={() => { addArrayItem("skills", skillInput); setSkillInput(""); }}
            className="p-2 bg-[#1A1A1A] border border-[#333333] rounded-xl text-[#555555] hover:text-[#A0A0A0]"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {/* Popular skills */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {POPULAR_SKILLS.map(s => {
            const active = (filters.skills ?? []).map(x => x.toLowerCase()).includes(s.toLowerCase());
            return (
              <button
                key={s}
                onClick={() => active ? removeArrayItem("skills", s) : addArrayItem("skills", s)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-lg border transition-all",
                  active ? "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]" : "border-[#1A1A1A] text-[#555555] hover:border-[#333333]"
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Seniority */}
      <div>
        <p className={sectionLabel}>Seniority</p>
        <div className="space-y-1">
          {SENIORITY_OPTIONS.map(opt => {
            const active = (filters.seniority ?? []).includes(opt.value as any);
            return (
              <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                <div
                  onClick={() => {
                    const arr = (filters.seniority as string[] | undefined) ?? [];
                    update("seniority", active ? arr.filter(v => v !== opt.value) : [...arr, opt.value] as any);
                  }}
                  className={cn(
                    "w-4 h-4 rounded border-2 transition-all flex items-center justify-center",
                    active ? "bg-[#38BDF8] border-[#38BDF8]" : "border-[#333333] group-hover:border-[#444444]"
                  )}
                >
                  {active && <div className="w-2 h-2 bg-white rounded-sm" />}
                </div>
                <span className="text-sm text-[#A0A0A0] group-hover:text-[#FAFAFA] transition-colors">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* India-specific: Notice Period */}
      <div>
        <p className={cn(sectionLabel, "flex items-center gap-1.5")}>
          Notice period
          <span className="text-[#38BDF8] text-[9px] font-normal normal-case tracking-normal bg-[#38BDF8]/10 px-1.5 py-0.5 rounded">🇮🇳 India</span>
        </p>
        <p className="text-[10px] text-[#555555] mb-2">Estimated from tenure. Confirmed manually.</p>
        <select
          value={filters.notice_max_days?.toString() ?? ""}
          onChange={e => update("notice_max_days", e.target.value ? Number(e.target.value) as any : null)}
          className={cn(inputClass, "cursor-pointer")}
        >
          {NOTICE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#111111]">{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Experience Range */}
      <div>
        <p className={sectionLabel}>Experience (years)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            min={0} max={40}
            value={filters.min_experience_years ?? ""}
            onChange={e => update("min_experience_years", e.target.value ? Number(e.target.value) : undefined)}
            className={cn(inputClass, "flex-1")}
          />
          <span className="text-[#555555] text-xs">–</span>
          <input
            type="number"
            placeholder="Max"
            min={0} max={40}
            value={filters.max_experience_years ?? ""}
            onChange={e => update("max_experience_years", e.target.value ? Number(e.target.value) : undefined)}
            className={cn(inputClass, "flex-1")}
          />
        </div>
      </div>

      {/* Clear all */}
      {Object.keys(filters).some(k => {
        const v = filters[k as keyof NexireSearchFilters];
        return v !== undefined && v !== null && (!Array.isArray(v) || v.length > 0);
      }) && (
        <button
          onClick={() => onChange({})}
          className="w-full py-2 text-sm text-[#EF4444] hover:text-red-400 border border-[#EF4444]/20 hover:border-[#EF4444]/40 rounded-xl transition-all"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
FILE 4 — app/(app)/search/SearchSkeleton.tsx
tsx
export function SearchSkeleton() {
  return (
    <div className="p-6 grid grid-cols-1 gap-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-2">
              <div className="h-4 w-48 bg-[#1A1A1A] rounded-lg" />
              <div className="h-3 w-32 bg-[#1A1A1A] rounded-lg" />
            </div>
            <div className="h-6 w-16 bg-[#1A1A1A] rounded-xl" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-[#1A1A1A] rounded-lg" />
            <div className="h-5 w-16 bg-[#1A1A1A] rounded-lg" />
            <div className="h-5 w-24 bg-[#1A1A1A] rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
FILE 5 — app/(app)/search/SearchEmpty.tsx
tsx
import { Sparkles, Search, Zap } from "lucide-react";

const EXAMPLES = [
  "Senior React developer, Bangalore, 5+ years",
  "Python ML engineer with AWS, Hyderabad",
  "Node.js backend, Pune, startup background",
  "Full-stack MERN, remote, 3-6 years",
];

export function SearchEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-8 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#38BDF8]/20 to-[#0EA5E9]/20 border border-[#38BDF8]/20 flex items-center justify-center mb-6">
        <Sparkles className="w-7 h-7 text-[#38BDF8]" />
      </div>
      <h2 className="text-lg font-semibold text-[#FAFAFA] mb-2">Find your next hire</h2>
      <p className="text-sm text-[#555555] mb-8 text-center max-w-sm">
        Type a role, location, and skills — or click filters to narrow it down.
        AI will rank and score every result.
      </p>
      <div className="w-full max-w-sm space-y-2">
        <p className="text-xs text-[#555555] text-center mb-3">Try one of these</p>
        {EXAMPLES.map((ex, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl hover:border-[#333333] cursor-pointer transition-all group">
            <Search className="w-3.5 h-3.5 text-[#333333] group-hover:text-[#555555]" />
            <span className="text-sm text-[#555555] group-hover:text-[#A0A0A0]">{ex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
FILE 6 — app/api/search/route.ts [THE most important API route]
typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/redis/rate-limiter";
import { buildCacheKey, getCachedSearch, setCachedSearch } from "@/lib/redis/search-cache";
import { prospeoSearch } from "@/lib/prospeo/client";
import { buildProspeoFilters } from "@/lib/prospeo/filters";
import { processProspeoProfile } from "@/lib/prospeo/client";
import { scoreAndRankCandidates, applyHardFilters } from "@/lib/ai/scorer";
import { parseSearchQuery } from "@/lib/ai/search-parser";
import type { NexireSearchFilters } from "@/lib/prospeo/types";

const SearchRequestSchema = z.object({
  query:      z.string().max(500).optional().default(""),
  filters:    z.record(z.any()).optional().default({}),
  project_id: z.string().uuid().optional(),
  page:       z.number().int().min(1).max(20).optional().default(1),
});

// Plan result limits
const PLAN_RESULT_LIMITS: Record<string, number> = {
  free: 10, solo: 1500, growth: -1, custom: -1,
};

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Get profile + plan ────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_tier, credits_balance, results_used_mtd, org_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // ── Rate limit check (Redis) ──────────────────────────────
  const rateResult = await checkRateLimit(user.id, "search", profile.plan_tier as any);
  const rateError = rateLimitResponse(rateResult);
  if (rateError) {
    return NextResponse.json(rateError.body, {
      status: rateError.status,
      headers: rateError.headers,
    });
  }

  // ── Validate request body ─────────────────────────────────
  const body = await req.json();
  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { query, filters: rawFilters, project_id, page } = parsed.data;

  // ── Plan limit: monthly results ───────────────────────────
  const planLimit = PLAN_RESULT_LIMITS[profile.plan_tier] ?? 10;
  if (planLimit > 0 && profile.results_used_mtd >= planLimit) {
    return NextResponse.json({
      error: "PLAN_LIMIT",
      message: `Monthly result limit of ${planLimit} reached. Upgrade to continue.`,
    }, { status: 403 });
  }

  // ── Merge NLP parse + manual filters ─────────────────────
  const parsedQuery = query ? parseSearchQuery(query) : {};
  const nexireFilters: NexireSearchFilters = {
    ...parsedQuery,
    ...rawFilters,
    // Manual filters override NLP
  };

  // ── Fetch linked project for context ─────────────────────
  let projectJD: string | undefined;
  let projectNoticeMax: number | undefined;
  if (project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("jd_text, notice_max_days")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();
    projectJD = project?.jd_text ?? undefined;
    projectNoticeMax = project?.notice_max_days ?? undefined;
  }

  // ── Build Prospeo filters ─────────────────────────────────
  const prospeoFilters = buildProspeoFilters(nexireFilters);

  // ── Cache lookup (24h TTL) ────────────────────────────────
  const cacheKey = buildCacheKey(prospeoFilters, page);
  const cachedResponse = await getCachedSearch(cacheKey);
  let prospeoResult = cachedResponse;
  let isCached = !!cachedResponse;

  // ── Call Prospeo if not cached ────────────────────────────
  if (!prospeoResult) {
    try {
      prospeoResult = await prospeoSearch(prospeoFilters, page, 25);
      // Cache the raw Prospeo response
      await setCachedSearch(cacheKey, prospeoResult);
    } catch (err: any) {
      console.error("[Prospeo] Search failed:", err.message);
      return NextResponse.json({ error: "Search provider unavailable. Try again." }, { status: 503 });
    }
  }

  if (prospeoResult.status !== "success") {
    return NextResponse.json({ error: prospeoResult.error ?? "Search failed" }, { status: 500 });
  }

  // ── Upsert candidates into DB (no duplicates) ─────────────
  const profiles = prospeoResult.data.profiles;
  const processedCandidates = profiles.map(processProspeoProfile);

  // Batch upsert candidates
  if (processedCandidates.length > 0) {
    await supabase.from("candidates").upsert(
      processedCandidates.map(c => ({
        prospeo_id: c.prospeo_id,
        full_name: c.full_name,
        headline: c.headline,
        current_title: c.current_title,
        current_company: c.current_company,
        location_city: c.location_city,
        location_state: c.location_state,
        experience_years: c.experience_years,
        skills: c.skills,
        linkedin_url: c.linkedin_url,
        work_history_json: c.work_history_json,
        education_json: c.education_json,
      })),
      { onConflict: "prospeo_id", ignoreDuplicates: false }
    );
  }

  // ── AI Score + Rank ───────────────────────────────────────
  const scored = scoreAndRankCandidates({
    candidates: processedCandidates,
    searchFilters: nexireFilters,
    jdText: projectJD,
    projectNoticeMaxDays: projectNoticeMax,
  });

  // Apply hard notice filter if set
  const finalResults = nexireFilters.notice_max_days
    ? applyHardFilters(scored, nexireFilters)
    : scored;

  // ── Save search record to DB ──────────────────────────────
  const { data: savedSearch } = await supabase.from("searches").insert({
    user_id: user.id,
    project_id: project_id ?? null,
    query_text: query || null,
    filters_json: nexireFilters,
    result_count: finalResults.length,
    redis_cache_key: cacheKey,
  }).select("id").single();

  // ── Save search results ───────────────────────────────────
  if (savedSearch?.id && finalResults.length > 0) {
    // Get candidate DB IDs
    const { data: dbCandidates } = await supabase
      .from("candidates")
      .select("id, prospeo_id")
      .in("prospeo_id", finalResults.map(c => c.prospeo_id));

    const prospeoToDbId = Object.fromEntries(
      (dbCandidates ?? []).map(c => [c.prospeo_id, c.id])
    );

    const resultRows = finalResults
      .filter(c => prospeoToDbId[c.prospeo_id])
      .map(c => ({
        search_id:    savedSearch.id,
        candidate_id: prospeoToDbId[c.prospeo_id],
        ai_score:     c.ai_score,
        match_label:  c.match_label,
        match_reasons: c.match_reasons,
        rank_position: c.rank_position,
      }));

    if (resultRows.length > 0) {
      await supabase.from("search_results").upsert(resultRows, { onConflict: "search_id,candidate_id" });
    }
  }

  // ── Increment results_used_mtd (non-blocking) ─────────────
  if (!isCached) {
    supabase.from("profiles").update({
      results_used_mtd: profile.results_used_mtd + finalResults.length,
    }).eq("id", user.id).then(() => {});
  }

  // ── Return results ────────────────────────────────────────
  return NextResponse.json({
    results: finalResults,
    total: prospeoResult.data.total,
    page,
    has_more: prospeoResult.data.has_more,
    cached: isCached,
    search_id: savedSearch?.id,
  });
}
COMPLETION CHECKLIST
 app/(app)/search/page.tsx — server component, parallel profile + projects fetch

 SearchClient.tsx — search bar, filter toggle, plan usage bar, loading/empty/results states

 FilterPanel.tsx — all India-specific filters: titles, locations (grid), skills chips, seniority checkboxes, notice dropdown, experience range

 Notice period filter shows "🇮🇳 India" badge + disclaimer "estimated from tenure"

 SearchSkeleton.tsx — 6 skeleton cards while loading

 SearchEmpty.tsx — example queries shown

 api/search/route.ts — full orchestration: auth → rate limit → cache → Prospeo → score → save

 Cached results show "Cached · no credits used" badge

 Rate limit 429 shows toast with retry time

 Plan limit 403 shows upgrade toast

BUILD LOG ENTRY
M03-04 Search Page — [date]
Files: search/page.tsx, SearchClient.tsx, FilterPanel.tsx, SearchSkeleton.tsx, SearchEmpty.tsx, api/search/route.ts
Flow: Rate limit → Cache check → Prospeo → AI score → DB save → return
India filters: Notice period (estimated) + Experience range
Status: ✅ Complete