"use client";

/**
 * components/search/SearchChoiceModal.tsx
 * Phase 4 — Modal shown when "+New Search" is clicked.
 * Lets user choose between Filter Search (manual) or AI/JD Search.
 */

import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, Bot, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectManual: () => void;
  onSelectJD: () => void;
}

export function SearchChoiceModal({ isOpen, onClose, onSelectManual, onSelectJD }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-[#222222] bg-[#111111] p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">New Search</h2>
                <p className="mt-0.5 text-xs text-[#52525B]">Choose how to define your search</p>
              </div>
              <button onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#52525B] hover:bg-[#1A1A1A] hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Filter Search */}
              <button onClick={() => { onClose(); onSelectManual(); }}
                className="group flex flex-col items-center gap-3 rounded-xl border border-[#333333] bg-[#1A1A1A] p-6 text-center transition-all hover:border-[#7C3AED] hover:bg-[#7C3AED]/5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#222222] transition-colors group-hover:bg-[#7C3AED]/20">
                  <SlidersHorizontal className="h-5 w-5 text-[#52525B] group-hover:text-[#A855F7]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Filter Search</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#52525B]">Build your search manually using filters</p>
                </div>
              </button>

              {/* JD Search */}
              <button onClick={() => { onClose(); onSelectJD(); }}
                className="group flex flex-col items-center gap-3 rounded-xl border border-[#333333] bg-[#1A1A1A] p-6 text-center transition-all hover:border-[#7C3AED] hover:bg-[#7C3AED]/5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#222222] transition-colors group-hover:bg-[#7C3AED]/20">
                  <Bot className="h-5 w-5 text-[#52525B] group-hover:text-[#A855F7]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">AI / JD Search</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#52525B]">Paste a JD or describe in plain text</p>
                </div>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
