"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontal, Sparkles, Loader2,
  Bot, Settings2, ArrowLeft, Plus, ChevronRight,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { SearchResults } from "./SearchResults";
import { SearchEmpty } from "./SearchEmpty";
import { FilterModal } from "@/components/search/FilterModal";
import { JDSearchModal } from "@/components/search/JDSearchModal";
import { SearchChoiceModal } from "@/components/search/SearchChoiceModal";
import { SearchTerminal } from "@/components/search/chat/SearchTerminal";
import { useSearchStore } from "@/lib/store/search-store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { ProspeoFilters } from "@/lib/prospeo/types";
import type { CrustDataFilterState } from "@/lib/crustdata/types";
import type { ScoredCandidate } from "@/lib/ai/scorer";

type SearchMode = "idle" | "choice" | "filter" | "jd";

interface SearchClientProps {
  initialProjectId?: string;
  initialProjectTitle?: string;
  initialSearchId?: string;
}

export function SearchClient({ initialProjectId, initialProjectTitle, initialSearchId }: SearchClientProps) {
  const {
    status, accumulatedContext, messages, setStatus,
    resetSearch, setSearchId, setProjectId,
    setCachedResults, cachedResults, cachedTotal,
    restoreConversation, setLastCreditsUsed, searchId,
  } = useSearchStore();

  const [filters, setFilters] = useState<ProspeoFilters>({});
  const [aiMeta, setAiMeta] = useState<unknown>(null);
  const [mode, setMode] = useState<SearchMode>("idle");
  const hasChatStarted = messages.length > 0;
  const router = useRouter();
  const conversationCreatedRef = useRef(false); // Prevent duplicate conversation creation

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ScoredCandidate[] | null>(null);
  const [resultsMeta, setResultsMeta] = useState<{ total: number; cached: boolean; totalPages: number; creditsUsed?: number } | null>(null);
  const [uiPage, setUiPage] = useState(1);
  const [broadenNotice, setBroadenNotice] = useState<string[] | null>(null); // Which filters were relaxed by server auto-broaden
  
  // Client-side cache for instantaneous backwards pagination
  const pageCacheRef = useRef<Record<number, ScoredCandidate[]>>({});

  // isResultsView: controlled, NOT derived from results — lets "Back to Chat" work without clearing results
  const [isResultsView, setIsResultsView] = useState(false);

  // Track if search was already run this session to prevent auto-re-run
  const hasRunSearchRef = useRef(false);

  // Track the current waterfall pass level (1 = exact, 2 = relaxed, 3 = nearby, 4 = minimal)
  const passLevelRef = useRef(1);

  // ── Persist results to DB (fire-and-forget) ────────────────────────────────
  // (Removed redundant client-side persistResults — now handled by backend /api/search)

  // ── Persist conversation state to DB (fire-and-forget) ─────────────────────
  const saveConversation = useCallback(async (
    msgs: unknown[],
    ctx: Record<string, unknown>
  ) => {
    const searchId = useSearchStore.getState().searchId;
    if (!searchId) return;
    try {
        const newTitle = (ctx.job_titles as string[])?.[0]
          ? `${(ctx.job_titles as string[])[0]}${(ctx.locations as string[])?.[0] ? ` · ${(ctx.locations as string[])[0]}` : ""}`
          : "New Search";

      await fetch(`/api/searches/${searchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: msgs,
          accumulated_context: ctx,
          title: newTitle !== "New Search" ? newTitle : undefined,
        }),
      });

      window.dispatchEvent(new CustomEvent("searchRename", { detail: { id: searchId, title: newTitle } }));
    } catch {
      // silently ignore
    }
  }, []);

  // ── Bootstrap: clear stale state and either restore or init a fresh session ──
  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);

    if (initialSearchId) {
      // We're restoring a previous search — bind IDs but DON'T clear state yet
      // (clearing before async load causes hook-count mismatches in deep components)
      setSearchId(initialSearchId);
      conversationCreatedRef.current = true;
      pageCacheRef.current = {};

      // Fetch conversation (messages + context) and results in parallel
      Promise.all([
        fetch(`/api/searches/${initialSearchId}`).then((r) => r.json()),
        fetch(`/api/searches/${initialSearchId}/results`).then((r) => r.json()),
      ])
        .then(([convData, resultsData]) => {
          const conv = convData.search;

          // Always reset first (now safe to do inside async, after data is available)
          resetSearch();
          
          // CRITICAL FIX: We must also wipe LOCAL component state because Next.js soft-navigation
          // re-uses the SearchClient instance. Otherwise `results` and `isResultsView` stay true!
          setIsResultsView(false);
          setResults(null);
          setFilters({});
          setResultsMeta(null);
          pageCacheRef.current = {};
          passLevelRef.current = 1;
          hasRunSearchRef.current = false;

          // ── Critical: if the conversation is IDLE (just created, empty),
          // treat it as a fresh clean state — don't restore filters or results
          if (!conv || conv.status === "IDLE" || !Array.isArray(conv.messages) || conv.messages.length === 0) {
            // Just bind the IDs — UI stays in the empty "who are you looking for?" state
            setSearchId(initialSearchId);
            if (initialProjectId) setProjectId(initialProjectId);
            return;
          }

          // Restore filters from the stored results or from the conversation context
          const filtersFromResults = resultsData?.filters;
          const filtersFromCtx = conv?.accumulated_context?._resolvedFilters;
          const restoredFilters = (filtersFromResults && Object.keys(filtersFromResults).length > 0)
            ? filtersFromResults
            : (filtersFromCtx && Object.keys(filtersFromCtx).length > 0)
              ? filtersFromCtx
              : (conv?.prospeo_filters ?? {});

          if (Object.keys(restoredFilters).length > 0) {
            setFilters(restoredFilters as ProspeoFilters);
          }

          // Atomically restore store including estimated_matches
          restoreConversation({
            searchId: initialSearchId,
            projectId: initialProjectId,
            messages: Array.isArray(conv?.messages) ? conv.messages : [],
            accumulatedContext: {
              ...(conv?.accumulated_context ?? {}),
              _resolvedFilters: restoredFilters,
            },
            status: "CONFIRMING",
            estimatedMatches: resultsData?.total ?? conv?.estimated_matches ?? 0,
          });

          // Restore results — jump straight to results view for a better UX
          if (resultsData.hasResults && Array.isArray(resultsData.results) && resultsData.results.length > 0) {
            setCachedResults(resultsData.results, resultsData.total);
            setResults(resultsData.results);
            setResultsMeta({ total: resultsData.total, cached: true, totalPages: resultsData.total_pages || 1 });
            setUiPage(resultsData.page || 1);
            // Show results view directly — user can always click "Back to Chat" to see history
            setIsResultsView(true);
            hasRunSearchRef.current = true;
            // NOTE: don't set credits on restore — credits are only live-search costs
          }
        })
        .catch(() => {});
    } else {
      // Fresh new search (e.g. clicked the + icon)
      resetSearch();
      conversationCreatedRef.current = false;
      hasRunSearchRef.current = false;
      setIsResultsView(false);
      setResults(null);
      setFilters({});
      setResultsMeta(null);
      pageCacheRef.current = {};
      passLevelRef.current = 1;

      // FIX 2: Instantly create a search record so the first message never loses its ID
      const pid = initialProjectId;
      if (pid) {
        fetch(`/api/projects/${pid}/searches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Search" }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.search?.id) {
              setSearchId(data.search.id);
              conversationCreatedRef.current = true;
              router.replace(`/search?project_id=${pid}&search_id=${data.search.id}`, { scroll: false });
            }
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearchId, initialProjectId]);

  // ── Auto-cache rendered pages ──────────────────────────────────────────────
  useEffect(() => {
    if (results && results.length > 0) {
      pageCacheRef.current[uiPage] = results;
    }
  }, [results, uiPage]);

  // ── Auto-create a search conversation on first message ────────────────────
  // This ensures every search is linked to a project in the DB
  const ensureSearchConversation = useCallback(async (firstMessage: string) => {
    // If we already have a searchId (e.g. from clearAll instant creation), we don't need to CREATE a new one.
    // However, we might want to update its title from "New Search" to the first message.
    const existingId = useSearchStore.getState().searchId;
    const projectId = initialProjectId ?? useSearchStore.getState().projectId;
    if (!projectId) return;

    if (existingId && conversationCreatedRef.current) {
      // Already has an ID and we've marked it as "created" (fully initialized)
      // Just update the title if it's currently generic
      try {
        const title = firstMessage.trim().slice(0, 60) || "New Search";
        await fetch(`/api/searches/${existingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        window.dispatchEvent(new CustomEvent("searchRename", { detail: { id: existingId, title } }));
      } catch (e) {
        console.error("Failed to update search title", e);
      }
      return;
    }

    if (conversationCreatedRef.current) return; // Guard for parallel calls
    conversationCreatedRef.current = true; 

    try {
      const title = firstMessage.trim().slice(0, 60) || "New Search";
      const res = await fetch(`/api/projects/${projectId}/searches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (data.search?.id) {
        setSearchId(data.search.id);
        window.dispatchEvent(new CustomEvent("searchRename", { detail: { id: data.search.id, title } }));
        router.replace(`/search?project_id=${projectId}&search_id=${data.search.id}`, { scroll: false });
      }
    } catch {
      conversationCreatedRef.current = false; 
    }
  }, [initialProjectId, setSearchId, router]);

  // (restore useEffect removed — handled above in unified bootstrap)

  // ── Watch for "Run Search" trigger from FilterSummaryCard ────────────────
  // IMPORTANT: use a ref to prevent stale closure re-fires.
  // The old pattern (useEffect on status → fire useCallback with filters deps)
  // would re-fire whenever filters or accumulatedContext reference changed
  // (which happens right after a search completes), causing 4x duplicate calls.
  const pendingSearchRef = useRef(false);
  useEffect(() => {
    if (status === "SEARCHING" && !searching && !pendingSearchRef.current) {
      pendingSearchRef.current = true;
      handleExecuteSearch().finally(() => {
        pendingSearchRef.current = false;
      });
    }
    // intentionally only depends on status + searching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, searching]);

  // ── Go back to chat — FIXED: set status to CONFIRMING so useEffect doesn't re-trigger
  const goBackToChat = useCallback(() => {
    setIsResultsView(false);
    // Critical fix: if status is SEARCHING, reset to CONFIRMING
    // so the useEffect watcher doesn't fire handleExecuteSearch again
    if (status === "SEARCHING") {
      setStatus("CONFIRMING");
    }
    hasRunSearchRef.current = true; // Prevent re-run
  }, [status, setStatus]);

  // ── Execute search — priority: Zustand cache → DB results → fresh Prospeo ──
  const handleExecuteSearch = useCallback(async () => {
    setMode("idle");
    // Always read the LIVE state from the store — never capture stale closure
    const liveFilters = useSearchStore.getState().accumulatedContext._resolvedFilters as ProspeoFilters | undefined;
    const liveContext = useSearchStore.getState().accumulatedContext;

    // 1. Fast path: Zustand in-memory cache (same session, single-call already ran)
    const stored = useSearchStore.getState().cachedResults;
    const storedTotal = useSearchStore.getState().cachedTotal;
    if (stored && stored.length > 0) {
      const meta = { total: storedTotal ?? stored.length, cached: false, totalPages: Math.ceil((storedTotal ?? stored.length) / 15) };
      
      // Cache these locally for instant page switching
      const itemsPerPage = 15;
      for (let p = 1; p <= Math.ceil(stored.length / itemsPerPage); p++) {
        pageCacheRef.current[p] = stored.slice((p - 1) * itemsPerPage, p * itemsPerPage);
      }

      setResults(stored.slice(0, 15)); // Only show first page
      setResultsMeta(meta);
      setIsResultsView(true);
      hasRunSearchRef.current = true;
      setStatus("CONFIRMING");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }



    // 3. Fallback: fresh CrustData search (no cached data anywhere)
    setStatus("SEARCHING");
    // Read LIVE state from store — not from stale closure
    const localFilters = liveFilters ?? (Object.keys(filters).length > 0 ? filters : undefined);
    if (!localFilters || Object.keys(localFilters).length === 0) {
      toast.error("Please provide a query or select filters.");
      setStatus("CONFIRMING");
      return;
    }

    setSearching(true);
    const finalFilters = localFilters;

    // Minimum result count to show results view. Below this, we return to chat
    // and let the AI suggest broadening options — avoiding a silent second API call.
    const LOW_RESULT_THRESHOLD = 15;

    try {
      // Resolve required skills with robust multi-level fallback:
      // 1. _resolution.extraction.raw_tech  (from JD extraction flow)
      // 2. accumulated_context.technologies  (set by chat route)
      // 3. filterState.skills               (manually set via filter modal)
      const resolvedRequiredSkills: string[] =
        (liveContext._resolution as any)?.extraction?.raw_tech ??
        (liveContext as any)?.technologies ??
        (liveContext as any)?.skills ??
        (finalFilters as any)?.skills ??
        [];

      const resolvedIndustries: string[] =
        (liveContext._resolution as any)?.extraction?.raw_industry ??
        (liveContext as any)?.industry ??
        [];

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "",
          crustdata_filters: Object.keys(finalFilters).length > 0 ? finalFilters : undefined,
          ui_page: 1,
          search_id: useSearchStore.getState().searchId ?? undefined,
          required_skills: resolvedRequiredSkills,
          search_industries: resolvedIndustries,
          domain_cluster: (liveContext as any).domain_cluster ?? "other",
          pass_level: 1, // Always run a single pass — never auto-escalate
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");

      // Save the search result permanently inside the conversation history
      // so the FilterSummaryCard never disappears even if the user continues chatting.
      const store = useSearchStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg) {
        store.updateMessage(lastMsg.id, {
          isSearchReadyEvent: true,
          searchTotal: data.total,
          searchResults: data.results.slice(0, 3) as any,
          searchFilters: finalFilters as Record<string, unknown>,
        });
      }

      // Always populate local state and cache, even if we're about to return to chat.
      // This ensures the FilterSummaryCard can show previews and "Explore All" works instantly.
      setResults(data.results);
      setResultsMeta({ 
        total: data.total, 
        cached: data.fromCache, 
        totalPages: data.total_pages || 1, 
        creditsUsed: data.credits_used 
      });
      const currentFullResults = (data.full_results || data.results) as ScoredCandidate[];
      setCachedResults(currentFullResults, data.total, data.next_cursor);
      setLastCreditsUsed(data.credits_used);

      // ── Zero result recovery (TALENT SCARCITY DIAGNOSIS) ─────────────
      // We no longer auto-broaden and burn 12 credits. We just show the Zero Results UI.
      if (data.total === 0 && !forceBypassRef.current) {
        // Just let it render the Zero Results UI below
        setIsResultsView(true);
        // We can still inject the zero_result_reason to chat if we want, but it's handled below
      }

      // If results are low but > 0, we STAY in results view but still inject context to chat
      if (data.total <= LOW_RESULT_THRESHOLD && data.total > 0 && !forceBypassRef.current) {
        const ctx = useSearchStore.getState().accumulatedContext;
        const titleLabel = (ctx.job_titles as string[] | undefined)?.[0] ?? "this role";
        const locationLabel = (ctx.locations as string[] | undefined)?.[0] ?? "that location";
        const industry = (ctx.industry as string[] | undefined)?.[0] ?? "";

        const systemMsg = `[SEARCH_RESULT: ${data.total} candidates found for ${titleLabel} in ${locationLabel}${industry ? `. INDUSTRY: ${industry}` : ""}. Suggesting strategic pivots.]`;
        window.dispatchEvent(new CustomEvent("nexire:inject_search_result", { detail: { message: systemMsg } }));
        setIsResultsView(true);
      } else {
        // Store what was relaxed if server auto-broadened on this single pass
        if (data.what_was_relaxed?.length > 0) setBroadenNotice(data.what_was_relaxed);
        setIsResultsView(true);
      }

      // ── Normal results — show results view ──────────────────────────────────
      forceBypassRef.current = false; // Reset
      
      // Populate local component cache for all pages in this batch instantly
      if (data.full_results) {
        const itemsPerPage = 15;
        for (let p = 1; p <= Math.ceil(data.full_results.length / itemsPerPage); p++) {
          pageCacheRef.current[p] = data.full_results.slice((p - 1) * itemsPerPage, p * itemsPerPage);
        }
      }

      setUiPage(data.ui_page || 1);
      setIsResultsView(true);
      hasRunSearchRef.current = true;
      setStatus("CONFIRMING");
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Persist results now handled by backend in the background to prevent truncation
      // persistResults(data.results, data.total, finalFilters as Record<string, unknown>);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Search failed");
      setStatus("CONFIRMING");
    } finally {
      setSearching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Empty deps — reads live state from store at call time, never re-creates callback

  // ── Called by SearchTerminal when background single-call is done ──────────
  const handleResultsReady = useCallback((r: unknown[], total: number) => {
    const list = r as ScoredCandidate[];
    // Cache all pages for instant switching
    const itemsPerPage = 15;
    for (let p = 1; p <= Math.ceil(list.length / itemsPerPage); p++) {
      pageCacheRef.current[p] = list.slice((p - 1) * itemsPerPage, p * itemsPerPage);
    }

    setResults(list.slice(0, 15)); // Fix: only show first page
    setResultsMeta({ total, cached: false, totalPages: Math.ceil(total / 15) });
    // Also persist these results — now handled by backend
  }, []);

  // ── JD extraction → pre-fill FilterModal ────────────────────────────────
  const handleJDExtracted = (extractedFilters: ProspeoFilters, meta: unknown) => {
    setFilters(extractedFilters);
    setAiMeta(meta);
    setMode("filter");
  };

  // ── Start a completely fresh new search ────────────────────────────────
  const clearAll = useCallback(async () => {
    const pid = useSearchStore.getState().projectId || initialProjectId;
    
    // 1. Optimistically clear the UI to hide old results immediately
    resetSearch();
    setIsResultsView(false);
    setResults(null);
    setFilters({});
    setResultsMeta(null);
    setMode("idle");
    
    // 2. Perform soft-navigation via Next.js router instead of hard reload
    // Create the search record client-side to avoid Next.js server-side redirects
    if (pid) {
      try {
        const res = await fetch(`/api/projects/${pid}/searches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Search" }),
        });
        const data = await res.json();
        if (data.search?.id) {
          setSearchId(data.search.id);
          window.dispatchEvent(new CustomEvent("searchRename", { detail: { id: data.search.id, title: "New Search" } }));
          // Note: using window.history.pushState instead of router.push prevents Next.js from triggering Server Components and causing a full page load.
          window.history.pushState(null, "", `/search?project_id=${pid}&search_id=${data.search.id}`);
          return;
        }
      } catch (e) {
        console.error("Failed to optimistically create search", e);
      }
      window.history.pushState(null, "", `/search?project_id=${pid}`);
    } else {
      window.history.pushState(null, "", "/search");
    }
  }, [initialProjectId, router, resetSearch, setSearchId]);

  const handleEditFilters = () => {
    const resolvedFils = accumulatedContext._resolvedFilters as ProspeoFilters | undefined;
    if (resolvedFils && Object.keys(resolvedFils).length > 0) setFilters(resolvedFils);
    setMode("filter");
  };

  const isRunningSearchRef = useRef(false);
  const forceBypassRef = useRef(false);

  // handleRunSearch: triggered by FilterSummaryCard (Explore All) or SearchTerminal (Auto-fill)
  const handleRunSearch = (force?: boolean) => {
    if (isRunningSearchRef.current) return; // Prevent duplicate triggers
    isRunningSearchRef.current = true;
    
    // If user clicked "Explore All", they explicitly want to see results even if < 15.
    if (force === true) {
      forceBypassRef.current = true;
    }
    
    passLevelRef.current = 1; // Reset to pass 1 when running a fresh search from chat
    setStatus("SEARCHING");
    // Reset guard after 3 seconds
    setTimeout(() => { isRunningSearchRef.current = false; }, 3000);
  };

  // Handle global "startNewSearch" events from Sidebar/Topbar
  useEffect(() => {
    const handleNewSearchEvent = () => clearAll();
    window.addEventListener("startNewSearch", handleNewSearchEvent);
    return () => window.removeEventListener("startNewSearch", handleNewSearchEvent);
  }, [clearAll]);

  // ── Pagination orchestrator ──────────────────────────────────────────────
  const handlePageChange = useCallback(async (newPage: number) => {
    if (searching) return;
    
    // 1. Check local client-side memory cache first for instant load
    if (pageCacheRef.current[newPage]) {
      setResults(pageCacheRef.current[newPage]);
      setUiPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // 2. Check if we already have this page in the DB (Local DB Cache slice)
    if (resultsMeta && newPage <= resultsMeta.totalPages) {
      setSearching(true);
      try {
        const searchId = useSearchStore.getState().searchId;
        if (searchId) {
          const res = await fetch(`/api/searches/${searchId}/results?page=${newPage}`);
          const data = await res.json();
          // ONLY use the DB cache if it ACTUALLY has candidates. 
          // If it's empty, it means we predicted the page existed based on estimated total,
          // but we haven't actually fetched it from CrustData yet. Fall through!
          if (data.results && data.results.length > 0) {
            setResults(data.results);
            setUiPage(newPage);
            window.scrollTo({ top: 0, behavior: "smooth" });
            setSearching(false);
            return;
          }
        }
      } catch (err) {
        toast.error("Failed to load page");
        setSearching(false);
        return;
      }
      // If we got here, data.results was empty.
      // ── Pagination Safety Check ──
      // If the current batch total (stored in state) indicates this page should exist in the first 100,
      // it means the DB is still syncing. Do NOT skip to the next 100 results!
      const currentBatchResults = useSearchStore.getState().cachedResults;
      if (currentBatchResults && currentBatchResults.length > 0) {
        const itemsPerPage = 15;
        const maxPageInCurrentBatch = Math.ceil(currentBatchResults.length / itemsPerPage);
        
        if (newPage <= maxPageInCurrentBatch) {
          console.warn(`[Pagination] Page ${newPage} requested but DB returned empty. Batch exists locally. Suppressing skip.`);
          setResults(currentBatchResults.slice((newPage - 1) * itemsPerPage, newPage * itemsPerPage));
          setUiPage(newPage);
          setSearching(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
    }

    // Beyond DB cache — hit CrustData again using nextCursor
    const nextCursor = useSearchStore.getState().nextCursor;
    if (!nextCursor) {
      toast.error("No further results available.");
      return;
    }

    setSearching(true);
    try {
      const liveFilters = useSearchStore.getState().accumulatedContext._resolvedFilters as ProspeoFilters | undefined;
      const finalFilters = liveFilters ?? filters;
      
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "",
          crustdata_filters: Object.keys(finalFilters).length > 0 ? finalFilters : undefined,
          ui_page: 1, // Reset backend local-slice to 1 for the *new* 100 batch
          cursor: nextCursor,
          search_id: useSearchStore.getState().searchId ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");

      if (data.results && data.results.length === 0) {
        toast.info("You've reached the end of the matching candidates.");
        useSearchStore.getState().setCachedResults(
          useSearchStore.getState().cachedResults,
          resultsMeta?.total ?? null,
          null // clear cursor
        );
        setSearching(false);
        return;
      }

      setResults(data.results);
      
      const fullResults = (data.full_results || data.results) as ScoredCandidate[];
      // Backend returns total_pages = 7 for the new batch. Add to existing.
      const newTotalPages = data.total_pages + (resultsMeta?.totalPages || 0);
      setResultsMeta({ total: data.total, cached: data.fromCache, totalPages: newTotalPages, creditsUsed: data.credits_used });
      setLastCreditsUsed(data.credits_used);
      setCachedResults(fullResults, data.total, data.next_cursor);

      // Populate local component cache for the fresh batch
      if (data.full_results) {
        const itemsPerPage = 15;
        // The new batch starts at relative page 1, but we should map it to the NEW global page indices
        // Actually, just mapping them to the current newPage range is safer.
        const startPage = newPage; 
        for (let i = 0; i < Math.ceil(data.full_results.length / itemsPerPage); i++) {
          pageCacheRef.current[startPage + i] = data.full_results.slice(i * itemsPerPage, (i + 1) * itemsPerPage);
        }
      }

      setUiPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error("Failed to load more results");
    } finally {
      setSearching(false);
    }
  }, [searching, resultsMeta, filters]);

  // ── Active filter display (chips for results bar) ────────────────────────
  const resolvedFilters = (accumulatedContext._resolvedFilters ?? filters) as Record<string, unknown>;
  const jobTitles: string[] = (resolvedFilters?.person_job_title as any)?.include ?? [];
  const locations: string[] = (resolvedFilters?.person_location_search as any)?.include ?? [];
  const industries: string[] = (resolvedFilters?.company_industry as any)?.include ?? [];
  const activeFilterCount = Object.keys(resolvedFilters).length;

  const containerAnimations = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.25 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };

  return (
    <>
      <AnimatePresence mode="wait">
      {!isResultsView ? (
        /* ─── CHAT VIEW ─── */
        <motion.div
          key="chat-view"
          {...containerAnimations}
          className="flex-1 flex flex-col bg-background relative min-h-full overflow-hidden"
        >
          <Toaster
            position="top-right"
            toastOptions={{ style: { background: "#fff", border: "1px solid #E8ECFF", color: "#0F1629" } }}
          />

          <SearchTerminal
            onEditFilters={handleEditFilters}
            onOpenJD={() => setMode("jd")}
            onRunSearch={handleRunSearch}
            onResultsReady={(r, total) => handleResultsReady(r, total)}
            onFirstMessage={ensureSearchConversation}
            onConversationSave={saveConversation}
          />
        </motion.div>
      ) : (
        /* ─── RESULTS VIEW ─── */
        <motion.div
          key="results-view"
          {...containerAnimations}
          className="flex h-full flex-col bg-background relative w-full"
        >
          <Toaster
            position="top-right"
            toastOptions={{ style: { background: "#fff", border: "1px solid #E8ECFF", color: "#0F1629" } }}
          />

          {/* ── Top Bar: Breadcrumb + Back to Chat + Filters ── */}
          <div className="px-4 py-3 border-b border-border bg-surface backdrop-blur-md z-10 shadow-sm flex-shrink-0">
            
            {/* Row 1: Back to Chat + Breadcrumb + Actions */}
            <div className="flex items-center gap-3">
              {/* HIGHLIGHTED Back to Chat button */}
              <button
                onClick={goBackToChat}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-500/15 border border-brand-500/50 text-brand-400 text-sm font-semibold hover:bg-brand-500/25 hover:border-brand-500 transition-all flex-shrink-0 group"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                Back to Chat
              </button>

              <div className="w-px h-5 bg-border flex-shrink-0" />

              {/* Breadcrumb */}
              <nav className="flex items-center gap-1 text-xs text-text-secondary min-w-0 flex-1">
                {initialProjectTitle && (
                  <>
                    <span className="truncate max-w-[100px] font-medium">{initialProjectTitle}</span>
                    <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-40" />
                  </>
                )}
                <span className="opacity-50">Searches</span>
                <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-40" />
                <span className="text-text-primary font-medium truncate max-w-[140px]">
                  {useSearchStore.getState().accumulatedContext.job_titles?.[0] ?? "Search Results"}
                </span>
              </nav>

              {/* Stats */}
              {resultsMeta && !searching && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-semibold text-text-primary">
                    {resultsMeta.total.toLocaleString()} candidates
                  </span>
                  {resultsMeta.cached && (
                    <span className="bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold">
                      Cached
                    </span>
                  )}
                </div>
              )}

              {/* Edit Filters */}
              <button
                onClick={handleEditFilters}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold flex-shrink-0 transition-all",
                  activeFilterCount > 0
                    ? "bg-brand-500/10 border-brand-500 text-brand-400 hover:bg-brand-500/20"
                    : "border-border text-text-secondary hover:border-brand-500/50 hover:text-brand-400"
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Edit Filters"}
              </button>

              {/* New Search */}
              <button
                onClick={clearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-text-secondary hover:border-brand-500/50 hover:text-brand-400 transition-colors flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
            </div>

            {/* Row 2: Active filter chips */}
            {(jobTitles.length > 0 || locations.length > 0 || industries.length > 0) && (
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {jobTitles.length > 0 && (
                  <span className="inline-flex items-center gap-1 bg-brand-50 border border-brand-100 text-brand-600 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
                    {jobTitles[0]}
                    {jobTitles.length > 1 && <span className="ml-1 opacity-70">+{jobTitles.length - 1}</span>}
                  </span>
                )}
                {locations.length > 0 && (
                  <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-text-secondary px-2.5 py-0.5 rounded-full text-[11px]">
                    📍 {locations[0]}
                    {locations.length > 1 && <span className="ml-1 opacity-60">+{locations.length - 1}</span>}
                  </span>
                )}
                {industries.length > 0 && (
                  <span className="inline-flex items-center gap-1 bg-white/5 border border-white/10 text-text-secondary px-2.5 py-0.5 rounded-full text-[11px]">
                    🏢 {industries[0]}
                    {industries.length > 1 && <span className="ml-1 opacity-60">+{industries.length - 1}</span>}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Broaden Notice Banner ── */}
          <AnimatePresence>
            {broadenNotice && broadenNotice.length > 0 && (
              <motion.div
                key="broaden-notice"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-start gap-3 bg-amber-50 border-b border-amber-200 px-6 py-3 flex-shrink-0"
              >
                <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-amber-800">Search automatically broadened to find results. </span>
                  <span className="text-xs text-amber-700">
                    Relaxed: {broadenNotice.join(" · ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBroadenNotice(null)}
                  className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Reality Check Banner (< 5 Results) ── */}
          <AnimatePresence>
            {resultsMeta && resultsMeta.total > 0 && resultsMeta.total < 5 && !searching && (
              <motion.div
                key="reality-check"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-start gap-3 bg-indigo-50 border-b border-indigo-200 px-6 py-3 flex-shrink-0"
              >
                <span className="text-xl shrink-0 mt-0.5">🧐</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-indigo-900">Reality Check: Only {resultsMeta.total} profiles found. </span>
                  <span className="text-sm text-indigo-800">
                    This is likely a supply pipeline problem (Talent Scarcity), not a search problem. Your requirements may be too rigid for the active market.
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Results area ── */}
          <div className="flex-1 overflow-hidden w-full">
            {searching ? (
              <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
                  <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                  <span className="text-sm font-medium text-brand-400">Searching candidates…</span>
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse border-l-4 border-l-transparent">
                    <div className="w-10 h-10 rounded-full bg-surface-raised flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="w-1/4 h-4 bg-surface-raised rounded" />
                      <div className="w-1/3 h-3 bg-surface-raised rounded" />
                      <div className="flex gap-2 pt-1">
                        <div className="w-16 h-4 bg-surface-raised rounded-md" />
                        <div className="w-20 h-4 bg-surface-raised rounded-md" />
                      </div>
                    </div>
                    <div className="w-12 h-7 bg-surface-raised rounded-lg" />
                  </div>
                ))}
              </div>
            ) : results?.length === 0 ? (
              // Zero results shown only if the auto-return-to-chat path was bypassed
              // (e.g. restored from DB history). Normally the low-result path in
              // handleExecuteSearch auto-returns before we get here.
              <div className="flex flex-col items-center justify-center h-full py-16 px-8 animate-fade-in text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
                  <span className="text-2xl">👀</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">No candidates found</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-sm">
                  Your filters may be too specific. Go back to chat and I&apos;ll suggest a broader search.
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100/50 mb-8">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700">0 credits consumed</span>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
                  <button
                    onClick={goBackToChat}
                    className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition shadow-sm w-full"
                  >
                    Back to Chat
                  </button>
                  <button
                    onClick={() => { setIsResultsView(false); handleEditFilters(); }}
                    className="px-4 py-2.5 text-sm font-semibold rounded-lg transition w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Adjust Filters Manually
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("This will execute a broader search and cost 3 credits. Proceed?")) {
                        // Triggers a pass_level: 2 or 3 manual search. We will just set passes by updating the store or directly fetch
                        // In reality, user should just adjust filters, but if they want the AI to relax:
                        setStatus("SEARCHING");
                        passLevelRef.current = 4; // Minimal filters
                        handleExecuteSearch();
                      }
                    }}
                    className="px-4 py-2.5 text-sm font-semibold rounded-lg transition w-full bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100"
                  >
                    Auto-Broaden Search
                  </button>
                </div>
              </div>
            ) : results ? (
              <div className="flex flex-col h-full bg-white">
                <SearchResults 
                  results={results}
                  totalCount={resultsMeta?.total}
                  searchId={searchId ?? undefined}
                  titleKeywords={[
                    ...((accumulatedContext.job_titles as string[] | undefined) ?? []),
                    ...((accumulatedContext._resolution as any)?.titleSuggestions ?? []),
                  ].slice(0, 12)}
                  skillKeywords={
                    ((accumulatedContext._resolution as any)?.extraction?.raw_tech as string[] | undefined) ?? []
                  }
                  pagination={resultsMeta && resultsMeta.totalPages > 1 ? {
                    uiPage,
                    totalPages: Math.max(resultsMeta.totalPages, uiPage + (useSearchStore.getState().nextCursor ? 1 : 0)),
                    total: resultsMeta.total,
                    hasNextCursor: !!useSearchStore.getState().nextCursor,
                    onPageChange: handlePageChange,
                    searching
                  } : undefined}
                />
              </div>
            ) : null}
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shared Modals ── */}
      <SearchChoiceModal
        isOpen={mode === "choice"}
        onClose={() => setMode("idle")}
        onSelectManual={() => setMode("filter")}
        onSelectJD={() => setMode("jd")}
      />

      <FilterModal
        open={mode === "filter"}
        onClose={() => setMode("idle")}
        onApply={(f) => {
          const next = f as unknown as ProspeoFilters;
          setFilters(next);
          setMode("idle");
          // Update resolved filters in store
          useSearchStore.getState().updateAccumulatedContext({ _resolvedFilters: next as unknown as Record<string, unknown> });
          
          // Clear cache when manually editing filters to force fresh search
          setCachedResults(null, null);
          hasRunSearchRef.current = false;
          passLevelRef.current = 1; // Reset to pass 1 on manual filter change

          // If in results view, re-run search immediately
          if (isResultsView) {
            setStatus("SEARCHING");
            return;
          }

          // If in chat view, just re-estimate matches in background
          if (hasChatStarted) {
            setStatus("CONFIRMING");
            useSearchStore.getState().setEstimatedMatches(null);
            fetch("/api/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: "",
                crustdata_filters: next,
                ui_page: 1,
                search_id: useSearchStore.getState().searchId ?? undefined,
                pass_level: 1, // Reset to pass 1 when estimating from modal
              }),
            })
              .then((r) => r.json())
              .then((countData) => {
                if (typeof countData.total === "number") {
                  useSearchStore.getState().setEstimatedMatches(countData.total);
                }
                if (Array.isArray(countData.results)) {
                  setCachedResults(countData.results, countData.total, countData.next_cursor);
                  
                  // Cache these locally for instant page switching
                  const itemsPerPage = 15;
                  for (let p = 1; p <= Math.ceil(countData.results.length / itemsPerPage); p++) {
                    pageCacheRef.current[p] = countData.results.slice((p - 1) * itemsPerPage, p * itemsPerPage);
                  }

                  setResults(countData.results.slice(0, 15)); // Fix: only show first page
                  setResultsMeta({ total: countData.total, cached: false, totalPages: countData.total_pages || 1 });
                  setUiPage(countData.ui_page || 1);
                }
              })
              .catch(() => {});
          }
        }}
        initialFilters={(accumulatedContext._resolvedFilters as Partial<CrustDataFilterState>) ?? filters ?? {}}
      />

      <JDSearchModal
        isOpen={mode === "jd"}
        onClose={() => setMode("idle")}
        onFiltersExtracted={handleJDExtracted}
      />
    </>
  );
}
