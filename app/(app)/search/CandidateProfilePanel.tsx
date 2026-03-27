"use client";
import React, { useState, useEffect } from "react";
import {
  MapPin, ExternalLink, Send, Mail, Smartphone,
  CheckCircle2, Calendar, Sparkles, ChevronDown,
  ChevronUp, Briefcase, Award, Languages, Star, Globe, Twitter
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { ScoredCandidate } from "@/lib/ai/scorer";
import { sanitizeTitle } from "@/lib/utils/sanitizeTitle";
import { CompanyHoverCard } from "@/components/search/CompanyHoverCard";
import { InstituteHoverCard } from "@/components/search/InstituteHoverCard";
import { useSearchStore } from "@/lib/store/search-store";

const LOGO_DEV_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN ?? "pk_JgbzA-I-Ssu_JN0iUMq1rQ";
const LOGO_SEARCH_CACHE: Record<string, string | null> = {};
const IN_FLIGHT_LOGO_SEARCHES = new Set<string>();

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(s?: string | null) {
  if (!s) return "";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString("default", { month: "short", year: "numeric" });
  } catch { return s; }
}

function fmtMonths(m: number) {
  const y = Math.floor(m / 12), r = m % 12;
  if (y > 0 && r > 0) return `${y}y ${r}m`;
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""}`;
  return `${m} mo${m !== 1 ? "s" : ""}`;
}

function monthsBetween(start?: string | null, end?: string | null) {
  if (!start) return 0;
  try {
    const s = new Date(start), e = end ? new Date(end) : new Date();
    return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth());
  } catch { return 0; }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 65) return "text-indigo-600";
  if (score >= 50) return "text-amber-600";
  return "text-gray-500";
}

// ── Components ───────────────────────────────────────────────────────────────
function LinkedInSVGMini() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#0077b5]">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function OrgLogo({ domain, name, size = 32 }: { domain?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  const clean = domain?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  if (clean && !failed) {
    return (
      <img
        src={`https://img.logo.dev/${clean}?token=${LOGO_DEV_KEY}&size=64`}
        alt={name} width={size} height={size}
        className="rounded object-contain bg-white border border-gray-100 flex-shrink-0"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-indigo-400"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

function InstituteAvatar({ logoUrl, name, size = 32 }: { logoUrl?: string | null; name: string; size?: number }) {
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
    return <img src={logoUrl} alt={name} width={size} height={size} className="rounded object-contain bg-white border border-gray-100 flex-shrink-0" style={{ width: size, height: size }} onError={() => setFailed(true)} />;
  }
  if (fallbackDomain) {
    return <img src={`https://img.logo.dev/${fallbackDomain}?token=${LOGO_DEV_KEY}&size=64`} alt={name} width={size} height={size} className="rounded object-contain bg-white border border-gray-100 flex-shrink-0" style={{ width: size, height: size }} onError={() => setFallbackDomain(null)} />;
  }
  return (
    <div className="rounded bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-violet-400" style={{ width: size, height: size }}>
      {initials || "?"}
    </div>
  );
}

function ProfileAvatar({ url, permalink, name, size = 64 }: { url?: string | null; permalink?: string | null; name: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(url ?? null);
  const [usedPermalink, setUsedPermalink] = useState(false);
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
  if (src) {
    return (
      <img src={src} alt={name} width={size} height={size}
        className="rounded-full object-cover ring-2 ring-indigo-100 flex-shrink-0 shadow-sm"
        style={{ width: size, height: size }}
        onError={() => {
          if (!usedPermalink && permalink) { setUsedPermalink(true); setSrc(permalink); }
          else setSrc(null);
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-200 flex items-center justify-center font-bold text-indigo-600 flex-shrink-0 shadow-sm"
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials || "?"}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
interface CandidateProfilePanelProps {
  candidate: ScoredCandidate;
  onSequenceEnroll?: (candidate: ScoredCandidate) => void;
  onRevealSuccess?: (personId: string, type: "email" | "phone", data: any) => void;
}

export function CandidateProfilePanel({ candidate, onSequenceEnroll, onRevealSuccess }: CandidateProfilePanelProps) {
  const raw: any = candidate.raw_crustdata_json ?? {};

  const { person_id, full_name, headline, location_city, location_state, location_country,
          skills = [], linkedin_url, ai_score, match_label, current_title } = candidate;

  const [emailLoading, setEmailLoading]   = useState(false);
  const [phoneLoading, setPhoneLoading]   = useState(false);
  const [revealedEmail, setRevealedEmail] = useState<string | null>(candidate.email ?? null);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(candidate.phone ?? null);
  const [summaryOpen, setSummaryOpen]     = useState(false);
  const [expandedJobs, setExpandedJobs]   = useState<Set<number>>(new Set());
  const [isShortlisted, setIsShortlisted] = useState(false);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  
  // Safe accessor if used outside search context
  const projectId = typeof useSearchStore === "function" ? useSearchStore((s) => s.projectId) : null;

  useEffect(() => {
    if (!candidate.person_id) return;
    const url = projectId 
      ? `/api/shortlist?projectId=${projectId}&personId=${candidate.person_id}`
      : `/api/shortlist?personId=${candidate.person_id}`;
      
    fetch(url)
      .then(r => r.json())
      .then(d => setIsShortlisted(d.isShortlisted))
      .catch(() => {});
  }, [projectId, candidate.person_id]);

  async function toggleShortlist() {
    if (!projectId) {
      toast.error("Please select a project before shortlisting.");
      return;
    }
    setShortlistLoading(true);
    try {
      const res = await fetch("/api/shortlist", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ projectId, personId: candidate.person_id, candidateData: candidate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsShortlisted(data.isShortlisted);
      toast.success(data.isShortlisted ? "Added to shortlist" : "Removed from shortlist");
    } catch {
      toast.error("Failed to update shortlist");
    } finally {
      setShortlistLoading(false);
    }
  }

  // Skeleton loader state
  const [isSimulatingLoad, setIsSimulatingLoad] = useState(true);

  useEffect(() => {
    setIsSimulatingLoad(true);
    const t = setTimeout(() => setIsSimulatingLoad(false), 900); // 900ms simulated premium loading delay
    return () => clearTimeout(t);
  }, [candidate.person_id]);

  // Portal Hover Card State
  const [hoveredEmpIdx, setHoveredEmpIdx] = useState<number | null>(null);
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null);
  const hideTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const [hoveredEduIdx, setHoveredEduIdx] = useState<number | null>(null);
  const [eduHoverAnchorRect, setEduHoverAnchorRect] = useState<DOMRect | null>(null);

  // ScrollSpy state
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Derived data
  const profilePicUrl: string | null = raw.profile_picture_url ?? null;
  const profilePicPermalink: string | null = raw.profile_picture_permalink ?? null;
  const twitterHandle: string | null = raw.twitter_handle || null;
  const summary: string | null = raw.summary ?? null;
  const languages: string[] = raw.languages ?? [];
  const openToCards: any[] = raw.open_to_cards ?? [];
  const isOpenToWork = openToCards.length > 0 || !!raw.recently_changed_jobs;
  const allEmployers: any[] = raw.all_employers ?? [];
  const educationBg: any[] = raw.education_background ?? [];
  const certifications: any[] = raw.certifications ?? [];
  const honors: any[] = raw.honors ?? [];
  const currentEmployers: any[] = raw.current_employers ?? [];
  const primaryEmployer = currentEmployers[0] ?? null;
  const totalExpYears: number | null = raw.years_of_experience_raw ?? null;
  const currentTenureRaw: number | null = primaryEmployer?.years_at_company_raw ?? null;
  const avgTenureMonths = allEmployers.length > 0
    ? Math.round(allEmployers.reduce((s: number, e: any) => s + (e.start_date ? monthsBetween(e.start_date, e.end_date) : 0), 0) / allEmployers.length)
    : null;
  const locationStr = [location_city, location_state, location_country].filter(Boolean).join(", ");

  const seen = new Set<string>();
  const employers = allEmployers.filter((e: any) => {
    const k = String(e.position_id ?? `${e.name}|${e.title}|${e.start_date}`);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const scoreColor = getScoreColor(ai_score);
  const strokeDash = 138;
  const strokeOffset = strokeDash - (strokeDash * ai_score) / 100;

  // Track scroll position to update active tab
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const sections = ["overview", "experience", "education", "skills"];
    for (const section of sections) {
      const node = document.getElementById(`section-${section}`);
      if (node && node.offsetTop <= el.scrollTop + 100) {
        setActiveTab(section);
      }
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`);
    const container = document.getElementById("profile-scroll-container");
    if (el && container) container.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
  };


  // ── Hover Handlers ─────────────────────────────────────────────────────────

  const handleEmpMouseEnter = (e: React.MouseEvent, i: number) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setHoverAnchorRect(e.currentTarget.getBoundingClientRect());
    setHoveredEmpIdx(i);
  };

  const handleEmpMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredEmpIdx(null);
      setHoverAnchorRect(null);
    }, 150);
  };

  const handleEduMouseEnter = (e: React.MouseEvent, i: number) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setEduHoverAnchorRect(e.currentTarget.getBoundingClientRect());
    setHoveredEduIdx(i);
  };

  const handleEduMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredEduIdx(null);
      setEduHoverAnchorRect(null);
    }, 150);
  };

  // ── Reveal Handlers ────────────────────────────────────────────────────────

  async function revealEmail() {
    if (revealedEmail || emailLoading || !linkedin_url) return;
    setEmailLoading(true);
    try {
      const res = await fetch("/api/reveal/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id, linkedin_url, candidate_id: candidate.candidate_id, full_name }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(res.status === 402 ? `Need 1 cr, have ${d.balance}` : (d.message ?? "Reveal failed")); return; }
      if (d.email) { setRevealedEmail(d.email); onRevealSuccess?.(person_id, "email", d); toast.success(`Email revealed`); }
      else toast.info("No email found");
    } catch { toast.error("Error"); } finally { setEmailLoading(false); }
  }

  async function revealPhone() {
    if (revealedPhone || phoneLoading || !linkedin_url) return;
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/reveal/phone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id, linkedin_url, candidate_id: candidate.candidate_id, full_name }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(res.status === 402 ? `Need 8 cr, have ${d.balance}` : (d.message ?? "Reveal failed")); return; }
      if (d.phone) { setRevealedPhone(d.phone); onRevealSuccess?.(person_id, "phone", d); toast.success(`Phone revealed`); }
      else toast.info("No phone found");
    } catch { toast.error("Error"); } finally { setPhoneLoading(false); }
  }

  if (isSimulatingLoad) {
    return (
      <div className="flex flex-col h-full bg-white relative overflow-hidden">
        {/* Shimmer overlay wrapper */}
        <div className="absolute inset-0 z-0 bg-white" />
        <div className="relative z-10 flex flex-col h-full overflow-hidden">
          {/* Header Skeleton */}
          <div className="px-7 pt-7 pb-6 border-b border-gray-100 flex-shrink-0 animate-pulse">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-full bg-indigo-50/50 flex-shrink-0" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-5 bg-gray-100 rounded-md w-1/3" />
                <div className="h-4 bg-gray-50 rounded-md w-2/3" />
                <div className="h-3 bg-gray-50 rounded-md w-1/4" />
                <div className="flex gap-2 pt-2">
                  <div className="h-4 w-16 bg-emerald-50 rounded" />
                  <div className="h-4 w-16 bg-gray-50 rounded" />
                </div>
              </div>
              <div className="w-14 h-14 rounded-full bg-gray-50 flex-shrink-0 ml-4" />
            </div>
            
            <div className="flex gap-3 mt-6">
              <div className="flex-1 h-10 bg-gray-50 rounded-lg" />
              <div className="flex-1 h-10 bg-gray-50 rounded-lg" />
              <div className="flex-1 h-10 bg-indigo-50/30 rounded-lg md:max-w-xs" />
            </div>
          </div>
          
          {/* Nav Skeleton */}
          <div className="px-7 py-3 border-b border-gray-100 flex gap-6 flex-shrink-0">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-16 bg-gray-50 rounded-md animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>

          {/* Body Skeleton */}
          <div className="px-7 py-8 space-y-8 flex-1 bg-gray-50/30">
            {/* Overview */}
            <div className="space-y-4 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded-md" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-gray-100 rounded-md" />
                <div className="h-3 w-[90%] bg-gray-100 rounded-md" />
                <div className="h-3 w-[75%] bg-gray-100 rounded-md" />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 bg-white border border-gray-100 rounded-xl" />
                ))}
              </div>
            </div>

            {/* Experience */}
            <div className="space-y-5 pt-4 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded-md" />
              {[1, 2].map(i => (
                <div key={i} className="flex gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-gray-200 rounded-md" />
                    <div className="h-3 w-1/4 bg-gray-100 rounded-md" />
                    <div className="h-3 w-[85%] bg-gray-50 rounded-md pt-2" />
                    <div className="h-3 w-[70%] bg-gray-50 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="profile-scroll-container" onScroll={handleScroll} className="flex flex-col h-full overflow-y-auto bg-gray-50/30 text-gray-900 border-l border-gray-100 relative relative-scroll-container">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-7 pt-7 pb-6 bg-white z-10">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0 mt-1">
            <ProfileAvatar url={profilePicUrl} permalink={profilePicPermalink} name={full_name} size={64} />
            {isOpenToWork && (
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm" title="Open to work" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[18px] font-extrabold text-gray-900 leading-tight truncate">{full_name}</h2>
              {linkedin_url && (
                <a href={linkedin_url} target="_blank" rel="noopener noreferrer" className="opacity-90 hover:opacity-100 transition-opacity">
                  <LinkedInSVGMini />
                </a>
              )}
            </div>
            
            {(current_title || headline) && (
              <div className="flex items-center gap-1.5 flex-wrap text-[13.5px] font-medium text-gray-700 leading-snug">
                <span>{sanitizeTitle(current_title || headline || "")}</span>
                {primaryEmployer && (
                  <>
                    <span className="text-gray-400">at</span>
                    <button
                      className="inline-flex items-center gap-[5px] text-indigo-700 hover:text-indigo-800 hover:underline px-[2px] transition-colors cursor-default pointer-events-auto"
                    >
                      <OrgLogo domain={primaryEmployer.company_website_domain} name={primaryEmployer.name} size={15} />
                      <span className="font-semibold">{primaryEmployer.name}</span>
                    </button>
                    
                    {/* Portal Hover Card for header company */}
                    <AnimatePresence>
                      {hoveredEmpIdx === -1 && hoverAnchorRect && (
                        <div onMouseEnter={() => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current); }} onMouseLeave={handleEmpMouseLeave}>
                           <CompanyHoverCard
                            companyName={primaryEmployer.name || "Company"}
                            domain={primaryEmployer.company_website_domain}
                            headcount={primaryEmployer.company_headcount_range}
                            location={primaryEmployer.company_hq_location}
                            website={primaryEmployer.company_website ?? (primaryEmployer.company_website_domain ? `https://${primaryEmployer.company_website_domain}` : undefined)}
                            linkedinUrl={primaryEmployer.company_linkedin_profile_url ?? primaryEmployer.company_linkedin_url ?? primaryEmployer.linkedin_url}
                            anchorRect={hoverAnchorRect}
                          />
                        </div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            )}

            {locationStr && (
              <p className="flex items-center gap-1.5 text-[12.5px] text-gray-400 mt-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />{locationStr}
              </p>
            )}

            {/* Social / Info Badges */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {isOpenToWork && (
                <span className="flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold tracking-wide">
                  <Sparkles className="w-3 h-3" /> OPEN TO WORK
                </span>
              )}
              {twitterHandle && (
                <a href={`https://x.com/${twitterHandle}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-600 hover:border-black hover:text-black hover:bg-gray-50 transition-colors font-medium">
                  <XIcon /> @{twitterHandle}
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 flex-shrink-0 ml-4">
            <div className="relative w-14 h-14">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" strokeWidth="3.5" className="stroke-gray-100 fill-none" />
                <motion.circle initial={{ strokeDashoffset: strokeDash }} animate={{ strokeDashoffset: strokeOffset }} transition={{ duration: 1 }} cx="24" cy="24" r="20" className={cn("fill-none", scoreColor)} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={String(strokeDash)} stroke="currentColor" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={cn("text-[14px] font-extrabold tabular-nums", scoreColor)}>{ai_score}</span>
              </div>
            </div>
            <span className={cn("text-[9px] font-bold uppercase tracking-widest leading-none mt-1", scoreColor)}>
              {match_label?.split(" ")[0]}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-6 flex-wrap">
          <button onClick={revealEmail} disabled={emailLoading || !!revealedEmail || !linkedin_url}
            className={cn("flex-1 min-w-[120px] flex justify-center items-center gap-2 px-3 py-2 text-[12.5px] font-semibold rounded-lg border transition-all",
              revealedEmail ? "border-emerald-200 bg-emerald-50/50 text-emerald-700 font-mono tracking-tight" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50")}>
            {emailLoading ? <span className="animate-spin w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-700 rounded-full" /> : revealedEmail ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Mail className="w-4 h-4 text-gray-400" />}
            {revealedEmail ? revealedEmail : <>Email <span className="opacity-40 font-normal">| 1cr</span></>}
          </button>
          
          <button onClick={revealPhone} disabled={phoneLoading || !!revealedPhone || !linkedin_url}
            className={cn("flex-1 min-w-[120px] flex justify-center items-center gap-2 px-3 py-2 text-[12.5px] font-semibold rounded-lg border transition-all",
              revealedPhone ? "border-emerald-200 bg-emerald-50/50 text-emerald-700 font-mono tracking-tight" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50")}>
            {phoneLoading ? <span className="animate-spin w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-700 rounded-full" /> : revealedPhone ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Smartphone className="w-4 h-4 text-gray-400" />}
            {revealedPhone ? revealedPhone : <>Mobile <span className="opacity-40 font-normal">| 8cr</span></>}
          </button>

          <button onClick={toggleShortlist} disabled={shortlistLoading}
            className={cn("flex-1 min-w-[120px] flex justify-center items-center gap-2 px-3 py-2 text-[12.5px] font-bold rounded-lg border transition-all",
              isShortlisted 
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" 
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}>
            {shortlistLoading ? <span className="animate-spin w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-700 rounded-full" /> : <Star className={cn("w-3.5 h-3.5", isShortlisted && "fill-amber-500 text-amber-500")} />}
            {isShortlisted ? "Shortlisted" : "Shortlist"}
          </button>

          <button onClick={() => onSequenceEnroll?.(candidate)}
            className="flex-1 min-w-[120px] flex justify-center items-center gap-2 px-3 py-2 text-[12.5px] font-bold rounded-lg border border-transparent bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all">
            <Send className="w-3.5 h-3.5" />Sequence
          </button>
        </div>
      </div>

      {/* ── STICKY NAV BAR ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 flex px-7 border-y border-gray-100 bg-white/95 backdrop-blur-sm shadow-[0_4px_12px_rgba(0,0,0,0.03)] overflow-x-auto flex-shrink-0 transition-shadow">
        {["overview", "experience", "education", "skills"].map(tab => (
          <button key={tab} onClick={() => scrollToSection(tab)}
            className={cn("px-4 py-3 text-[12px] font-bold uppercase tracking-wider whitespace-nowrap border-b-[3px] transition-colors",
              activeTab === tab ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-400 hover:text-gray-600")}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── CONTENT BODY ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-7 pb-24 pt-8 space-y-12 min-h-[70vh]">
        
        {/* OVERVIEW */}
        <section id="section-overview" className="scroll-mt-[80px]">
            {summary && (
              <div className="mb-6">
                <h3 className="text-[14px] font-bold text-gray-900 mb-2">About</h3>
                <p className={cn("text-[13px] text-gray-600 leading-relaxed font-light", !summaryOpen && "line-clamp-3")}>{summary}</p>
                {summary.length > 200 && (
                  <button onClick={() => setSummaryOpen(!summaryOpen)} className="flex items-center gap-1 mt-1.5 text-[11.5px] font-medium text-indigo-600 hover:text-indigo-800">
                    {summaryOpen ? "Show less" : "Read more"}
                  </button>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Avg. Tenure", value: avgTenureMonths !== null ? fmtMonths(avgTenureMonths) : "—" },
                { label: "Current", value: currentTenureRaw !== null ? fmtMonths(Math.round(currentTenureRaw * 12)) : "—" },
                { label: "Total Exp.", value: totalExpYears !== null ? `${totalExpYears} yrs` : "—" },
              ].map(s => (
                <div key={s.label} className="border border-gray-100 rounded-xl p-4 text-center bg-white shadow-sm">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1">{s.label}</p>
                  <p className="text-[16px] font-extrabold text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* EXPERIENCE */}
          <section id="section-experience" className="scroll-mt-[80px]">
            <h3 className="text-[14px] font-bold text-gray-900 mb-5 pb-2 border-b border-gray-100 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gray-400" /> Experience
            </h3>
            {employers.length === 0 ? (
               <p className="text-[13px] text-gray-400 italic">No experience listed.</p>
            ) : (
              <div className="relative border-l-2 border-indigo-100/50 ml-3.5 space-y-8 pl-6">
                {employers.map((emp: any, i: number) => {
                  const isCurrent = !emp.end_date;
                  const dur = emp.start_date ? monthsBetween(emp.start_date, emp.end_date) : null;
                  const isExp = expandedJobs.has(i);
                  return (
                    <div key={i} className="relative group">
                      <div className={cn("absolute -left-[32px] w-[14px] h-[14px] rounded-full border-[3px] top-1 transition-colors", isCurrent ? "border-indigo-500 bg-white ring-4 ring-indigo-50" : "border-gray-200 bg-gray-50")} />
                      
                      <div className="flex items-start gap-4">
                        <OrgLogo domain={emp.company_website_domain} name={emp.name ?? ""} size={42} />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[14.5px] font-bold text-gray-900 leading-snug">{sanitizeTitle(emp.title)}</h4>
                          
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <button
                              onMouseEnter={(e) => handleEmpMouseEnter(e, i)}
                              onMouseLeave={handleEmpMouseLeave}
                              className="text-[13px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              {emp.name}
                            </button>
                            {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold uppercase tracking-wide ml-1">Current</span>}
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11.5px] text-gray-400 font-medium font-mono tracking-tight">
                            <span>{fmtDate(emp.start_date)} – {emp.end_date ? fmtDate(emp.end_date) : "Present"}</span>
                            {dur !== null && dur > 0 && <span className="text-gray-300">· <span className="text-gray-500">{fmtMonths(dur)}</span></span>}
                          </div>

                          {emp.location && (
                            <p className="flex items-center gap-1.5 text-[11.5px] text-gray-400 mt-1">
                              <MapPin className="w-3 h-3 text-gray-300" />{emp.location}
                            </p>
                          )}

                          {emp.description && (
                            <div className="mt-2.5 bg-white p-3 rounded-xl border border-gray-100/60 shadow-sm leading-relaxed text-[12.5px] text-gray-600 font-light">
                              <p className={cn(!isExp && "line-clamp-3")}>{emp.description}</p>
                              {emp.description.length > 150 && (
                                <button onClick={() => { const n = new Set(expandedJobs); isExp ? n.delete(i) : n.add(i); setExpandedJobs(n); }}
                                  className="mt-1.5 text-indigo-600 font-medium hover:text-indigo-800 hover:underline text-[11px]">
                                  {isExp ? "Show less" : "Read description completely"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <AnimatePresence>
                        {hoveredEmpIdx === i && hoverAnchorRect && (
                          <div onMouseEnter={() => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current); }} onMouseLeave={handleEmpMouseLeave}>
                            <CompanyHoverCard
                              companyName={emp.name || "Company"}
                              domain={emp.company_website_domain}
                              industry={emp.company_industries?.[0]}
                              headcount={emp.company_headcount_range}
                              location={emp.company_hq_location ?? emp.location}
                              website={emp.company_website ?? (emp.company_website_domain ? `https://${emp.company_website_domain}` : undefined)}
                              linkedinUrl={emp.company_linkedin_profile_url ?? emp.company_linkedin_url ?? emp.linkedin_url}
                              companyType={emp.company_type}
                              seniority={emp.seniority_level}
                              anchorRect={hoverAnchorRect}
                            />
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* EDUCATION */}
          <section id="section-education" className="scroll-mt-[80px]">
            <h3 className="text-[14px] font-bold text-gray-900 mb-5 pb-2 border-b border-gray-100 flex items-center gap-2">
               <Award className="w-4 h-4 text-gray-400" /> Education
            </h3>
            {educationBg.length === 0 ? (
               <p className="text-[13px] text-gray-400 italic">No education listed.</p>
            ) : (
               <div className="grid gap-4">
                 {educationBg.map((edu: any, i: number) => {
                    const startYear = edu.start_date ? new Date(edu.start_date).getFullYear() : null;
                    const endYear   = edu.end_date   ? new Date(edu.end_date).getFullYear()   : null;
                    const instituteHref = edu.institute_linkedin_url || edu.linkedin_url || (edu.institute_name ? `https://www.linkedin.com/school/${encodeURIComponent(edu.institute_name)}` : "#");
                    
                    return (
                      <div key={i} className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-violet-200 hover:shadow-[0_4px_16px_rgba(139,92,246,0.10)] transition-all group">
                        <a 
                          href={instituteHref} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex-shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md rounded-lg overflow-hidden mt-0.5"
                          title="View professional profile"
                        >
                          <InstituteAvatar logoUrl={edu.institute_logo_url} name={edu.institute_name ?? ""} size={42} />
                        </a>
                        <div className="flex-1 min-w-0 pt-0.5">
                          {/* Degree name — shown prominently */}
                          {edu.degree_name && (
                            <p className="text-[13.5px] font-bold text-violet-700 leading-tight">{edu.degree_name}</p>
                          )}
                          {/* Field of study */}
                          {edu.field_of_study && (
                            <p className="text-[12.5px] font-semibold text-indigo-500 mt-0.5">{edu.field_of_study}</p>
                          )}
                          {/* Institute name as clickable link */}
                          <h4 className={`font-semibold text-gray-700 leading-tight ${edu.degree_name ? "text-[13px] mt-1" : "text-[14px]"}`}>
                            <a
                              href={instituteHref}
                              target="_blank" rel="noopener noreferrer"
                              className="hover:text-violet-700 hover:underline inline-flex items-center gap-1.5 transition-colors"
                              title="View professional profile"
                            >
                               {edu.institute_name}
                               <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-violet-500 transition-colors" />
                            </a>
                          </h4>
                          {(startYear || endYear) && (
                            <p className="text-[11px] font-mono text-gray-400 mt-1.5">{startYear ?? "?"} – {endYear ?? "Present"}</p>
                          )}
                        </div>
                      </div>

                    );
                 })}
               </div>
            )}
          </section>

          {/* SKILLS */}
          <section id="section-skills" className="scroll-mt-[80px] pb-10">
            <h3 className="text-[14px] font-bold text-gray-900 mb-5 pb-2 border-b border-gray-100 flex items-center gap-2">
               <Languages className="w-4 h-4 text-gray-400" /> Skills & Expertise
            </h3>
            {skills.length === 0 ? (
               <p className="text-[13px] text-gray-400 italic">No skills listed.</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                  {skills.map((s: string) => (
                    <span key={s} className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-gray-50 text-gray-700 border border-gray-200">
                      {s}
                    </span>
                  ))}
                </div>
            )}
            {languages.length > 0 && (
              <div className="mt-6">
                 <h4 className="text-[12px] font-bold uppercase tracking-wider text-gray-400 mb-3">Languages</h4>
                 <div className="flex flex-wrap gap-2">
                  {languages.map((l: string) => (
                    <span key={l} className="px-3 py-1 text-[12px] font-medium rounded-lg bg-sky-50 text-sky-700 border border-sky-100">
                      {l}
                    </span>
                  ))}
                 </div>
              </div>
            )}
          </section>
      </div>
    </div>
  );
}
