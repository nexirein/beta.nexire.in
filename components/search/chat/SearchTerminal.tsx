"use client";

/**
 * components/search/chat/SearchTerminal.tsx
 * Cursor-for-HR style chat — clean light mode, no search_mode selector.
 *
 * Key UX principles (inspired by Cursor AI):
 * 1. Clean white/gray chat bubbles — no dark glass panels
 * 2. AI responses in light gray cards with subtle border
 * 3. User messages in brand-blue right bubbles
 * 4. Typing indicator as minimal dots in a light pill
 * 5. Intelligent filter card appears inline (not in a dark box)
 * 6. Empty state: centered, minimalist, prominent input
 * 7. NO search_mode selector — AI figures it out automatically
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchStore, generateId } from "@/lib/store/search-store";
import { ChatInput } from "./ChatInput";
import { WidgetRenderer } from "./WidgetRenderer";
import { FilterSummaryCard } from "./FilterSummaryCard";
import { RefreshCcw, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AccumulatedContext } from "@/lib/store/search-store";
import { useUser } from "@/lib/hooks/useUser";
import { CandidateDrawer } from "@/app/(app)/search/CandidateDrawer";
import { cn } from "@/lib/utils";
import { clsx, type ClassValue } from "clsx";
import type { ScoredCandidate } from "@/lib/ai/scorer";

void generateId;

interface SearchTerminalProps {
  onEditFilters?: () => void;
  onOpenJD?: () => void;
  onRunSearch?: () => void;
  onFirstMessage?: (firstMessage: string) => Promise<void>;
  onResultsReady?: (results: unknown[], total: number, filters: Record<string, unknown>) => void;
  onConversationSave?: (msgs: unknown[], ctx: Record<string, unknown>) => Promise<void>;
}

export function SearchTerminal({ onEditFilters, onOpenJD, onRunSearch, onResultsReady, onFirstMessage, onConversationSave }: SearchTerminalProps) {
  const { profile } = useUser();
  const {
    messages, status, addMessage, setStatus,
    updateAccumulatedContext, accumulatedContext,
    setEstimatedMatches, setIsResolvingFilters, setIsEstimatingMatches,
    setCachedResults, searchId,
  } = useSearchStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<ScoredCandidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  void selectedCandidate;
  void drawerOpen;

  // Stable ref so the search-result-inject event listener always calls the latest
  // version of handleSendMessage without stale closure issues.
  const handleSendMessageRef = useRef<((content: string, widgetAnswers?: Record<string, string[]>, isSystemMsg?: boolean, displayContent?: string) => void) | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, retryCount]);

  // ── Listen for low-result inject from SearchClient ─────────────────────────
  // When a search returns ≤10 results, SearchClient goes back to chat and
  // dispatches this event so the AI can suggest broader options (Rule 5).
  // Uses a ref so it always has the latest handleSendMessage (no stale closure).
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!msg || !handleSendMessageRef.current) return;
      handleSendMessageRef.current(msg, undefined, true);
    };
    window.addEventListener("nexire:inject_search_result", handler);
    return () => window.removeEventListener("nexire:inject_search_result", handler);
  }, []);


  const persistConversation = useCallback(async (
    msgs: typeof messages,
    ctx: AccumulatedContext,
    st: typeof status
  ) => {
    if (!searchId) return;
    fetch(`/api/searches/${searchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: msgs,
        accumulated_context: ctx,
        status: st,
      }),
    }).catch(() => {});
  }, [searchId]);

  const handleSendMessage = async (content: string, widgetAnswers?: Record<string, string[]>, isSystemMsg: boolean = false, displayContent?: string) => {
    // Keep ref current so the search-result event listener always calls the latest version
    handleSendMessageRef.current = handleSendMessage;

    if (content && messages.length === 0 && onFirstMessage && !isSystemMsg) {
      onFirstMessage(content).catch(() => {});
    }

    // Use displayContent for the chat bubble (human-readable) but send content (may include [WIDGET_SELECTION]) to API
    const bubbleContent = displayContent || content;
    const isMetaMessage = content.startsWith("[SYSTEM]") || content.startsWith("search_mode:");
    if (content && !isSystemMsg && !isMetaMessage) addMessage({ role: "user", content: bubbleContent });

    let newContext: AccumulatedContext = { ...accumulatedContext };
    if (widgetAnswers) {
      Object.entries(widgetAnswers).forEach(([key, values]) => {
        if (values.length === 0) return;
        const current = (newContext as Record<string, unknown>)[key];
        const existing = Array.isArray(current) ? (current as string[]) : [];
        (newContext as Record<string, unknown>)[key] = Array.from(new Set([...existing, ...values]));
      });
      updateAccumulatedContext(newContext);
    }

    setStatus("RESOLVING");

    try {
      const currentMessages = isSystemMsg ? useSearchStore.getState().messages : messages;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...currentMessages, { role: "user", content }],
          accumulatedContext: newContext,
        }),
      });

      if (!res.ok) throw new Error("Chat API failed");
      const data = await res.json();

      if (data.updated_context) {
        updateAccumulatedContext(data.updated_context);
        newContext = { ...newContext, ...data.updated_context };
      }

      const assistantMsgId = addMessage({
        role: "assistant",
        content: data.ai_message,
        widgetData: data.suggested_questions,
      });

      const hasPendingWidgets = Array.isArray(data.suggested_questions) && data.suggested_questions.length > 0;

      if (data.ready_for_search && !hasPendingWidgets) {
        setEstimatedMatches(null);
        updateAccumulatedContext({ _resolvedFilters: undefined, _resolution: undefined });
        setIsResolvingFilters(true);
        setIsEstimatingMatches(false);
        setCachedResults(null, null);

        setStatus("CONFIRMING");

        (async () => {
          try {
            const resolveRes = await fetch("/api/ai/context-to-filters", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accumulatedContext: newContext }),
            });
            const resolvedData = await resolveRes.json();

            if (!resolveRes.ok || !resolvedData.filters) {
              setIsResolvingFilters(false);
              return;
            }

            useSearchStore.getState().updateAccumulatedContext({
              _resolvedFilters: resolvedData.filters,
              _resolution: resolvedData.resolution,
              requirement_summary: resolvedData.requirementSummary || null,
            });
            setIsResolvingFilters(false);
              // (Removed automatic /api/search call to prevent double fetching)
              // Wait for user to click "Run Search"
              
              const currentSid = useSearchStore.getState().searchId;
              if (currentSid) {
                const ctx = useSearchStore.getState().accumulatedContext;
                const autoTitle = generateSearchTitle(ctx);
                
                await fetch(`/api/searches/${currentSid}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: autoTitle,
                    prospeo_filters: resolvedData.filters,
                    estimated_matches: null,
                    status: "CONFIRMING",
                  }),
                }).catch(() => {});

                window.dispatchEvent(new CustomEvent("searchRename", { detail: { id: currentSid, title: autoTitle } }));
              }
              
              // We do not call onResultsReady since results are not fetched yet
              // onResultsReady?.([], 0, resolvedData.filters);

            setIsResolvingFilters(false);
            setIsEstimatingMatches(false);
          } catch (e) {
            console.error("Background filter resolution failed", e);
            setIsResolvingFilters(false);
            setIsEstimatingMatches(false);
          }
        })();

        persistConversation(
          useSearchStore.getState().messages,
          newContext,
          "CONFIRMING"
        );
      } else {
        setStatus("COLLECTING");
        persistConversation(
          useSearchStore.getState().messages,
          newContext,
          "COLLECTING"
        );
      }
    } catch (err) {
      console.error(err);
      addMessage({
        role: "assistant",
        content: "I encountered a connection issue. Please try again.",
        isError: true,
      });
      setStatus("COLLECTING");
    }
  };

  const onWidgetSelect = (answers: Record<string, string[]>) => {
    if (answers.auto && answers.auto.length > 0) {
      handleSendMessage("Auto-fill: Nexire AI picks the best options and searches now.");
      return;
    }

    // Map widget field keys to human-readable labels for the chat bubble display
    const fieldLabels: Record<string, string> = {
      job_titles: "Added titles",
      locations: "Locations",
      search_intent: "Search precision",
      experience_years: "Experience",
      seniority: "Seniority",
      industry: "Industry",
      technologies: "Skills",
      schools: "Education",
      company_headcount_range: "Company size",
    };

    // Build display string for the user bubble (clean, human-readable)
    const displayParts = Object.entries(answers)
      .filter(([, vals]) => vals.length > 0)
      .map(([key, vals]) => `${fieldLabels[key] || key}: ${vals.join(", ")}`);

    // Build the actual message sent to the LLM.
    // [WIDGET_SELECTION] prefix signals the server to NEVER use replace_ flags —
    // these are always additions to existing context, never replacements.
    // This is the root fix for the "custom value disappears" bug.
    const llmMessage = `[WIDGET_SELECTION] ${displayParts.join("; ")}`;

    handleSendMessage(llmMessage, answers, false, displayParts.join(" · "));
  };

  const onWidgetSkip = () => {
    // Bypass the LLM entirely — the user wants to search with only what they stated.
    // Calling the chat API here risks the LLM injecting its own similar_job_titles
    // (e.g. "Logistics Manager" when user asked for "Fleet Manager").
    const currentContext = { ...useSearchStore.getState().accumulatedContext };

    addMessage({ role: "assistant", content: "Running search with your current criteria." });
    setEstimatedMatches(null);
    updateAccumulatedContext({ _resolvedFilters: undefined, _resolution: undefined });
    setIsResolvingFilters(true);
    setIsEstimatingMatches(false);
    setCachedResults(null, null);
    setStatus("CONFIRMING");

    (async () => {
      try {
        const resolveRes = await fetch("/api/ai/context-to-filters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accumulatedContext: currentContext, skipExpansion: true }),
        });
        const resolvedData = await resolveRes.json();

        if (!resolveRes.ok || !resolvedData.filters) {
          setIsResolvingFilters(false);
          return;
        }

        useSearchStore.getState().updateAccumulatedContext({
          _resolvedFilters: resolvedData.filters,
          _resolution: resolvedData.resolution,
          requirement_summary: resolvedData.requirementSummary || null,
        });
        setIsResolvingFilters(false);
        setIsEstimatingMatches(false);

        const currentSid = useSearchStore.getState().searchId;
        if (currentSid) {
          const ctx = useSearchStore.getState().accumulatedContext;
          const autoTitle = generateSearchTitle(ctx);
          await fetch(`/api/searches/${currentSid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: autoTitle,
              prospeo_filters: resolvedData.filters,
              estimated_matches: null,
              status: "CONFIRMING",
            }),
          }).catch(() => {});
          window.dispatchEvent(new CustomEvent("searchRename", { detail: { id: currentSid, title: autoTitle } }));
        }

        persistConversation(
          useSearchStore.getState().messages,
          useSearchStore.getState().accumulatedContext,
          "CONFIRMING"
        );
      } catch (e) {
        console.error("Skip filter resolution failed", e);
        setIsResolvingFilters(false);
        setIsEstimatingMatches(false);
      }
    })();
  };

  const handleRetry = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && lastMsg.isError) {
        useSearchStore.getState().removeLastMessage();
      }
      setRetryCount((prev) => prev + 1);
      handleSendMessage(lastUserMsg.content);
    }
  };

  const isFirstMessage = messages.length === 0;
  const firstName = profile?.full_name?.split(" ")[0] || "there";

  return (
    <div className="flex flex-col h-full w-full max-w-3xl mx-auto relative">
      {/* ── Chat Message Area ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 custom-scrollbar flex flex-col min-h-0">
        
        {/* ── Empty / Landing State ── */}
        <AnimatePresence mode="wait">
          {isFirstMessage && (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
              className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto w-full px-4 py-16"
            >
              {/* Premium Brand Icon */}
              <motion.div 
                animate={{ 
                  scale: [1, 1.08, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{ 
                  duration: 6, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="w-24 h-24 mb-8 flex items-center justify-center rounded-[24px] bg-gradient-to-b from-brand-50 to-white p-5 border border-brand-100 shadow-sm relative group"
              >
                <div className="absolute inset-0 bg-brand-500/10 rounded-[24px] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <img src="/assets/logos/favicon_nex.png" alt="Nexire" className="max-h-full w-auto object-contain relative z-10" />
              </motion.div>

              <h2 className="text-3xl font-bold text-text-primary tracking-tight mb-4">
                Hey {firstName}, who are you hiring?
              </h2>
              <div className="text-text-secondary text-base mb-12 max-w-2xl leading-relaxed">
                <p>Describe the role in plain English — I&apos;ll find the best candidates for you.</p>
                <p className="mt-1 opacity-80">Mention skills, experience, location, or paste a full JD to start.</p>
              </div>

              {/* Input */}
              <div className="w-full">
                <ChatInput
                  onSendMessage={handleSendMessage}
                  disabled={status === "RESOLVING"}
                  onManualFilters={onEditFilters}
                  onPasteJD={onOpenJD}
                  hasMessages={false}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Messages ── */}
        <div className="flex flex-col gap-5 mt-2">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isLatestMsg = i === messages.length - 1;
              const isLiveCard = isLatestMsg && (status === "CONFIRMING" || status === "SEARCHING");

              // Skip system messages from rendering in chat
              if (msg.content?.startsWith("[SYSTEM]") || msg.content?.startsWith("search_mode:")) return null;

              return (
                <React.Fragment key={msg.id || `msg-${i}`}>
                  {/* ── Message Bubble ── */}
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {/* AI avatar */}
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <span className="text-[10px] font-bold text-brand-500">AI</span>
                      </div>
                    )}

                    <div className={`flex flex-col max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      {/* Bubble */}
                      <div
                        className={cn(
                          "px-5 py-3.5 rounded-[22px] text-[14px] leading-relaxed shadow-sm transition-all",
                          msg.role === "user"
                            ? "bg-brand-500 text-white rounded-tr-md shadow-brand-500/10 font-medium"
                            : msg.isError
                              ? "bg-red-50 border border-red-200 text-red-700 rounded-tl-md"
                              : "bg-white border border-brand-100 text-gray-800 rounded-tl-md shadow-brand-100/20"
                        )}
                      >
                        {msg.role === "user" ? (
                          <UserMessageBubble content={msg.content} />
                        ) : (
                          <CollapsibleText content={msg.content} />
                        )}
                        {msg.isError && (
                          <button
                            onClick={handleRetry}
                            className="mt-2 inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
                          >
                            <RefreshCcw className="w-3 h-3" /> Retry
                          </button>
                        )}
                      </div>

                      {/* Widget chips (below AI bubble) */}
                      {msg.widgetData && msg.role === "assistant" && isLatestMsg && status === "COLLECTING" && (
                        <WidgetRenderer
                          widgetData={msg.widgetData}
                          onSelectCallback={onWidgetSelect}
                          onSkip={onWidgetSkip}
                          disabled={status !== "COLLECTING"}
                        />
                      )}
                    </div>

                    {/* User avatar */}
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-brand-600">
                        {(profile?.full_name?.charAt(0) || "U").toUpperCase()}
                      </div>
                    )}
                  </motion.div>

                  {/* ── Search Profile Card ── */}
                  {(msg.isSearchReadyEvent || (isLiveCard && (status === "SEARCHING" || status === "CONFIRMING"))) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-full"
                    >
                      <FilterSummaryCard
                        onEditFilters={onEditFilters}
                        onRunSearch={onRunSearch}
                        isLatest={isLiveCard}
                        historicalData={{
                          total: msg.searchTotal ?? 0,
                          filters: msg.searchFilters,
                          results: msg.searchResults,
                        }}
                      />
                    </motion.div>
                  )}
                </React.Fragment>
              );
            })}
          </AnimatePresence>

          {/* ── AI Typing Indicator ── */}
          {status === "RESOLVING" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center shrink-0">
                <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-50 border border-gray-200">
                {[0, 0.2, 0.4].map((delay, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${delay}s` }} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Filter Extraction Progress ── */}
          {status === "CONFIRMING" && useSearchStore.getState().isResolvingFilters && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 items-center"
            >
              <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-brand-500">AI</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl rounded-tl-sm bg-white border border-brand-100 shadow-sm">
                <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-[13px] text-gray-500">Understanding your criteria...</span>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} className="h-4 shrink-0" />
        </div>
      </div>

      {/* ── Input Bar (below first message) ── */}
      {messages.length > 0 && (
        <div className="px-4 pb-5 pt-2 shrink-0 bg-white/80 backdrop-blur-sm border-t border-gray-100">
          <div className="w-full max-w-3xl mx-auto">
            <ChatInput
              onSendMessage={(msg) => handleSendMessage(msg)}
              disabled={status === "RESOLVING"}
              onManualFilters={onEditFilters}
              onPasteJD={onOpenJD}
              hasMessages={true}
              placeholder={
                status === "RESOLVING"
                  ? "Thinking..."
                  : status === "CONFIRMING"
                    ? "Add more details to refine..."
                    : "Ask a follow-up or refine your search..."
              }
            />
          </div>
        </div>
      )}

      {/* ── Candidate Drawer ── */}
      <CandidateDrawer
        isOpen={drawerOpen}
        candidate={selectedCandidate}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

// ─── Quick Start Prompts ───────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  {
    label: "Operations / Field Role",
    desc: "Site engineer, QC inspector, maintenance...",
    text: "I need a site civil engineer with 3+ years in infrastructure projects, based in Mumbai.",
  },
  {
    label: "Tech / Product",
    desc: "Software engineer, product manager, data...",
    text: "Looking for a senior React developer with Node.js experience, 5+ years, open to remote.",
  },
  {
    label: "Sales / Business Dev",
    desc: "Account executive, BD manager, channel...",
    text: "Need a B2B sales manager in Bangalore with SaaS background, 4–8 years experience.",
  },
  {
    label: "Research / Analytics",
    desc: "Data analyst, market research, scientist...",
    text: "Looking for a data analyst with Python and SQL skills, 2+ years, in Delhi NCR.",
  },
];

// ─── Collapsible AI Response ─────────────────────────────────────────────────
function CollapsibleText({ content, maxLength = 380 }: { content: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldCollapse = content.length > maxLength;
  const displayText = isExpanded ? content : content.slice(0, maxLength);

  if (!shouldCollapse) return <div className="whitespace-pre-wrap">{content}</div>;

  return (
    <div className="relative">
      <div className="whitespace-pre-wrap">{displayText}{!isExpanded && "..."}</div>
      {!isExpanded && (
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
      )}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-1.5 text-[11px] font-semibold text-brand-500 hover:text-brand-600 transition-colors uppercase tracking-wide flex items-center gap-1"
      >
        {isExpanded ? "Show less ↑" : "Continue reading ↓"}
      </button>
    </div>
  );
}

// ─── User Message Bubble ─────────────────────────────────────────────────────
function UserMessageBubble({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 200 || content.split("\n").length > 4;

  if (!isLong) return <div className="whitespace-pre-wrap">{content}</div>;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"}`}>{content}</div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[11px] text-white/70 hover:text-white font-medium self-end transition-colors"
      >
        {expanded ? "Show less ↑" : "Show full ↓"}
      </button>
    </div>
  );
}

// ─── Search Title Generator ───────────────────────────────────────────────────
function generateSearchTitle(ctx: AccumulatedContext): string {
  const parts: string[] = [];
  if (ctx.job_titles?.[0]) parts.push(ctx.job_titles[0]);
  if (ctx.locations?.[0]) parts.push(ctx.locations[0]);
  if (ctx.industry?.[0] && parts.length < 2) parts.push(ctx.industry[0]);
  if (parts.length === 0) return "New Search";
  const raw = parts.slice(0, 2).join(" · ");
  return raw.length > 35 ? raw.slice(0, 35) + "…" : raw;
}
