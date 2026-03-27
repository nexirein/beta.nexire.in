"use client";
/**
 * components/search/InsightText.tsx
 *
 * Renders streamed AI insight text with:
 * 1. Word-by-word GPT-style reveal (tokens stream in from useInsightStream)
 * 2. Keyword highlighting — must_skills highlighted amber, title_variants in indigo
 * 3. Smooth fade-in for each token chunk
 */

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { useInsightStream } from "@/lib/hooks/useInsightStream";
import { useSearchStore } from "@/lib/store/search-store";
import { InsightSkeleton } from "./InsightSkeleton";

interface InsightTextProps {
  personId: string;
  searchId: string;
  enabled: boolean;
  /** Keywords to highlight at title-variant strength (indigo) */
  titleKeywords?: string[];
  /** Keywords to highlight at must-skill strength (amber) */
  skillKeywords?: string[];
  contextData: {
    currentTitle: string;
    currentCompany: string;
    experienceYears: number;
    skills: string[];
    educationStr: string | null;
    summary: string | null;
    ai_insight?: string | null;
  };
}

function parseInsight(textOrObj: string | any): { signal: string; tags: string[] } {
  // If it's already an object (from DB), use it directly
  if (textOrObj && typeof textOrObj === "object") {
    return {
      signal: textOrObj.signal || "",
      tags: Array.isArray(textOrObj.tags) ? textOrObj.tags : []
    };
  }

  // Otherwise, parse it as a string (streaming phase)
  const text = textOrObj as string;
  try {
    const trimmed = text.trim();
    if (!trimmed) return { signal: "", tags: [] };
    
    // List of common conversational prefixes to strip or ignore
    const BOILERPLATE_PREFIXES = [
      "here is the json requested:", 
      "here is the json:", 
      "json requested:", 
      "as requested:",
      "here's the json:",
      "the match signal is:",
      "match signal:"
    ];

    // Find first '{' - we ALWAYS discard anything before the first brace.
    const firstBrace = trimmed.indexOf("{");
    
    if (firstBrace !== -1) {
      const jsonCandidate = trimmed.substring(firstBrace);
      
      // Try full parse if it contains a closing brace
      if (jsonCandidate.includes("}")) {
        try {
          const lastBrace = jsonCandidate.lastIndexOf("}");
          const potentialJson = jsonCandidate.substring(0, lastBrace + 1);
          const parsed = JSON.parse(potentialJson);
          if (parsed.signal !== undefined || Array.isArray(parsed.tags)) {
            return {
              signal: parsed.signal || "",
              tags: Array.isArray(parsed.tags) ? parsed.tags : []
            };
          }
        } catch (e) { /* fall through to regex */ }
      }

      // Regex extraction (handles partial/streaming and malformed JSON)
      const signalMatch = jsonCandidate.match(/"signal":\s*"((?:[^"\\]|\\.)*)"/); // Handle escaped quotes
      const tagsMatch = jsonCandidate.match(/"tags":\s*\[(.*?)\]/);
      
      const signal = signalMatch ? signalMatch[1].replace(/\\"/g, '"') : "";
      const tags = tagsMatch 
        ? tagsMatch[1]
            .split(",")
            .map(t => t.replace(/"/g, "").trim())
            .filter(t => t.length > 0)
        : [];
      
      if (signal || tags.length > 0) {
        return { signal, tags };
      }

      return { signal: "", tags: [] };
    }

    // Fallback: Check if the whole string is just a boilerplate prefix
    const lowerTrimmed = trimmed.toLowerCase();
    if (BOILERPLATE_PREFIXES.some(p => lowerTrimmed.startsWith(p))) {
      return { signal: "", tags: [] };
    }

    // Fallback: If no JSON structure, treat everything after a colon or the whole string as the signal
    if (trimmed.includes("Match Signal:") || trimmed.includes("signal:")) {
      const parts = trimmed.split(/Match Signal:|signal:/i);
      return { signal: parts[parts.length - 1].trim().replace(/^"|"$/g, ""), tags: [] };
    }

  } catch (e) { /* silently fail */ }
  return { signal: (text || "").replace(/^"|"$/g, "").trim(), tags: [] };
}

export function InsightText({
  personId,
  searchId,
  enabled,
  titleKeywords = [],
  skillKeywords = [],
  contextData,
}: InsightTextProps) {
  const updateCandidateInsight = useSearchStore((state) => state.updateCandidateInsight);

  // If ai_insight is a string, it might be polluted or very old. 
  // If it's an object, it's our new structured format.
  const cachedInsight = contextData.ai_insight;
  
  const { insight: streamedInsight, isStreaming, isDone, error } = useInsightStream({
    personId,
    searchId,
    enabled: enabled && !cachedInsight,
    contextData,
    onDone: (final) => updateCandidateInsight(personId, final),
  });

  const insight = cachedInsight || streamedInsight;

  // Not started yet
  if (!enabled) return null;

  // Skeleton while waiting for first tokens
  if (!insight && isStreaming) return <InsightSkeleton />;

  // Error state
  if (error && !insight) return null;

  // Nothing to show
  if (!insight) return null;

  const { signal, tags } = parseInsight(insight);

  return (
    <div className="mt-2.5 pt-2 border-t border-indigo-50/50 flex flex-col gap-2">
      {/* 1. The Hook (Signal) */}
      {signal && (
        <p className="text-[12px] font-semibold text-gray-800 leading-relaxed italic animate-in fade-in duration-500">
          "{signal}"
        </p>
      )}

      {/* 2. The Tags (Pills) */}
      <div className="flex flex-wrap gap-1.5 min-h-[22px]">
        {tags.length > 0 ? (
          tags.map((tag, i) => (
            <div
              key={i}
              className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-50/80 
                         text-indigo-700 border border-indigo-100/50 animate-in fade-in slide-in-from-left-1 duration-300"
            >
              {tag}
            </div>
          ))
        ) : isStreaming ? (
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-2.5 h-2.5 text-indigo-300 animate-pulse" />
            <span className="text-[10px] text-gray-400 font-medium italic">Analyzing profile...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
