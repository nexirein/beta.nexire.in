"use client";
/**
 * SearchResults.tsx — Juicebox-inspired split-panel candidate list
 *
 * Left panel: Rich candidate rows with:
 *   - Name + LinkedIn icon (official color)
 *   - {Title} at {Company} · {Location}  (with company logo inline)
 *   - Education institute (with logo below)
 *   - AI score pill on the right
 *   - AI Insight (streamed, highlighted)
 * Right panel: CandidateDrawer — full-viewport overlay
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CandidateProfilePanel } from "./CandidateProfilePanel";
import { CandidateDrawer } from "./CandidateDrawer";
import { EnrollSequenceModal } from "./EnrollSequenceModal";
import { InsightText } from "@/components/search/InsightText";
import type { ScoredCandidate } from "@/lib/ai/scorer";
import {
  MapPin, ChevronRight, ChevronLeft, Mail, Phone, Sparkles,
  ArrowUp, ArrowDown, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { sanitizeTitle } from "@/lib/utils/sanitizeTitle";
import { CompanyHoverCard } from "@/components/search/CompanyHoverCard";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";

/** How many profiles are revealed per batch before the next group streams in */
const BATCH_SIZE = 5;

const LOGO_DEV_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN ?? "pk_JgbzA-I-Ssu_JN0iUMq1rQ";

// Global caches for Institute logos
const LOGO_SEARCH_CACHE: Record<string, string> = {};
const IN_FLIGHT_LOGO_SEARCHES = new Set<string>();

// ── Icons ────────────────────────────────────────────────────────────────────
function LinkedInLogo({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// ── Inline company logo ──────────────────────────────────────────────────────
function CompanyLogo({ domain, name, size = 16 }: { domain?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const clean = domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  if (clean && !failed) {
    return (
      <img
        src={`https://img.logo.dev/${clean}?token=${LOGO_DEV_KEY}&size=32`}
        alt={name}
        width={size} height={size}
        className="rounded object-contain bg-white border border-gray-100 flex-shrink-0"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="text-[8px] font-bold text-indigo-500 leading-none">{initials.charAt(0) || "?"}</span>
    </div>
  );
}

// ── Institute avatar (small) ─────────────────────────────────────────────────
function InstituteAvatar({ logoUrl, name, size = 14 }: { logoUrl?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [fallbackDomain, setFallbackDomain] = useState<string | null>(LOGO_SEARCH_CACHE[name] || null);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

  useEffect(() => {
    if (LOGO_SEARCH_CACHE[name] && !fallbackDomain) { setFallbackDomain(LOGO_SEARCH_CACHE[name]); return; }
    if ((!logoUrl || failed) && name && !fallbackDomain && !loadingFallback && !IN_FLIGHT_LOGO_SEARCHES.has(name)) {
      setLoadingFallback(true);
      IN_FLIGHT_LOGO_SEARCHES.add(name);
      fetch(`/api/logo/search?name=${encodeURIComponent(name)}`)
        .then(r => r.json()).then(d => { if (d.domain) { LOGO_SEARCH_CACHE[name] = d.domain; setFallbackDomain(d.domain); } })
        .catch(() => {}).finally(() => setLoadingFallback(false));
    }
  }, [logoUrl, failed, name, fallbackDomain, loadingFallback]);

  if (logoUrl && !failed) {
    return <img src={logoUrl} alt={name} width={size} height={size} className="rounded-sm object-contain bg-white border border-gray-100 flex-shrink-0" style={{ width: size, height: size }} onError={() => setFailed(true)} />;
  }
  if (fallbackDomain) {
    return <img src={`https://img.logo.dev/${fallbackDomain}?token=${LOGO_DEV_KEY}&size=32`} alt={name} width={size} height={size} className="rounded-sm object-contain bg-white border border-gray-100 flex-shrink-0" style={{ width: size, height: size }} onError={() => setFallbackDomain(null)} />;
  }
  return (
    <div
      className="rounded-sm bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="text-[7px] font-bold text-violet-500 leading-none">{initials.charAt(0) || "?"}</span>
    </div>
  );
}

// ── Profile avatar ───────────────────────────────────────────────────────────
function ProfileAvatar({ url, permalink, name, size = 32 }: { url?: string | null; permalink?: string | null; name: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(url ?? null);
  const [usedPermalink, setUsedPermalink] = useState(false);
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  if (src) {
    const proxiedSrc = getProxiedImageUrl(src);
    return (
      <img src={proxiedSrc ?? ""} alt={name} width={size} height={size}
        className="rounded-full object-cover ring-2 ring-indigo-50 flex-shrink-0"
        style={{ width: size, height: size }}
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
        onError={() => {
          if (!usedPermalink && permalink) { setUsedPermalink(true); setSrc(permalink); }
          else setSrc(null);
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 flex items-center justify-center font-bold text-indigo-600 flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials || "?"}
    </div>
  );
}

// ── Score pill ───────────────────────────────────────────────────────────────
function ScorePill({ score }: { score: number }) {
  if (score >= 80) return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[13px] font-bold text-emerald-700 tabular-nums leading-none">{score}</span>
      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Excellent
      </span>
    </div>
  );
  if (score >= 65) return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[13px] font-bold text-indigo-700 tabular-nums leading-none">{score}</span>
      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-indigo-600 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
        Strong
      </span>
    </div>
  );
  if (score >= 50) return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[13px] font-bold text-amber-700 tabular-nums leading-none">{score}</span>
      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        Good
      </span>
    </div>
  );
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[13px] font-bold text-gray-500 tabular-nums leading-none">{score}</span>
      <span className="flex items-center gap-0.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
        Potential
      </span>
    </div>
  );
}

// ── Pagination helpers ───────────────────────────────────────────────────────
function getVisiblePages(current: number, total: number): (number | string)[] {
  const maxPages = 5;
  const pages: (number | string)[] = [];
  let start = Math.max(1, current - Math.floor(maxPages / 2));
  let end = start + maxPages - 1;
  if (end > total) { end = total; start = Math.max(1, end - maxPages + 1); }
  if (start > 1) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total) pages.push("...");
  return pages;
}

const listItem = {
  hidden: { opacity: 0, x: -4 },
  show: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 320, damping: 30 } },
};

interface SearchResultsProps {
  results: ScoredCandidate[];
  /** ID of the current search_conversation — used for AI insight SSE + cache */
  searchId?: string;
  /** Keywords from the search intent for highlighting */
  titleKeywords?: string[];
  skillKeywords?: string[];
  pagination?: {
    uiPage: number;
    totalPages: number;
    total: number;
    hasNextCursor: boolean;
    onPageChange: (p: number) => void;
    searching: boolean;
  };
}

export function SearchResults({
  results,
  pagination,
  searchId,
  titleKeywords = [],
  skillKeywords = [],
}: SearchResultsProps) {
  const [localResults, setLocalResults] = useState(results);
  const [enrollCandidate, setEnrollCandidate] = useState<ScoredCandidate | null>(null);

  // ── Full-viewport drawer state ───────────────────────────────────────────
  const [drawerCandidate, setDrawerCandidate] = useState<ScoredCandidate | null>(null);
  const [drawerIdx, setDrawerIdx] = useState<number | null>(null);

  // ── Batch progressive loading — reveal BATCH_SIZE profiles at a time ─────
  // visibleCount starts at BATCH_SIZE and grows by BATCH_SIZE every 1.5s
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Insight enable gate — a card's insight only starts when visible ───────
  // We track which person_ids have their insights enabled
  const [insightEnabled, setInsightEnabled] = useState<Set<string>>(new Set());

  // Portal-based Hover Card State
  const [hoveredCompanyIdx, setHoveredCompanyIdx] = useState<number | null>(null);
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalResults(results);
    // Reset batch reveal whenever results change
    setVisibleCount(BATCH_SIZE);
    setInsightEnabled(new Set());
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
  }, [results]);

  // Progressive batch reveal timer
  useEffect(() => {
    if (visibleCount >= localResults.length) return;
    batchTimerRef.current = setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, localResults.length));
    }, 1600); // stagger 1.6s between batches
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [visibleCount, localResults.length]);

  // Enable insights for all currently visible cards
  useEffect(() => {
    if (!searchId) return;
    const visible = localResults.slice(0, visibleCount);
    setInsightEnabled((prev) => {
      const next = new Set(prev);
      visible.forEach((c) => next.add(c.person_id));
      return next;
    });
  }, [visibleCount, localResults, searchId]);

  const handleRevealSuccess = (personId: string, type: "email" | "phone", data: { email?: string; phone?: string }) => {
    setLocalResults((prev: ScoredCandidate[]) =>
      prev.map((c: ScoredCandidate) => c.person_id !== personId ? c : {
        ...c,
        ...(type === "email" && data.email ? { email: data.email } : {}),
        ...(type === "phone" && data.phone ? { phone: data.phone } : {}),
      })
    );
  };

  const handleCompanyMouseEnter = (e: React.MouseEvent, idx: number) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    showTimeoutRef.current = setTimeout(() => {
      setHoverAnchorRect(rect);
      setHoveredCompanyIdx(idx);
    }, 400); // 400ms intentional delay to avoid flicker when moving through list
  };

  const handleCompanyMouseLeave = () => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredCompanyIdx(null);
      setHoverAnchorRect(null);
    }, 150);
  };



  const drawerOpen = drawerCandidate !== null;

  return (
    <div className="flex h-full">
      {/* ── Left: Candidate List ──────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col border-r border-gray-200 bg-white overflow-hidden transition-all duration-300",
          drawerOpen ? "w-[55%] flex-shrink-0" : "flex-1"
        )}
      >
        {/* List header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[14px] font-bold text-gray-900">
              {localResults.length} Matches
            </span>
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full shadow-sm">
              <Sparkles className="w-2.5 h-2.5" />
              AI Ranked
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-gray-400 font-medium">
              Click a row to view profile →
            </span>
          </div>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto bg-gray-50/20">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.03 } } }}
            className="flex flex-col"
          >
            {localResults.map((c, idx) => {
              const isSelected = idx === drawerIdx;
              const raw: any = c.raw_crustdata_json ?? {};
              const emp0 = raw.current_employers?.[0] ?? null;
              const edu0 = raw.education_background?.[0] ?? null;
              const companyDomain = emp0?.company_website_domain ?? null;
              const companyDesc = emp0?.company_description ?? null;
              const companyType = emp0?.company_type ?? null;
              const companyHq = emp0?.company_hq_location ?? emp0?.location ?? null;
              const headcount = emp0?.company_headcount_range ?? emp0?.company_headcount_latest ?? null;
              const industry = emp0?.company_industries?.[0] ?? null;
              const seniority = emp0?.seniority_level ?? null;
              const companyLinkedin = emp0?.company_linkedin_url ?? emp0?.linkedin_url ?? null;
              const companyWebsite = emp0?.company_website ?? (companyDomain ? `https://${companyDomain}` : undefined);

              const hasContact = !!(c.email || c.phone);
              const locationStr = [c.location_city, c.location_state, c.location_country].filter(Boolean).join(", ");
              const displayTitle = sanitizeTitle(c.current_title || "");

              // Only render up to visibleCount (progressive batch loading)
              if (idx >= visibleCount) {
                // For cards beyond current batch, show skeleton placeholder
                return (
                  <div
                    key={`skeleton-${idx}`}
                    className="px-5 py-3.5 border-b border-gray-100 animate-pulse flex items-start gap-3.5"
                  >
                    <div className="w-5 pt-2 flex-shrink-0">
                      <div className="w-3 h-2.5 bg-gray-100 rounded" />
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="w-2/5 h-3.5 bg-gray-100 rounded-full" />
                      <div className="w-3/5 h-2.5 bg-gray-100 rounded-full" />
                      <div className="w-1/3 h-2.5 bg-gray-100 rounded-full" />
                      {/* Insight skeleton */}
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
                        <div className="w-full h-2 bg-gray-100 rounded-full" />
                        <div className="w-4/5 h-2 bg-gray-100 rounded-full" />
                      </div>
                    </div>
                    <div className="w-10 h-7 bg-gray-100 rounded-lg flex-shrink-0" />
                  </div>
                );
              }

              return (
                <motion.button
                  id={`candidate-row-${idx}`}
                  key={c.person_id}
                  variants={listItem}
                  onClick={() => {
                    setDrawerCandidate(c);
                    setDrawerIdx(idx);
                  }}
                  className={cn(
                    "w-full text-left px-5 py-3.5 border-b border-gray-100 transition-colors duration-150 relative group",
                    "border-l-[3px]",
                    isSelected
                      ? "bg-indigo-50/60 border-l-indigo-600 shadow-[inset_0_1px_4px_rgba(0,0,0,0.02)]"
                      : "bg-white hover:bg-gray-50 border-l-transparent"
                  )}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Rank */}
                    <div className="w-5 pt-[10px] flex-shrink-0 text-center">
                      <span className={cn(
                        "text-[10.5px] font-mono tabular-nums",
                        isSelected ? "text-indigo-400 font-semibold" : "text-gray-300"
                      )}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                    </div>

                    {/* Avatar */}
                    <div className="flex-shrink-0 pt-0.5">
                      <ProfileAvatar
                        url={raw.profile_picture_url}
                        permalink={raw.profile_picture_permalink}
                        name={c.full_name}
                        size={40}
                      />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">

                      {/* Name row */}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn(
                          "text-[14.5px] font-bold leading-tight truncate tracking-tight delay-100 transition-colors",
                          isSelected ? "text-indigo-800" : "text-gray-900 group-hover:text-indigo-700"
                        )}>
                          {c.full_name}
                        </span>
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0 text-[#0A66C2]/70 hover:text-[#0A66C2] transition-colors">
                            <LinkedInLogo className="w-4 h-4" />
                          </a>
                        )}
                        {hasContact && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 shadow-sm shadow-emerald-500/30" title="Contact revealed" />
                        )}
                        {c.open_to_work && (
                          <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold tracking-wide flex-shrink-0">
                            OPEN
                          </span>
                        )}
                      </div>

                      {/* Title at Company · Location */}
                      <div className="mt-1 flex items-center text-[12px] text-gray-500 flex-wrap">
                        {displayTitle && <span className="font-medium text-gray-700">{displayTitle}</span>}
                        {displayTitle && c.current_company && <span className="mx-1 text-gray-400">at</span>}
                        {c.current_company && (
                          <div className="flex min-w-0 items-center">
                            <button
                              onMouseEnter={(e) => handleCompanyMouseEnter(e, idx)}
                              onMouseLeave={handleCompanyMouseLeave}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex min-w-0 items-center gap-1.5 text-indigo-700 font-semibold hover:text-indigo-800 hover:underline transition-colors"
                            >
                              <CompanyLogo domain={companyDomain} name={c.current_company} size={16} />
                              <span className="truncate flex-1 min-w-0 block">{c.current_company}</span>
                            </button>
                          </div>
                        )}
                        {locationStr && (
                          <span className="text-[11.5px] text-gray-400 ml-1.5 flex items-center gap-0.5 border-l border-gray-200 pl-1.5 flex-shrink-0">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span>{locationStr}</span>
                          </span>
                        )}
                      </div>

                      {/* Portal Hover Card handling */}
                      <AnimatePresence>
                        {hoveredCompanyIdx === idx && hoverAnchorRect && (
                          <div
                            onMouseEnter={() => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current); }}
                            onMouseLeave={handleCompanyMouseLeave}
                          >
                            <CompanyHoverCard
                              companyName={c.current_company || "Unknown Company"}
                              domain={companyDomain}
                              industry={industry}
                              headcount={headcount}
                              location={companyHq}
                              description={companyDesc}
                              website={companyWebsite}
                              linkedinUrl={companyLinkedin}
                              companyType={companyType}
                              seniority={seniority}
                              anchorRect={hoverAnchorRect}
                            />
                          </div>
                        )}
                      </AnimatePresence>

                      {/* Education row */}
                      {edu0?.institute_name && (
                        <div className="flex items-center gap-1.5 mt-1.5 pl-0.5">
                          <InstituteAvatar logoUrl={edu0.institute_logo_url} name={edu0.institute_name} size={14} />
                          <span className="text-[11.5px] text-gray-400 leading-tight">
                            {edu0.degree_name
                              ? <><span className="text-violet-600 font-medium">{edu0.degree_name}</span>{" "}<span className="text-gray-400">{edu0.institute_name}</span></>
                              : edu0.institute_name
                            }
                          </span>
                        </div>
                      )}

                      {/* Contact revealed chips */}
                      {hasContact && (
                        <div className="flex items-center gap-2 mt-2">
                          {c.email && (
                            <span className="flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 font-medium">
                              <Mail className="w-3 h-3" />
                              {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 font-medium">
                              <Phone className="w-3 h-3" />
                              {c.phone}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Score */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
                      <ScorePill score={c.ai_score} />
                    </div>

                    {/* Chevron for selected */}
                    {isSelected && (
                      <ChevronRight className="w-4 h-4 text-indigo-400 flex-shrink-0 self-center opacity-80" />
                    )}
                  </div>

                  {/* ── AI Insight — below the main row content ────────── */}
                  {searchId && insightEnabled.has(c.person_id) && (
                    <div className="pl-[76px] pr-2 pointer-events-none">
                      <InsightText
                        personId={c.person_id}
                        searchId={searchId}
                        enabled={insightEnabled.has(c.person_id)}
                        titleKeywords={titleKeywords}
                        skillKeywords={skillKeywords}
                        contextData={{
                          currentTitle: emp0?.title ?? c.current_title ?? "Unknown Title",
                          currentCompany: emp0?.name ?? c.current_company ?? "Unknown Company",
                          experienceYears: c.experience_years ?? 0,
                          skills: Array.isArray(c.skills) ? c.skills.slice(0, 5) : [],
                          educationStr: edu0 ? `${edu0.degree_name ? edu0.degree_name + " from " : ""}${edu0.institute_name ?? ""}` : null,
                          summary: raw?.summary ?? c.headline ?? null,
                          ai_insight: c.ai_insight
                        }}
                      />
                    </div>
                  )}
                </motion.button>
              );
            })}

            {/* Pagination... */}
            {pagination && pagination.totalPages > 1 && (
              <div className="py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 border-t border-gray-100 bg-white">
                <div className="text-[12.5px] text-gray-500">
                  Showing{" "}
                  <span className="font-semibold text-gray-900">{(pagination.uiPage - 1) * 15 + 1}</span>
                  {" – "}
                  <span className="font-semibold text-gray-900">{Math.min(pagination.uiPage * 15, pagination.total)}</span>
                  {" of "}
                  <span className="font-semibold text-gray-900">{pagination.total.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => pagination.onPageChange(pagination.uiPage - 1)}
                    disabled={pagination.uiPage <= 1 || pagination.searching}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  {getVisiblePages(
                    pagination.uiPage,
                    Math.max(pagination.totalPages, pagination.uiPage + (pagination.hasNextCursor ? 1 : 0))
                  ).map((p, i) =>
                    typeof p === "number" ? (
                      <button
                        key={i}
                        onClick={() => pagination.onPageChange(p)}
                        disabled={pagination.searching}
                        className={cn(
                          "w-8 h-8 flex items-center justify-center rounded-lg text-[13px] font-bold transition-all",
                          p === pagination.uiPage
                            ? "bg-indigo-600 text-white shadow-md"
                            : "hover:bg-gray-100 text-gray-600 border border-transparent hover:border-gray-200"
                        )}
                      >
                        {p}
                      </button>
                    ) : (
                      <span key={i} className="w-8 h-8 flex items-center justify-center text-gray-400">...</span>
                    )
                  )}
                  <button
                    onClick={() => pagination.onPageChange(pagination.uiPage + 1)}
                    disabled={(pagination.uiPage >= pagination.totalPages && !pagination.hasNextCursor) || pagination.searching}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
            
            <div className="h-6 bg-white border-t border-gray-100" />
            
          </motion.div>
        </div>
      </div>

      {/* ── Full-Viewport Candidate Drawer (Quick Preview) ─────────────── */}
      <CandidateDrawer
        candidate={drawerCandidate}
        isOpen={drawerOpen}
        onClose={() => { setDrawerCandidate(null); setDrawerIdx(null); }}
        onSequenceEnroll={setEnrollCandidate}
        onRevealSuccess={(pid, type, data) =>
          handleRevealSuccess(pid, type, data as { email?: string; phone?: string })
        }
        onPrev={() => {
          if (drawerIdx !== null && drawerIdx > 0) {
            const prevIdx = drawerIdx - 1;
            setDrawerIdx(prevIdx);
            setDrawerCandidate(localResults[prevIdx]);
          }
        }}
        onNext={() => {
          if (drawerIdx !== null && drawerIdx < localResults.length - 1) {
            const nextIdx = drawerIdx + 1;
            setDrawerIdx(nextIdx);
            setDrawerCandidate(localResults[nextIdx]);
          }
        }}
        hasPrev={drawerIdx !== null && drawerIdx > 0}
        hasNext={drawerIdx !== null && drawerIdx < localResults.length - 1}
      />

      {/* Sequence modal */}
      {enrollCandidate && (
        <EnrollSequenceModal
          candidate={enrollCandidate}
          onClose={() => setEnrollCandidate(null)}
        />
      )}
    </div>
  );
}
