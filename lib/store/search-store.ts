import { create } from "zustand";
import type { ScoredCandidate } from "@/lib/ai/scorer";

export type SearchStateStatus = "IDLE" | "COLLECTING" | "RESOLVING" | "CONFIRMING" | "SEARCHING";

export interface SuggestedQuestion {
  field: string;
  label: string;
  options: string[];
}

export interface AccumulatedContext {
  job_titles?: string[];
  locations?: string[];
  technologies?: string[];
  experience_years?: string | null;
  seniority?: string[];
  industry?: string[];
  company_type?: string[];
  other_keywords?: string[];
  schools?: string[];
  company_headcount_range?: string[];
  company_funding_stage?: string[];
  exclude_companies?: string[];
  exclude_job_titles?: string[];
  selected_filter_dimensions?: string[];
  search_mode?: "sniper" | "title_flex" | "location_flex" | "wide" | null;
  domain_cluster?: string;
  requirement_summary?: string | null;
  _resolvedFilters?: Record<string, unknown>;
  _resolution?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  widgetData?: SuggestedQuestion[];
  isError?: boolean;
  topProfiles?: ScoredCandidate[];
  // Embedded historical search data
  isSearchReadyEvent?: boolean;
  searchResults?: ScoredCandidate[];
  searchTotal?: number;
  searchFilters?: Record<string, unknown>;
}

export interface SearchStore {
  // Session details
  conversationId: string | null;
  searchId: string | null;         // DB search_conversations.id
  projectId: string | null;        // active project context
  status: SearchStateStatus;

  // Data
  messages: ChatMessage[];
  accumulatedContext: AccumulatedContext;
  estimatedMatches: number | null;
  isResolvingFilters: boolean;
  isEstimatingMatches: boolean;

  // Cached results from the single API call
  cachedResults: ScoredCandidate[] | null;
  cachedTotal: number | null;
  nextCursor: string | null;
  lastCreditsUsed: number | null;

  // Actions
  setConversationId: (id: string) => void;
  setSearchId: (id: string | null) => void;
  setProjectId: (id: string | null) => void;
  setStatus: (status: SearchStateStatus) => void;
  addMessage: (msg: Omit<ChatMessage, "id">) => string;
  updateMessage: (id: string, partial: Partial<ChatMessage>) => void;
  removeLastMessage: () => void;
  updateAccumulatedContext: (newContext: Partial<AccumulatedContext>) => void;
  setEstimatedMatches: (count: number | null) => void;
  setIsResolvingFilters: (v: boolean) => void;
  setIsEstimatingMatches: (v: boolean) => void;
  setCachedResults: (results: ScoredCandidate[] | null, total: number | null, nextCursor?: string | null) => void;
  setLastCreditsUsed: (count: number | null) => void;
  resetSearch: () => void;
  /** Atomically restore a full persisted search session (messages + context + status) */
  restoreConversation: (payload: {
    searchId: string;
    projectId?: string;
    messages: ChatMessage[];
    accumulatedContext: AccumulatedContext;
    status?: SearchStateStatus;
    estimatedMatches?: number | null;
  }) => void;
}

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const useSearchStore = create<SearchStore>((set) => ({
  conversationId: null,
  searchId: null,
  projectId: null,
  status: "IDLE",
  messages: [],
  accumulatedContext: {},
  estimatedMatches: null,
  isResolvingFilters: false,
  isEstimatingMatches: false,
  cachedResults: null,
  cachedTotal: null,
  nextCursor: null,
  lastCreditsUsed: null,

  setConversationId: (id) => set({ conversationId: id }),
  setSearchId: (id) => set({ searchId: id }),
  setProjectId: (id) => set({ projectId: id }),
  setStatus: (status) => set({ status }),

  addMessage: (msg) => {
    const id = generateId();
    set((state) => ({
      messages: [...state.messages, { ...msg, id }]
    }));
    return id;
  },

  updateMessage: (id, partial) => set((state) => ({
    messages: state.messages.map((m) => m.id === id ? { ...m, ...partial } : m)
  })),

  removeLastMessage: () => set((state) => ({
    messages: state.messages.slice(0, -1)
  })),

  updateAccumulatedContext: (newContext) => set((state) => ({
    accumulatedContext: { ...state.accumulatedContext, ...newContext }
  })),

  setEstimatedMatches: (count) => set({ estimatedMatches: count }),
  setIsResolvingFilters: (v) => set({ isResolvingFilters: v }),
  setIsEstimatingMatches: (v) => set({ isEstimatingMatches: v }),
  setCachedResults: (results, total, nextCursor) => set({ cachedResults: results, cachedTotal: total, nextCursor: nextCursor ?? null }),
  setLastCreditsUsed: (count) => set({ lastCreditsUsed: count }),

  resetSearch: () => set({
    conversationId: null,
    searchId: null,
    status: "IDLE",
    messages: [],
    // Fully reset ALL context fields — fixes stale location/industry on new search
    accumulatedContext: {},
    estimatedMatches: null,
    isResolvingFilters: false,
    isEstimatingMatches: false,
    cachedResults: null,
    cachedTotal: null,
    nextCursor: null,
    lastCreditsUsed: null,
  }),

  restoreConversation: ({ searchId, projectId, messages, accumulatedContext, status, estimatedMatches }) =>
    set({
      searchId,
      ...(projectId ? { projectId } : {}),
      messages,
      accumulatedContext,
      status: status ?? "CONFIRMING",
      estimatedMatches: estimatedMatches ?? null,
      isResolvingFilters: false,
      isEstimatingMatches: false,
      cachedResults: null,
      cachedTotal: null,
    }),
}));
