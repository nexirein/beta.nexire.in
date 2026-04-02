"use client";
/**
 * components/search/InsightText.tsx
 *
 * Renders AI insight in the new structured diagnostic format (v2).
 *
 * Parses labeled lines:
 *   [Match]    → skill match ratio + highlighted skills
 *   [Exp]      → experience context
 *   [Strengths]→ key strengths
 *   [Gaps]     → missing skills / gaps
 *   [Verdict]  → Strong Fit | Good Fit | Moderate Fit | Weak Fit
 *
 * Falls back to plain-text rendering for old-format cached insights.
 */

import { Sparkles } from "lucide-react";
import { useInsightStream } from "@/lib/hooks/useInsightStream";
import { useSearchStore } from "@/lib/store/search-store";
import { InsightSkeleton } from "./InsightSkeleton";

interface InsightTextProps {
  personId: string;
  searchId: string;
  enabled: boolean;
  contextData: {
    currentTitle: string;
    currentCompany: string;
    experienceYears: number;
    skills: string[];
    educationStr: string | null;
    summary: string | null;
    ai_insight?: string | null;
    companyType?: string | null;
    industry?: string | null;
  };
}

// ── Structured insight line types ─────────────────────────────────────────────
interface ParsedInsight {
  match: string | null;
  exp: string | null;
  strengths: string | null;
  gaps: string | null;
  verdict: string | null;
}

function parseStructuredInsight(raw: string): ParsedInsight | null {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: ParsedInsight = {
    match: null,
    exp: null,
    strengths: null,
    gaps: null,
    verdict: null,
  };

  let found = 0;
  for (const line of lines) {
    if (/^\[Match\]/i.test(line)) {
      result.match = line.replace(/^\[Match\]\s*→?\s*/i, "").trim();
      found++;
    } else if (/^\[Exp\]/i.test(line)) {
      result.exp = line.replace(/^\[Exp\]\s*→?\s*/i, "").trim();
      found++;
    } else if (/^\[Strengths?\]/i.test(line)) {
      result.strengths = line.replace(/^\[Strengths?\]\s*→?\s*/i, "").trim();
      found++;
    } else if (/^\[Gaps?\]/i.test(line)) {
      result.gaps = line.replace(/^\[Gaps?\]\s*→?\s*/i, "").trim();
      found++;
    } else if (/^\[Verdict\]/i.test(line)) {
      result.verdict = line.replace(/^\[Verdict\]\s*→?\s*/i, "").trim();
      found++;
    }
  }

  // Need at least 3 sections to treat as structured
  return found >= 3 ? result : null;
}

// ── Verdict styling ─────────────────────────────────────────────────────────
function getVerdictStyle(verdict: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  const v = verdict.toLowerCase();
  if (v.includes("strong"))
    return {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      dot: "bg-emerald-500",
    };
  if (v.includes("good"))
    return {
      bg: "bg-indigo-50",
      text: "text-indigo-700",
      border: "border-indigo-200",
      dot: "bg-indigo-500",
    };
  if (v.includes("moderate"))
    return {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      dot: "bg-amber-400",
    };
  return {
    bg: "bg-gray-50",
    text: "text-gray-500",
    border: "border-gray-200",
    dot: "bg-gray-400",
  };
}

// ── Backtick highlight renderer ───────────────────────────────────────────────
function HighlightedText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`)/);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          const content = part.slice(1, -1);
          return (
            <span
              key={i}
              className="bg-gray-100 text-gray-900 font-semibold rounded px-1 py-0.5 not-italic whitespace-nowrap text-[11px]"
            >
              {content}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ── Structured insight renderer ───────────────────────────────────────────────
function StructuredInsight({ parsed }: { parsed: ParsedInsight }) {
  const verdictStyle = parsed.verdict
    ? getVerdictStyle(parsed.verdict)
    : null;

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50/80 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-500">
            Profile Analysis
          </span>
        </div>
      </div>

      {/* Body rows */}
      <div className="px-3 py-2.5 space-y-1.5">
        {/* Match row -> Skills */}
        {parsed.match && (
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 min-w-[48px] pt-0.5 flex-shrink-0">
              Skills
            </span>
            <HighlightedText
              text={parsed.match}
              className="text-[11.5px] text-gray-700 leading-snug"
            />
          </div>
        )}

        {/* Experience row -> Experience */}
        {parsed.exp && (
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 min-w-[48px] pt-0.5 flex-shrink-0">
              Exp
            </span>
            <HighlightedText
              text={parsed.exp}
              className="text-[11.5px] text-gray-700 leading-snug"
            />
          </div>
        )}

        {/* Strengths row -> Highlights */}
        {parsed.strengths && (
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 min-w-[48px] pt-0.5 flex-shrink-0">
              Bonus
            </span>
            <HighlightedText
              text={parsed.strengths}
              className="text-[11.5px] text-gray-700 leading-snug"
            />
          </div>
        )}

        {/* Gaps row -> Missing */}
        {parsed.gaps &&
          !parsed.gaps.toLowerCase().includes("no critical") && (
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 min-w-[48px] pt-0.5 flex-shrink-0">
                Miss
              </span>
              <HighlightedText
                text={parsed.gaps}
                className="text-[11.5px] text-gray-600 leading-snug"
              />
            </div>
          )}
      </div>
    </div>
  );
}

// ── Plain-text fallback (old format) ─────────────────────────────────────────
function extractPlainText(raw: string | any): string {
  if (!raw) return "";
  if (typeof raw === "object") {
    return (raw.signal || "").replace(/^"|"$/g, "").trim();
  }
  const text = (raw as string).trim();
  if (!text) return "";
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.signal) return parsed.signal.replace(/^"|"$/g, "").trim();
    } catch {
      const m = text.match(/"signal":\s*"((?:[^"\\]|\\.)*)"/);
      if (m) return m[1].replace(/\\"/g, '"').trim();
    }
  }
  return text.replace(/^"|"$/g, "").trim();
}

function PlainInsight({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <div className="mt-2 flex flex-col gap-1.5 animate-in fade-in duration-300">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Match Analysis
        </span>
      </div>
      <p className="text-[12.5px] leading-[1.6] text-gray-500 pl-0.5">
        {parts.map((part, i) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            const content = part.slice(1, -1);
            return (
              <span
                key={i}
                className="bg-gray-100 text-gray-900 font-semibold rounded px-1 py-0.5 not-italic whitespace-nowrap"
              >
                {content}
              </span>
            );
          }
          return <span key={i}>{part.replace(/^"|"$/g, "")}</span>;
        })}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function InsightText({
  personId,
  searchId,
  enabled,
  contextData,
}: InsightTextProps) {
  const updateCandidateInsight = useSearchStore(
    (state) => state.updateCandidateInsight
  );

  const cachedInsight = contextData.ai_insight;

  const {
    insight: streamedInsight,
    isStreaming,
    error,
  } = useInsightStream({
    personId,
    searchId,
    enabled: enabled && !cachedInsight,
    contextData,
    onDone: (final) => updateCandidateInsight(personId, final),
  });

  const rawInsight = cachedInsight || streamedInsight;

  if (!enabled) return null;
  if (!rawInsight && isStreaming) return <InsightSkeleton />;
  if (error && !rawInsight) return null;
  if (!rawInsight) return null;

  const plainText =
    typeof rawInsight === "string" ? rawInsight : extractPlainText(rawInsight);
  if (!plainText) return null;

  // Try structured parse first
  const parsed = parseStructuredInsight(plainText);
  if (parsed) {
    return <StructuredInsight parsed={parsed} />;
  }

  // Fallback to old plain-text format
  const fallback = extractPlainText(rawInsight);
  if (!fallback) return null;
  return <PlainInsight text={fallback} />;
}
