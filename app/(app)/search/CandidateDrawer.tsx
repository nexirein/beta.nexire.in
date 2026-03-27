"use client";
// nexire-app — app/(app)/search/CandidateDrawer.tsx
// Full-viewport right-side drawer for candidate Quick Preview.
// Overlays the ENTIRE dashboard (Sidebar + Topbar + content) via fixed z-50.
// Left side dims but stays fully readable — no blur.

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
          {/* Backdrop — dims dashboard but NO blur so left content stays readable */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(15, 22, 41, 0.38)" }}
            onClick={onClose}
          />

          {/* Drawer panel — slides in from right, sits above full dashboard */}
          <motion.div
            key="drawer-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.85 }}
            className="fixed right-0 top-0 h-full bg-white border-l border-gray-100 z-50 flex flex-col transition-all"
            style={{
              width: "min(560px, 45vw)",
              boxShadow: "-8px 0 40px rgba(0,0,0,0.08)",
            }}
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
