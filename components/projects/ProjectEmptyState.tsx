"use client";

/**
 * components/projects/ProjectEmptyState.tsx
 * Phase 1 — Empty state shown when a project has no searches yet.
 */

import { Plus } from "lucide-react";

interface ProjectEmptyStateProps {
  onNewSearch?: () => void;
}

export function ProjectEmptyState({ onNewSearch }: ProjectEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
      {/* SVG Illustration */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-[#7C3AED]/10 blur-2xl" />
        <svg
          width="80"
          height="80"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative"
        >
          {/* Outer circle */}
          <circle cx="36" cy="36" r="26" stroke="#222222" strokeWidth="3" />
          {/* Inner cross */}
          <line x1="26" y1="36" x2="46" y2="36" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="36" y1="26" x2="36" y2="46" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" />
          {/* Handle */}
          <line x1="55" y1="57" x2="65" y2="67" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
          {/* Small dots */}
          <circle cx="60" cy="14" r="2.5" fill="#1A1A1A" />
          <circle cx="68" cy="30" r="2" fill="#1A1A1A" />
          <circle cx="12" cy="22" r="2" fill="#1A1A1A" />
          <circle cx="18" cy="58" r="2.5" fill="#1A1A1A" />
        </svg>
      </div>

      <div>
        <h3 className="text-lg font-bold text-white">Start your first search</h3>
        <p className="mt-1.5 max-w-xs text-sm text-[#52525B] leading-relaxed">
          Describe who you&apos;re looking for and let Nexire find the best candidates.
        </p>
      </div>

      <button
        onClick={onNewSearch}
        className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition-all hover:bg-[#6d28d9] hover:shadow-[#7C3AED]/40"
      >
        <Plus className="h-4 w-4" />
        New Search
      </button>
    </div>
  );
}
