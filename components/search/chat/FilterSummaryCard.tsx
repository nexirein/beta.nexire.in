import React, { useMemo, useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronUp, ArrowRight, X, ChevronRight, Sparkles, Target, Gauge, LayoutGrid } from "lucide-react";
import { useSearchStore } from "@/lib/store/search-store";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import CountUp from "react-countup";
import type { ScoredCandidate } from "@/lib/ai/scorer";
import { CandidateDrawer } from "@/app/(app)/search/CandidateDrawer";

interface FilterSummaryCardProps {
  onEditFilters?: () => void;
  onRunSearch?: (force?: boolean) => void;
  onRemoveFilter?: (type: string, value: string) => void;
  onClearFilters?: () => void;
  isLatest?: boolean;
  historicalData?: {
    total: number;
    filters?: Record<string, unknown>;
    results?: ScoredCandidate[];
  };
}

const FilterChip = ({ 
  label, 
  variant = 'default',
  isRemovable = false,
  onRemove,
  isBottleneck = false,
  title,
}: { 
  label: string; 
  variant?: 'default' | 'brand' | 'success' | 'warning' | 'ghost';
  isRemovable?: boolean;
  onRemove?: () => void;
  isBottleneck?: boolean;
  title?: string;
}) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    title={title}
    className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all group border shadow-sm",
      variant === 'default' && "bg-white text-gray-600 border-gray-100",
      variant === 'brand' && "bg-brand-50 text-brand-700 border-brand-100",
      variant === 'success' && "bg-success/5 text-success border-success/10",
      variant === 'ghost' && "bg-gray-50/50 text-gray-500 border-gray-100/50 italic font-normal",
      variant === 'warning' || isBottleneck ? "bg-orange-50 text-orange-700 border-orange-200" : ""
    )}
  >
    <span className="truncate max-w-[120px]">{label}</span>
    {isBottleneck && (
      <span title="High restrictiveness" className="bg-orange-500 w-1.5 h-1.5 rounded-full -ml-0.5" aria-hidden="true" />
    )}
    {isRemovable && (
      <button 
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
        className="hover:bg-black/5 rounded p-0.5 -mr-1 transition-colors ml-1"
        aria-label={`Remove ${label}`}
      >
        <X className="w-2.5 h-2.5" />
      </button>
    )}
  </motion.div>
);

const METRO_GROUPS: Record<string, { label: string; cities: string[] }> = {
  "delhi_ncr": {
    label: "Delhi NCR",
    cities: ["delhi", "new delhi", "north delhi", "noida", "gurgaon", "gurugram", "ghaziabad", "faridabad"]
  },
  "mumbai_metro": {
    label: "Mumbai Metro",
    cities: ["mumbai", "thane", "navi mumbai", "kalyan"]
  },
  "bangalore": {
    label: "Bengaluru",
    cities: ["bengaluru", "bangalore", "bengaluru north", "bengaluru south", "whitefield", "electronic city"]
  },
  "pune_metro": {
    label: "Pune Metro",
    cities: ["pune", "pimpri-chinchwad", "hinjewadi", "wakad"]
  }
};

export function FilterSummaryCard({ 
  onEditFilters, 
  onRunSearch, 
  onRemoveFilter, 
  onClearFilters, 
  isLatest = true, 
  historicalData 
}: FilterSummaryCardProps) {
  const { 
    accumulatedContext, 
    estimatedMatches: storeEstimatedMatches, 
    status, 
    isResolvingFilters: storeIsResolving, 
    isEstimatingMatches: storeIsEstimating,
    cachedResults: storeCachedResults,
    cachedTotal: storeCachedTotal,
    messages,
    addMessage,
    updateAccumulatedContext,
    setStatus,
    searchId,
    setEstimatedMatches,
    setCachedResults,
    setIsResolvingFilters,
    setIsEstimatingMatches
  } = useSearchStore();

  const isHistorical = !!historicalData && !isLatest;
  const estimatedMatches = isHistorical ? historicalData.total : storeEstimatedMatches;
  const cachedResults = isHistorical ? historicalData.results : storeCachedResults;
  const cachedTotal = isHistorical ? historicalData.total : storeCachedTotal;
  const isResolvingFilters = isHistorical ? false : storeIsResolving;
  const isEstimatingMatches = isHistorical ? false : storeIsEstimating;
  const cardStatus = isHistorical ? "CONFIRMING" : status;

  const [previewOpen, setPreviewOpen] = useState(true);
  const [justLoadedCount, setJustLoadedCount] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isLatest);
  const [inputValue, setInputValue] = useState("");
  const [drawerCandidate, setDrawerCandidate] = useState<ScoredCandidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setIsExpanded(isLatest);
  }, [isLatest]);

  useEffect(() => {
    if (estimatedMatches !== null) {
      setJustLoadedCount(true);
      const timer = setTimeout(() => setJustLoadedCount(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [estimatedMatches]);

  const resolved = useMemo(() => {
    if (isHistorical && historicalData?.filters) return historicalData.filters as Record<string, unknown>;
    return (accumulatedContext._resolvedFilters || {}) as Record<string, unknown>;
  }, [accumulatedContext._resolvedFilters, isHistorical, historicalData]);

  // ── CrustData filter display logic ─────────────────────────────────────────
  const display = useMemo(() => {
    // resolved is a CrustDataFilterState object from context-to-filters route
    const fs = resolved as Record<string, unknown>;
    const extractionData = (accumulatedContext._resolution || {} as Record<string, unknown>).extraction || {} as Record<string, unknown>;

    // Job titles:
    // - "primaryJobTitles" = what the user explicitly asked for (from accumulatedContext.job_titles)
    // - "similarJobTitles" = CrustData autocomplete-expanded titles NOT in user's explicit list
    // This ensures "Fleet Manager" always shows as primary, not "Logistics Manager".
    const resolvedTitles = Array.isArray(fs.titles) ? (fs.titles as string[]) : [];
    const userExplicitTitles = Array.isArray(accumulatedContext.job_titles)
      ? (accumulatedContext.job_titles as string[])
      : [];
    const expandedTitles = resolvedTitles.filter(
      t => !userExplicitTitles.some(u => u.toLowerCase() === t.toLowerCase())
    );

    // Primary = user's explicit titles; if none yet, fall back to first resolved
    const primaryJobTitles = userExplicitTitles.length > 0
      ? userExplicitTitles
      : resolvedTitles.slice(0, 2);
    // Similar = autocomplete-only expanded titles
    const similarJobTitles = expandedTitles.slice(0, 6);

    // Location: prefer filterState.region (fully resolved canonical string), fallback to context/extraction
    // Display label = clean short form, e.g. "Vadodara Taluka, Gujarat, India" → "Vadodara, Gujarat"
    // Tooltip shows the full canonical string + radius so user knows exact geo used.
    const ADMIN_SUFFIX_DISPLAY = /\s+(taluka|district|tehsil|division|municipality|cantonment|township|block|mandal|rural)\b.*/i;
    const formatLocationLabel = (full: string): string => {
      const parts = full.split(",").map(p => p.trim());
      const cleanCity = parts[0].replace(ADMIN_SUFFIX_DISPLAY, "").trim();
      if (parts.length >= 2) return `${cleanCity}, ${parts[1].trim()}`;
      return cleanCity;
    };
    const regionStr = typeof fs.region === "string" ? fs.region : null;
    const radiusMiles = typeof fs.radius_miles === "number" ? fs.radius_miles : 30;
    const rawLocCtx = Array.isArray(accumulatedContext.locations) ? (accumulatedContext.locations as string[]) : [];
    const extractedLoc = typeof (extractionData as Record<string, unknown>).raw_location === "string" 
      ? [(extractionData as Record<string, unknown>).raw_location as string] : [];
    const locationItems = regionStr 
      ? [{ label: formatLocationLabel(regionStr), tooltip: [regionStr, `Within ${radiusMiles} mi`] }]
      : rawLocCtx.length > 0 
        ? rawLocCtx.map((l) => ({ label: formatLocationLabel(l), tooltip: [l] })) 
        : extractedLoc.map((l) => ({ label: formatLocationLabel(l), tooltip: [l] }));

    // Industries: prefer filterState.company_industries
    const industries = Array.isArray(fs.company_industries) 
      ? (fs.company_industries as string[]).slice(0, 5)
      : Array.isArray(accumulatedContext.industry) 
        ? (accumulatedContext.industry as string[]).slice(0, 5) 
        : [];

    // Seniority
    const seniority = Array.isArray(fs.seniority)
      ? (fs.seniority as string[])
      : Array.isArray(accumulatedContext.seniority)
        ? (accumulatedContext.seniority as string[])
        : [];

    // Skills: prefer filterState.skills, fallback to raw_tech
    const skills = Array.isArray(fs.skills)
      ? (fs.skills as string[]).slice(0, 8)
      : Array.isArray(accumulatedContext.technologies)
        ? (accumulatedContext.technologies as string[]).slice(0, 8)
        : [];

    // Experience: prefer filterState.experience_min/max
    // Experience display logic
    let expYears: string | null = null;
    const fsExpMin = typeof fs.experience_min === "number" ? fs.experience_min : null;
    const fsExpMax = typeof fs.experience_max === "number" ? fs.experience_max : null;

    const finalExpMin = fsExpMin !== null ? fsExpMin : (accumulatedContext.experience_min ?? null);
    const finalExpMax = fsExpMax !== null ? fsExpMax : (accumulatedContext.experience_max ?? null);

    if (finalExpMin !== null || finalExpMax !== null) {
      if (finalExpMin !== null && finalExpMax !== null) {
        expYears = finalExpMin === finalExpMax ? `${finalExpMin} yrs` : `${finalExpMin}–${finalExpMax} yrs`;
      } else if (finalExpMin !== null) {
        expYears = `${finalExpMin}+ yrs`;
      } else {
        expYears = `Up to ${finalExpMax} yrs`;
      }
    }

    // Past history
    const pastTitles = Array.isArray(fs.past_titles) ? (fs.past_titles as string[]) : [];
    const pastRegions = Array.isArray(fs.past_regions) ? (fs.past_regions as string[]) : [];

    // Education & Languages
    const schools = Array.isArray(fs.education_school) ? (fs.education_school as string[]) : [];
    const degrees = Array.isArray(fs.education_degree) ? (fs.education_degree as string[]) : [];
    const fieldOfStudy = Array.isArray(fs.education_field_of_study) ? (fs.education_field_of_study as string[]) : [];
    const languages = Array.isArray(fs.languages) ? (fs.languages as string[]) : [];

    // Funding / Revenue
    const minFunding = typeof fs.company_funding_min === "number" ? fs.company_funding_min : null;
    const fundingDisplay = minFunding !== null ? `$${minFunding}M+ Funding` : null;

    // Headcount
    const headcount = Array.isArray(fs.company_headcount_range) ? (fs.company_headcount_range as string[]) : [];

    const uniq = (arr: string[]) => Array.from(new Set(arr.filter((x) => typeof x === "string" && x.trim().length > 0)));

    return {
      primaryJobTitles: uniq(primaryJobTitles),
      similarJobTitles: uniq(similarJobTitles),
      pastTitles: uniq(pastTitles),
      locationItems,
      pastRegions: uniq(pastRegions),
      seniority: uniq(seniority),
      industries: uniq(industries),
      skills: uniq(skills),
      expYears,
      headcount: uniq(headcount),
      education: uniq([...schools, ...degrees, ...fieldOfStudy]),
      languages: uniq(languages),
      fundingDisplay,
    };
  }, [accumulatedContext, resolved]);

  const isVisible = isHistorical || 
                   !!(historicalData?.results?.length) || 
                   !!(historicalData?.filters) || 
                   (isLatest && (cardStatus === "CONFIRMING" || cardStatus === "SEARCHING"));

  // Early return moved down to respect hooks
  
  // Header: always show what the user explicitly asked for — never the AI's expanded title.
  // e.g. "Fleet Manager" must show even if filterState.titles[0] is "Logistics Manager".
  const headerTitleDisplay = isHistorical
    ? (historicalData?.filters as Record<string, unknown>)?.titles
      ? ((historicalData?.filters as Record<string, unknown>)?.titles as string[])?.[0] || "Ready"
      : "Ready"
    : accumulatedContext.job_titles?.[0]
      || ((accumulatedContext._resolvedFilters as Record<string, unknown>)?.titles as string[])?.[0]
      || "Ready";

  const isReady = isHistorical ? true : (!isEstimatingMatches && !isResolvingFilters);
  const hasResults = Array.isArray(cachedResults) && cachedResults.length > 0;
  const previewCandidates = hasResults ? (cachedResults as ScoredCandidate[]).slice(0, 3) : [];
  
  // FIX 4: Expansion resolution suggestion
  const resolutionData = (accumulatedContext._resolution || {}) as Record<string, any>;
  const extractionData = resolutionData.extraction || {};
  const expansionSuggestion = Array.isArray(extractionData.expansion_suggestion) 
    ? extractionData.expansion_suggestion.join(", ") 
    : typeof extractionData.expansion_suggestion === "string" 
      ? extractionData.expansion_suggestion 
      : null;

  const primaryTitle = display.primaryJobTitles[0] || "Roles";
  const primaryMetroLabel = display.locationItems[0]?.label || "Anywhere";

  // Match Health Logic
  const healthConfig = useMemo(() => {
    if (estimatedMatches === null) return { label: "Analyzing...", color: "text-gray-400", bg: "bg-gray-50", border: "border-gray-200" };
    if (estimatedMatches >= 500) return { label: "Strong pool", color: "text-success", bg: "bg-success/10", border: "border-success/20" };
    if (estimatedMatches >= 50) return { label: "Narrow pool", color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" };
    if (estimatedMatches > 0) return { label: "Very limited", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" };
    return { label: "No matches — broaden search", color: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
  }, [estimatedMatches]);

  // AI Recovery Suggestions
  const recoverySuggestions = useMemo(() => {
    if (estimatedMatches !== 0 || isEstimatingMatches) return [];
    
    const suggestions = [];
    if (display.locationItems.length > 0) {
      suggestions.push({ 
        label: `Remove ${display.locationItems[0].label}`, 
        action: () => onRemoveFilter?.('location', display.locationItems[0].label) 
      });
    }
    if (display.skills.length > 3) {
      suggestions.push({ 
        label: "Fewer skills", 
        action: () => {} // Logic handled in handleMiniSubmit via onRemoveFilter
      });
    }
    if (display.expYears) {
      suggestions.push({ 
        label: "Any experience", 
        action: () => onRemoveFilter?.('experience', display.expYears!) 
      });
    }
    return suggestions.slice(0, 3);
  }, [estimatedMatches, isEstimatingMatches, display, onRemoveFilter]);

  const handleMiniSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const content = inputValue.trim();
    setInputValue("");
    
    // Resume standard chat cycle
    addMessage({ role: "user", content });
    setStatus("RESOLVING");
    setIsExpanded(true); // Ensure expanded

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content }],
          accumulatedContext: accumulatedContext,
        }),
      });

      if (!res.ok) throw new Error("Chat API failed");
      const data = await res.json();

      if (data.updated_context) {
        updateAccumulatedContext(data.updated_context);
      }

      addMessage({
        role: "assistant",
        content: data.ai_message,
        widgetData: data.suggested_questions,
      });

      // Same logic as SearchTerminal to run search instantly if ready
      if (data.ready_for_search) {
        setEstimatedMatches(null);
        updateAccumulatedContext({ _resolvedFilters: undefined, _resolution: undefined });
        setIsResolvingFilters(true);
        setIsEstimatingMatches(false);
        setCachedResults(null, null);

        setTimeout(() => setStatus("CONFIRMING"), 600);

        // Sub-call to context-to-filters...
        const resolveRes = await fetch("/api/ai/context-to-filters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accumulatedContext: { ...accumulatedContext, ...data.updated_context } }),
        });
        const resolvedData = await resolveRes.json();

        if (resolveRes.ok && resolvedData.filters) {
          useSearchStore.getState().updateAccumulatedContext({
            _resolvedFilters: resolvedData.filters,
            _resolution: resolvedData.resolution,
          });
          setIsResolvingFilters(false);
          setIsEstimatingMatches(false); // Stop loader, wait for Run Search
        } else {
          setIsResolvingFilters(false);
          setIsEstimatingMatches(false);
        }
      } else {
        setStatus("COLLECTING");
      }
    } catch (err) {
      console.error(err);
      setStatus("COLLECTING");
    }
  };

  const handleExpandSearch = () => {
    setInputValue(`Expand titles to include similar roles like ${expansionSuggestion}`);
    setTimeout(() => handleMiniSubmit(new Event('submit') as any), 10);
  };

  if (!isVisible) return null;

  return (
    <>
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3 }}
      className={`w-full mx-auto rounded-xl border bg-surface/95 backdrop-blur-3xl shadow-2xl flex flex-col transition-colors duration-500 max-h-[520px] mb-6
        ${isReady ? 'border-brand-500/30' : 'border-border'}
      `}
      style={isReady ? { backgroundColor: 'var(--brand-tint)' } : undefined}
    >
      
      {/* ── Header ── */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "px-5 py-3 border-b border-border/50 bg-white/[0.02] flex items-center justify-between shrink-0 transition-colors",
          !isLatest && "cursor-pointer hover:bg-white/[0.04]"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 text-[15px] tracking-tight leading-none">
                {isReady ? headerTitleDisplay : "Building search plan..."}
              </h3>
              {/* Search intent badge */}
              {accumulatedContext.search_intent && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  accumulatedContext.search_intent === "tight" && "bg-violet-50 text-violet-600 border-violet-200",
                  accumulatedContext.search_intent === "balanced" && "bg-blue-50 text-blue-600 border-blue-200",
                  accumulatedContext.search_intent === "wide" && "bg-emerald-50 text-emerald-600 border-emerald-200",
                )}>
                  {accumulatedContext.search_intent === "tight" && <><Target className="w-2.5 h-2.5" /> Exact</>}
                  {accumulatedContext.search_intent === "balanced" && <><Gauge className="w-2.5 h-2.5" /> Balanced</>}
                  {accumulatedContext.search_intent === "wide" && <><LayoutGrid className="w-2.5 h-2.5" /> Wide</>}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500 font-medium">
              <span>{primaryMetroLabel}</span>
              <span className="text-gray-300">·</span>
              <span>{display.expYears || "Any exp"}</span>
              {display.industries.length > 0 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="truncate max-w-[100px]">{display.industries[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-1">
            <AnimatePresence mode="wait">
              {estimatedMatches !== null ? (
                <motion.div 
                  key="health"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 shadow-sm",
                    healthConfig.bg,
                    healthConfig.color,
                    healthConfig.border
                  )}
                >
                  {healthConfig.label}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="text-[12px] font-medium text-text-secondary h-5 flex flex-col justify-center overflow-hidden">
              <AnimatePresence mode="wait">
                {estimatedMatches !== null ? (
                  <motion.span 
                    key="count"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      scale: justLoadedCount ? [1, 1.05, 1] : 1,
                    }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="font-bold"
                  >
                    <CountUp end={estimatedMatches} separator="," duration={0.8} /> matches
                  </motion.span>
                ) : isResolvingFilters ? (
                  <motion.span 
                    key="resolving"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-1.5"
                  >
                    Structuring AI data...
                  </motion.span>
                ) : (
                  <motion.span 
                    key="planning"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-1.5"
                  >
                    Defining pool...
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          {!isLatest && (
            <div className="text-text-tertiary">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          )}
        </div>
      </div>
      
      {/* Wrap AnimatePresence in a flex-1 min-h-0 container so footer is always visible.
           Framer Motion's height:auto animation can break flex parent constraints.
           min-h-0 is the CSS fix for flex children that need to shrink below their content size. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-col overflow-hidden"
            >
              {/* ── Body ── */}
              <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                <div className="shrink-0 bg-white border-b border-gray-100 px-5 py-4">
                  <p className="text-[13px] text-gray-600 leading-relaxed">
                    {accumulatedContext.requirement_summary
                      ? accumulatedContext.requirement_summary
                      : isReady
                        ? `Searching for a ${headerTitleDisplay} ${display.locationItems.length > 0 ? `in ${display.locationItems.map(l => l.label).join(", ")}` : ""}${display.expYears ? ` with ${display.expYears} experience` : ""}.`
                        : "Structuring your search criteria..."
                    }
                  </p>
                </div>

                {!isReady && (
                  <div className="absolute inset-x-0 bottom-0 top-[57px] z-10 bg-white/95 backdrop-blur-sm p-5 space-y-4">
                    <div className="space-y-2">
                      <div className="h-2.5 w-12 bg-gray-200 rounded-full animate-pulse" />
                      <div className="flex flex-wrap gap-1.5">
                        {[90, 120, 80].map((w, i) => (
                          <div key={i} className="h-7 rounded-full bg-gray-100 animate-pulse" style={{ width: w, animationDelay: `${i * 0.1}s` }} />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2.5 w-16 bg-gray-200 rounded-full animate-pulse" />
                      <div className="flex flex-wrap gap-1.5">
                        {[100, 70].map((w, i) => (
                          <div key={i} className="h-7 rounded-full bg-gray-100 animate-pulse" style={{ width: w, animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin shrink-0" />
                      <span className="text-[12px] text-gray-400">Resolving profile-native filters...</span>
                    </div>
                  </div>
                )}

                {/* Filters Grid */}
                <div className={cn("p-5 grid grid-cols-2 gap-4 bg-white transition-opacity duration-300", !isReady && "opacity-20")}>
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                      Titles
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {display.primaryJobTitles.map((title, i) => (
                        <FilterChip 
                          key={i} 
                          label={title} 
                          variant="brand" 
                          isRemovable 
                          onRemove={() => onRemoveFilter?.('title', title)}
                        />
                      ))}
                      {display.similarJobTitles.map((title, i) => (
                        <FilterChip 
                          key={i} 
                          label={title} 
                          variant="ghost" 
                        />
                      ))}
                    </div>
                  </div>

                  {display.pastTitles.length > 0 && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                        Past Titles
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {display.pastTitles.map((title, i) => (
                          <FilterChip 
                            key={i} 
                            label={title} 
                            variant="ghost" 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('past_title', title)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                      Locations
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {display.locationItems.map((loc, idx) => (
                        <FilterChip 
                          key={loc.label} 
                          label={loc.label}
                          title={loc.tooltip?.join(" · ")}
                          isRemovable 
                          onRemove={() => onRemoveFilter?.('location', loc.label)}
                          isBottleneck={estimatedMatches === 0}
                        />
                      ))}
                    </div>
                  </div>

                  {display.industries.length > 0 && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                        Industry
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {display.industries.map((ind, i) => (
                          <FilterChip 
                            key={i} 
                            label={ind} 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('industry', ind)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {display.seniority.length > 0 && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                        Seniority
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {display.seniority.map((s, i) => (
                          <FilterChip 
                            key={i} 
                            label={s} 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('seniority', s)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {display.expYears && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                        Experience
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <FilterChip 
                          label={`${display.expYears} exp`} 
                          isRemovable 
                          onRemove={() => onRemoveFilter?.('experience', display.expYears!)}
                        />
                      </div>
                    </div>
                  )}

                  {display.skills.length > 0 && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                        Skills
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {display.skills.map((skill, i) => (
                          <FilterChip 
                            key={i} 
                            label={skill} 
                            variant="success" 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('skill', skill)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {display.headcount.length > 0 && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                      Headcount
                    </div>
                      <div className="flex flex-wrap gap-1.5">
                        {display.headcount.map((h, i) => (
                          <FilterChip 
                            key={i} 
                            label={h} 
                            variant="ghost" 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('headcount', h)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {(display.education.length > 0 || display.fundingDisplay) && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 text-brand-600/60 uppercase font-bold tracking-widest text-[9px]">
                      Advanced
                    </div>
                      <div className="flex flex-wrap gap-1.5">
                        {display.fundingDisplay && (
                          <FilterChip 
                            label={display.fundingDisplay} 
                            variant="brand" 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('funding', display.fundingDisplay!)}
                          />
                        )}
                        {display.education.map((e, i) => (
                          <FilterChip 
                            key={i} 
                            label={e} 
                            variant="ghost" 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('education', e)}
                          />
                        ))}
                        {display.languages.map((l, i) => (
                          <FilterChip 
                            key={i} 
                            label={l} 
                            variant="ghost" 
                            isRemovable 
                            onRemove={() => onRemoveFilter?.('language', l)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Compact Preview (Top 3) */}
                {hasResults && (
                  <div className="border-t border-brand-100 bg-brand-50/10">
                    <button 
                      onClick={() => setPreviewOpen(!previewOpen)}
                      className="w-full flex items-center justify-between px-5 py-3 text-brand-700 hover:text-brand-800 transition-colors hover:bg-brand-50/50"
                    >
                      <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                        Quick Preview
                      </span>
                      {previewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    
                    <AnimatePresence>
                      {previewOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-brand-100"
                        >
                          <div className="flex flex-col divide-y divide-brand-100">
                            {previewCandidates.map((c) => (
                              <button 
                                key={c.person_id} 
                                onClick={() => { setDrawerCandidate(c); setDrawerOpen(true); }}
                                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-brand-50/50 transition-colors text-left group"
                              >
                                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-600 shrink-0 border border-brand-200">
                                  {c.full_name?.charAt(0) || "?"}
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                                  <span className="text-[14px] font-bold text-gray-900 truncate group-hover:text-brand-600 transition-colors leading-tight">{c.full_name}</span>
                                  <span className="text-[12px] text-gray-500 font-medium truncate w-full">{c.current_title || c.headline}</span>
                                  {c.ai_reason && (
                                    <span className="text-[10px] font-bold text-brand-600 mt-1 px-2.5 py-0.5 bg-brand-50 border border-brand-200 rounded-md inline-flex items-center gap-1.5 shadow-sm">
                                      <Sparkles className="w-2.5 h-2.5 fill-brand-400" />
                                      {c.ai_reason}
                                    </span>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-3">
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500 text-white font-bold border border-brand-400">
                                      ★ {c.ai_score}
                                    </span>
                                    <span className="text-[11px] text-gray-400 font-medium truncate max-w-[100px]">
                                      {c.location_city || c.location_country || "Worldwide"}
                                    </span>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Card Footer Actions — always visible, outside scrollable area ── */}
      <div className="shrink-0 px-5 py-4 border-t border-brand-100 bg-brand-50/50 flex items-center justify-between w-full">
        <button
          onClick={onEditFilters}
          className="flex items-center gap-2 px-5 py-2.5 text-brand-700 hover:text-brand-800 border border-brand-200 hover:border-brand-300 rounded-xl text-xs font-bold bg-white transition-all shadow-sm active:scale-95"
        >
          <Pencil className="w-3.5 h-3.5" />
          Refine Strategy
        </button>

        <button
          onClick={() => onRunSearch?.(hasResults)}
          disabled={!isReady || cardStatus === "SEARCHING"}
          className={`
            relative overflow-hidden flex items-center gap-2.5 px-8 py-3 rounded-xl text-[13px] font-bold shadow-lg transition-all active:scale-95
            ${!isReady || cardStatus === "SEARCHING"
              ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none"
              : "bg-brand-500 text-white hover:bg-brand-600 hover:shadow-brand-500/30 border border-brand-400/20"
            }
          `}
        >
          {cardStatus === "SEARCHING" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Searching...</>
          ) : !isReady ? (
            <><span className="animate-pulse">Analyzing pool...</span></>
          ) : (
            <>
              {hasResults ? `Explore All ${cachedTotal ?? estimatedMatches ?? 0} Candidates` : "Initiate Search"} 
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </motion.div>

    {/* Candidate profile drawer (reused from results view) */}
    <CandidateDrawer
      isOpen={drawerOpen}
      candidate={drawerCandidate}
      onClose={() => setDrawerOpen(false)}
      onSequenceEnroll={() => {}}
      onRevealSuccess={() => {}}
    />
    </>  
  );
}

