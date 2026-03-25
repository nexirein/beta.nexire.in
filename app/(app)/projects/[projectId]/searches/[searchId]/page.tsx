"use client";

/**
 * app/(app)/projects/[projectId]/searches/[searchId]/page.tsx
 * Phase 2 — Search Results page.
 * URL-driven state: ?contact=person_id opens profile panel, ?page=N loads page N.
 * All state lives in the URL → shareable links like Juicebox.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Star, StarOff, Mail, Users, ChevronLeft, ChevronRight,
  Loader2, ExternalLink, MapPin, Briefcase, Building2, X, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Candidate {
  person_id: string;
  full_name: string;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location_city: string | null;
  location_country: string | null;
  experience_years: number | null;
  skills: string[];
  linkedin_url: string | null;
  email: string | null;
  phone: string | null;
  estimated_notice_days: number | null;
  notice_label: string | null;
}

interface SearchMeta {
  id: string;
  name: string;
  result_count: number;
  created_at: string;
  search_type: string | null;
  filters_json: Record<string, unknown>;
}

interface Pagination {
  page: number;
  totalResults: number;
  totalPages: number;
  hasMore: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SearchResultsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const searchId = params.searchId as string;

  // URL-driven state
  const currentPage = parseInt(searchParams.get("page") ?? "1");
  const openContactId = searchParams.get("contact");

  const [search, setSearch] = useState<SearchMeta | null>(null);
  const [results, setResults] = useState<Candidate[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const [revealedEmails, setRevealedEmails] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active profile panel (from URL ?contact=)
  const activeCandidate = results.find((r) => r.person_id === openContactId) ?? null;

  // ── Load results ────────────────────────────────────────────────────────────
  const loadResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/searches/${searchId}?page=${currentPage}`
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "Failed to load results");
        return;
      }

      setSearch(data.search);
      setResults(data.results ?? []);
      setPagination(data.pagination);

      // Pre-populate already-revealed emails
      const emailMap: Record<string, string> = {};
      (data.results ?? []).forEach((c: Candidate) => {
        if (c.email) emailMap[c.person_id] = c.email;
      });
      setRevealedEmails((prev) => ({ ...prev, ...emailMap }));
    } catch {
      setError("Network error — please refresh.");
    } finally {
      setLoading(false);
    }
  }, [projectId, searchId, currentPage]);

  useEffect(() => { loadResults(); }, [loadResults]);

  // ── Mark viewed when profile panel opens ────────────────────────────────────
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (openContactId && !viewedRef.current.has(openContactId)) {
      viewedRef.current.add(openContactId);
      fetch(`/api/searches/${searchId}/results/${openContactId}/viewed`, {
        method: "PATCH",
      }).catch(() => {});
    }
  }, [openContactId, searchId]);

  // ── URL helpers ─────────────────────────────────────────────────────────────
  function openContact(personId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("contact", personId);
    router.push(url.pathname + url.search);
  }

  function closeContact() {
    const url = new URL(window.location.href);
    url.searchParams.delete("contact");
    router.push(url.pathname + url.search);
  }

  function navigatePage(page: number) {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    url.searchParams.delete("contact");
    router.push(url.pathname + url.search);
  }

  // ── Toggle shortlist ────────────────────────────────────────────────────────
  async function toggleShortlist(personId: string) {
    const isShortlisted = shortlisted.has(personId);
    const method = isShortlisted ? "DELETE" : "POST";

    try {
      const res = await fetch(`/api/searches/${searchId}/results/${personId}/shortlist`, {
        method,
      });
      if (res.ok) {
        setShortlisted((prev) => {
          const next = new Set(prev);
          isShortlisted ? next.delete(personId) : next.add(personId);
          return next;
        });
        toast.success(isShortlisted ? "Removed from shortlist" : "Added to shortlist!");
      }
    } catch {
      toast.error("Failed to update shortlist");
    }
  }

  // ── Reveal email ────────────────────────────────────────────────────────────
  async function revealEmail(personId: string) {
    if (revealedEmails[personId]) return;
    setRevealingId(personId);

    try {
      const res = await fetch(`/api/searches/${searchId}/results/${personId}/reveal-email`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.email) {
        setRevealedEmails((prev) => ({ ...prev, [personId]: data.email }));
        toast.success("Email revealed!");
      } else {
        toast.error(data.message ?? "Could not reveal email");
      }
    } catch {
      toast.error("Network error revealing email");
    } finally {
      setRevealingId(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-0 overflow-hidden -m-6">
      {/* ── Results List ── */}
      <div className={cn(
        "flex flex-1 flex-col overflow-hidden transition-all duration-300",
        activeCandidate ? "w-[calc(100%-380px)]" : "w-full"
      )}>
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-[#1A1A1A] bg-[#0A0A0A] px-6 py-3">
          <button
            onClick={() => router.push(`/projects/${projectId}/searches`)}
            className="flex items-center gap-1.5 text-xs text-[#52525B] hover:text-[#A1A1AA] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-[#52525B]">/</span>
          <span className="text-sm font-medium text-white truncate">
            {search?.name ?? "Search Results"}
          </span>
          {search?.result_count != null && (
            <span className="ml-auto flex items-center gap-1 text-xs text-[#52525B]">
              <Users className="h-3 w-3" />
              {search.result_count.toLocaleString()} total
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-[#52525B]" />
              <p className="text-sm text-[#52525B]">Loading results…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <AlertCircle className="h-8 w-8 text-[#EF4444]" />
            <p className="text-sm text-[#A1A1AA]">{error}</p>
            <button
              onClick={loadResults}
              className="rounded-xl border border-[#222222] px-4 py-2 text-xs font-medium text-[#A1A1AA] hover:border-[#333333] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Candidate rows */}
            <div className="divide-y divide-[#1A1A1A]">
              {results.map((candidate) => {
                const isOpen = candidate.person_id === openContactId;
                const isStarred = shortlisted.has(candidate.person_id);

                return (
                  <div
                    key={candidate.person_id}
                    onClick={() => openContact(candidate.person_id)}
                    className={cn(
                      "group flex cursor-pointer items-start gap-4 px-6 py-4 transition-colors",
                      isOpen ? "bg-[#7C3AED]/5 border-l-2 border-[#7C3AED]" : "hover:bg-[#111111]"
                    )}
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] text-sm font-bold text-[#A855F7]">
                      {candidate.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{candidate.full_name}</p>
                          {candidate.current_title && (
                            <p className="mt-0.5 text-xs text-[#A1A1AA]">
                              {candidate.current_title}
                              {candidate.current_company && <span className="text-[#52525B]"> · {candidate.current_company}</span>}
                            </p>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleShortlist(candidate.person_id)}
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                              isStarred
                                ? "text-[#F59E0B] hover:bg-[#F59E0B]/10"
                                : "text-[#52525B] hover:bg-[#1A1A1A] hover:text-[#A1A1AA]"
                            )}
                            title={isStarred ? "Remove from shortlist" : "Add to shortlist"}
                          >
                            {isStarred ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => revealEmail(candidate.person_id)}
                            disabled={revealingId === candidate.person_id}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#1A1A1A] hover:text-[#A1A1AA] disabled:opacity-50"
                            title={revealedEmails[candidate.person_id] ?? "Reveal email (1 credit)"}
                          >
                            {revealingId === candidate.person_id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Mail className="h-3.5 w-3.5" />}
                          </button>
                          {candidate.linkedin_url && (
                            <a
                              href={candidate.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#1A1A1A] hover:text-[#A1A1AA]"
                              title="Open LinkedIn"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Meta chips */}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {candidate.location_city && (
                          <span className="flex items-center gap-1 text-[11px] text-[#52525B]">
                            <MapPin className="h-3 w-3" />
                            {candidate.location_city}{candidate.location_country ? `, ${candidate.location_country}` : ""}
                          </span>
                        )}
                        {candidate.experience_years != null && (
                          <span className="flex items-center gap-1 text-[11px] text-[#52525B]">
                            <Briefcase className="h-3 w-3" />
                            {candidate.experience_years}y exp
                          </span>
                        )}
                        {candidate.notice_label && (
                          <span className="rounded-md border border-[#1A1A1A] bg-[#0A0A0A] px-2 py-0.5 text-[10px] text-[#52525B]">
                            Notice: {candidate.notice_label}
                          </span>
                        )}
                        {revealedEmails[candidate.person_id] && (
                          <span className="rounded-md border border-[#10B981]/20 bg-[#10B981]/8 px-2 py-0.5 text-[10px] text-[#10B981]">
                            {revealedEmails[candidate.person_id]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 border-t border-[#1A1A1A] py-4">
                <button
                  onClick={() => navigatePage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#222222] text-[#52525B] transition-colors hover:border-[#333333] hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-[#52525B]">
                  Page {currentPage} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => navigatePage(currentPage + 1)}
                  disabled={!pagination.hasMore}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#222222] text-[#52525B] transition-colors hover:border-[#333333] hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Profile Panel (URL-driven) ── */}
      {activeCandidate && (
        <div className="flex w-[380px] flex-shrink-0 flex-col border-l border-[#1A1A1A] bg-[#0D0D0D] overflow-y-auto">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[#1A1A1A] px-5 py-4">
            <p className="text-sm font-semibold text-white">{activeCandidate.full_name}</p>
            <button
              onClick={closeContact}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#1A1A1A] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 p-5 space-y-5">
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#7C3AED]/20 text-base font-bold text-[#A855F7]">
                {activeCandidate.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white">{activeCandidate.full_name}</p>
                <p className="text-xs text-[#52525B]">{activeCandidate.headline}</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2.5">
              {activeCandidate.current_title && (
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="h-4 w-4 flex-shrink-0 text-[#52525B]" />
                  <span className="text-[#A1A1AA]">{activeCandidate.current_title}</span>
                </div>
              )}
              {activeCandidate.current_company && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 flex-shrink-0 text-[#52525B]" />
                  <span className="text-[#A1A1AA]">{activeCandidate.current_company}</span>
                </div>
              )}
              {(activeCandidate.location_city || activeCandidate.location_country) && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-[#52525B]" />
                  <span className="text-[#A1A1AA]">
                    {[activeCandidate.location_city, activeCandidate.location_country].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Email section */}
            <div className="rounded-xl border border-[#222222] bg-[#111111] p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#52525B]">Contact</p>
              {revealedEmails[activeCandidate.person_id] ? (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-[#10B981]" />
                  <a
                    href={`mailto:${revealedEmails[activeCandidate.person_id]}`}
                    className="text-sm text-[#10B981] hover:underline"
                  >
                    {revealedEmails[activeCandidate.person_id]}
                  </a>
                </div>
              ) : (
                <button
                  onClick={() => revealEmail(activeCandidate.person_id)}
                  disabled={revealingId === activeCandidate.person_id}
                  className="flex items-center gap-2 rounded-xl bg-[#7C3AED]/10 border border-[#7C3AED]/20 px-3 py-2 text-xs font-medium text-[#A855F7] transition-all hover:bg-[#7C3AED]/20 disabled:opacity-50"
                >
                  {revealingId === activeCandidate.person_id
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Revealing…</>
                    : <><Mail className="h-3 w-3" /> Reveal Email (1 credit)</>
                  }
                </button>
              )}
            </div>

            {/* Skills */}
            {activeCandidate.skills?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#52525B]">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeCandidate.skills.slice(0, 15).map((s) => (
                    <span key={s} className="rounded-md border border-[#1A1A1A] bg-[#0A0A0A] px-2 py-0.5 text-[11px] text-[#A1A1AA]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {activeCandidate.linkedin_url && (
                <a
                  href={activeCandidate.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#222222] py-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:border-[#333333] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              )}
              <button
                onClick={() => toggleShortlist(activeCandidate.person_id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-all",
                  shortlisted.has(activeCandidate.person_id)
                    ? "bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-[#F59E0B]"
                    : "bg-[#7C3AED] text-white hover:bg-[#6d28d9]"
                )}
              >
                <Star className="h-3.5 w-3.5" />
                {shortlisted.has(activeCandidate.person_id) ? "Shortlisted" : "Shortlist"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
