"use client";

/**
 * components/search/JDSearchModal.tsx
 * Phase 4 — JD/plain text search modal.
 * Calls POST /api/ai/extract-and-resolve → passes result to parent (FilterModal).
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot, Loader2, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import type { ProspeoFilters } from "@/lib/prospeo/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onFiltersExtracted: (filters: ProspeoFilters, meta: unknown) => void;
}

type Mode = "jd" | "quick";

const MAX_CHARS = 4000;

export function JDSearchModal({ isOpen, onClose, onFiltersExtracted }: Props) {
  const [mode, setMode] = useState<Mode>("jd");
  const [text, setText] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("jd_modal_draft") || "";
    }
    return "";
  });
  const [loading, setLoading] = useState(false);

  async function handleExtract() {
    if (text.trim().length < 20) {
      toast.error("Please provide at least 20 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai/extract-and-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "AI extraction failed");
        return;
      }

      onFiltersExtracted(data.filters as ProspeoFilters, data);
      setText("");
      sessionStorage.removeItem("jd_modal_draft");
      onClose();

      const stats = data.stats ?? {};
      toast.success(
        `✨ AI applied ${stats.filtersApplied ?? 0} filters — review before searching`
      );
    } catch {
      toast.error("Network error — please retry");
    } finally {
      setLoading(false);
    }
  }

  const handleTextChange = (val: string) => {
    setText(val);
    sessionStorage.setItem("jd_modal_draft", val);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 w-full max-w-[600px] flex flex-col max-h-[90vh] rounded-2xl border border-[#222222] bg-[#111111] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1A1A1A] px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C3AED]/20">
                  <Bot className="h-4 w-4 text-[#A855F7]" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Search from Job Description</h2>
                  <p className="text-xs text-[#52525B]">AI extracts Prospeo filters from your text</p>
                </div>
              </div>
              <button onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#1A1A1A] hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="flex border-b border-[#1A1A1A] flex-shrink-0">
              {(["jd", "quick"] as Mode[]).map((m) => (
                <button key={m} onClick={() => { setMode(m); handleTextChange(""); }}
                  className={`flex-1 py-3 text-xs font-medium transition-colors ${
                    mode === m ? "border-b-2 border-[#7C3AED] text-[#A855F7]" : "text-[#52525B] hover:text-[#A1A1AA]"
                  }`}>
                  {m === "jd" ? "Full JD" : "Quick Description"}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {mode === "jd" ? (
                <div className="relative">
                  <textarea
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value.slice(0, MAX_CHARS))}
                    disabled={loading}
                    placeholder="Paste your job description here...
                    
e.g. We are looking for a Senior Backend Engineer with 5+ years of experience in Python and AWS. The ideal candidate has worked at a fintech startup (Series A-C) and has led a team of 3+ engineers."
                    className="min-h-[280px] w-full resize-none rounded-xl border border-[#222222] bg-[#0A0A0A] px-4 py-3 text-sm text-white placeholder:text-[#52525B] focus:border-[#7C3AED]/50 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]/20 disabled:opacity-50 overflow-y-auto"
                  />
                  {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-[#0A0A0A]/90 backdrop-blur-sm">
                      <Loader2 className="h-6 w-6 animate-spin text-[#A855F7]" />
                      <p className="mt-2 text-sm font-medium text-white">🤖 Analyzing your job description...</p>
                      <p className="mt-1 text-xs text-[#52525B]">Extracting filters with AI</p>
                    </div>
                  )}
                  <span className="absolute bottom-3 right-3 text-[10px] text-[#52525B]">
                    {text.length} / {MAX_CHARS}
                  </span>
                </div>
              ) : (
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={loading}
                  placeholder="e.g. Senior Python developer at fintech startup in Bangalore 5+ years"
                  className="w-full rounded-xl border border-[#222222] bg-[#0A0A0A] px-4 py-3 text-sm text-white placeholder:text-[#52525B] focus:border-[#7C3AED]/50 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]/20 disabled:opacity-50"
                />
              )}

              {/* AI info pill */}
              <div className="mt-3 flex items-center gap-2 text-xs text-[#52525B]">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#7C3AED]/10 px-2.5 py-1 text-[#A855F7]">
                  ✨ gpt-4o-mini
                </span>
                <span>Extracts job title, location, seniority, tech stack, industry, experience — then opens the Filter Modal for review</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[#1A1A1A] px-6 py-4">
              <button onClick={onClose} disabled={loading}
                className="rounded-xl border border-[#222222] px-4 py-2 text-sm font-medium text-[#52525B] hover:border-[#333333] hover:text-[#A1A1AA] transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleExtract} disabled={loading || text.trim().length < 20}
                className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition-all hover:bg-[#6d28d9] disabled:opacity-50">
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Extracting...</>
                ) : (
                  <>Extract &amp; Apply Filters <ChevronRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
