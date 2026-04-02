"use client";
// nexire-app — app/(app)/search/CandidateDrawer.tsx
// Full-viewport right-side drawer for candidate Quick Preview.
// Can be used either as part of a flex split layout or as a fixed overlay.

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { CandidateProfilePanel } from "./CandidateProfilePanel";
import type { ScoredCandidate } from "@/lib/ai/scorer";
import { cn } from "@/lib/utils";

interface CandidateDrawerProps {
  candidate: ScoredCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onSequenceEnroll?: (candidate: ScoredCandidate) => void;
  onRevealSuccess?: (personId: string, type: "email" | "phone", data: unknown) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  isOverlay?: boolean;
}

export function CandidateDrawer({
  candidate,
  isOpen,
  onClose,
  onSequenceEnroll,
  onRevealSuccess,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  isOverlay = false,
}: CandidateDrawerProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowUp" && hasPrev && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowDown" && hasNext && onNext) { e.preventDefault(); onNext(); }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [isOpen, onClose, hasPrev, hasNext, onPrev, onNext]);

  return (
    <AnimatePresence>
      {isOpen && candidate && (
        <>
          {/* Sidebar panel — either split view or fixed overlay */}
          <motion.div
            key="drawer-panel"
            initial={isOverlay ? { x: "100%", opacity: 0.5 } : { opacity: 0 }}
            animate={isOverlay ? { x: 0, opacity: 1 } : { opacity: 1 }}
            exit={isOverlay ? { x: "100%", opacity: 0 } : { opacity: 0 }}
            transition={{ duration: isOverlay ? 0.3 : 0.15, ease: isOverlay ? [0.16, 1, 0.3, 1] : "easeInOut" }}
            className={cn(
              "h-full bg-white flex flex-col min-w-0",
              isOverlay 
                ? "fixed top-0 right-0 w-[55%] xl:w-[50%] max-w-[900px] z-50 shadow-2xl border-l border-gray-200"
                : "flex-1"
            )}
            onClick={e => e.stopPropagation()}
          >
            {/* ── Top control bar ───────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  title="Previous candidate (↑)"
                  className="p-1.5 rounded-lg disabled:opacity-30 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  title="Next candidate (↓)"
                  className="p-1.5 rounded-lg disabled:opacity-30 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-gray-400 font-medium ml-1 select-none">
                  Press ↑↓ to navigate
                </span>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Scrollable profile content ───────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={candidate.person_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
                  className="h-full"
                >
                  <CandidateProfilePanel
                    candidate={candidate}
                    onSequenceEnroll={onSequenceEnroll}
                    onRevealSuccess={onRevealSuccess}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
