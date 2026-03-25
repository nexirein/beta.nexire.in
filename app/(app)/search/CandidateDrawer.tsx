"use client";
// nexire-app — app/(app)/search/CandidateDrawer.tsx
// Slide-in right drawer for candidate profile. Opens on candidate row click.
// Inspired by Juicebox's profile side panel — but distinctly Nexire-branded.

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { CandidateProfilePanel } from "./CandidateProfilePanel";
import type { ScoredCandidate } from "@/lib/ai/scorer";

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
}: CandidateDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" && hasPrev && onPrev) onPrev();
      if (e.key === "ArrowDown" && hasNext && onNext) onNext();
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
          {/* Backdrop — dims list but stays transparent so results are visible */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer-panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
            className="fixed right-0 top-0 h-full w-[500px] max-w-[95vw] bg-[var(--bg-elevated)] border-l border-[var(--border-default)] z-50 flex flex-col shadow-2xl"
            style={{ boxShadow: "-8px 0 40px rgba(0,0,0,0.4)" }}
          >
            {/* Drawer top control bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
              <div className="flex items-center gap-2">
                {/* Prev / Next nav */}
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  title="Previous candidate (↑)"
                  className="p-1.5 rounded-lg disabled:opacity-30 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  title="Next candidate (↓)"
                  className="p-1.5 rounded-lg disabled:opacity-30 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-[var(--text-tertiary)] font-mono ml-1">
                  Press ↑↓ to navigate
                </span>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable profile content */}
            <div className="flex-1 overflow-y-auto hide-scrollbar">
              <AnimatePresence mode="wait">
                <motion.div
                  key={candidate.person_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
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
