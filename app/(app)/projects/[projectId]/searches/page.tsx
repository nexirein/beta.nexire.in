"use client";

/**
 * app/(app)/projects/[projectId]/searches/page.tsx
 * Phase 2 — Searches list for a project.
 * Shows all searches as cards with filter summaries, type badge, result count, date.
 * URL state: ?contact= drives profile panel open/close.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Search, Sparkles, SlidersHorizontal, Calendar, Users, Loader2, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SavedSearch {
  id: string;
  name: string;
  created_at: string;
  filters_json: Record<string, unknown>;
  result_count: number | null;
  search_type: "FILTER_SEARCH" | "JD_SEARCH" | null;
}

interface Project {
  id: string;
  title: string;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function getFilterSummaryTags(filters: Record<string, unknown>): string[] {
  const tags: string[] = [];
  const f = filters as Record<string, unknown>;

  if ((f.job_title as { include?: string[] })?.include?.[0]) {
    tags.push((f.job_title as { include: string[] }).include[0]);
  }
  if ((f.location as { name?: string })?.name) {
    tags.push((f.location as { name: string }).name);
  }
  if ((f.person_seniority as { include?: string[] })?.include?.[0]) {
    tags.push((f.person_seniority as { include: string[] }).include[0]);
  }
  if ((f.company_headcount_range as { include?: string[] })?.include?.[0]) {
    tags.push((f.company_headcount_range as { include: string[] }).include[0]);
  }
  if ((f.company_technology as { include?: string[] })?.include?.[0]) {
    tags.push((f.company_technology as { include: string[] }).include[0]);
  }

  return tags.slice(0, 3);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SearchesListPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, searchRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/searches`),
      ]);
      const projData = await projRes.json();
      const searchData = await searchRes.json();

      if (projData.project) setProject(projData.project);
      if (searchData.searches) setSearches(searchData.searches);
    } catch {/* silent */} finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#52525B] mb-1">
            <a href="/projects" className="hover:text-[#A1A1AA] transition-colors">Projects</a>
            <span>/</span>
            <span className="text-[#A1A1AA]">{project?.title ?? "…"}</span>
          </div>
          <h1 className="text-xl font-bold text-white">Searches</h1>
          <p className="mt-0.5 text-sm text-[#52525B]">
            {searches.length} search{searches.length !== 1 ? "es" : ""} in this project
          </p>
        </div>
        <button
          onClick={() => router.push(`/search?project=${projectId}`)}
          className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition-all hover:bg-[#6d28d9]"
        >
          <Plus className="h-4 w-4" />
          New Search
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#52525B]" />
        </div>
      ) : searches.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-20 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#7C3AED]/10 blur-2xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1A1A1A] bg-[#111111]">
              <FileSearch className="h-8 w-8 text-[#52525B]" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No searches yet</h3>
            <p className="mt-1.5 max-w-xs text-sm text-[#52525B] leading-relaxed">
              Describe who you&apos;re looking for and Nexire will find the best candidates.
            </p>
          </div>
          <button
            onClick={() => router.push(`/search?project=${projectId}`)}
            className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition-all hover:bg-[#6d28d9]"
          >
            <Plus className="h-4 w-4" />
            New Search
          </button>
        </div>
      ) : (
        /* ── Search Cards Grid ── */
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {searches.map((s) => {
            const tags = getFilterSummaryTags(s.filters_json ?? {});
            const isAI = s.search_type === "JD_SEARCH";

            return (
              <div
                key={s.id}
                onClick={() => router.push(`/projects/${projectId}/searches/${s.id}`)}
                className="group cursor-pointer rounded-2xl border border-[#222222] bg-[#111111] p-5 transition-all hover:border-[#7C3AED]/30 hover:bg-[#161616]"
              >
                {/* Top row */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="flex-1 text-sm font-semibold text-white leading-snug group-hover:text-[#A855F7] transition-colors">
                    {s.name}
                  </h3>
                  <span className={cn(
                    "flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border",
                    isAI
                      ? "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#A855F7]"
                      : "border-[#222222] bg-transparent text-[#52525B]"
                  )}>
                    {isAI ? <><Sparkles className="h-2.5 w-2.5" /> AI</> : <><SlidersHorizontal className="h-2.5 w-2.5" /> Filter</>}
                  </span>
                </div>

                {/* Filter tags */}
                {tags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-md border border-[#1A1A1A] bg-[#0A0A0A] px-2 py-0.5 text-[11px] text-[#A1A1AA]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom row */}
                <div className="flex items-center gap-4 text-xs text-[#52525B]">
                  {s.result_count !== null && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {s.result_count.toLocaleString()} results
                    </span>
                  )}
                  <span className="flex items-center gap-1 ml-auto">
                    <Calendar className="h-3 w-3" />
                    {formatDate(s.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
