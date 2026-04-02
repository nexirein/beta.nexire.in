'use client';

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFilterState } from "@/lib/hooks/useFilterState";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type RankingCriterion = "titles" | "skills" | "location" | "experience";

const LABELS: Record<string, string> = {
  titles: "Titles",
  skills: "Skills",
  location: "Location",
  experience: "Experience",
};

export const RankingPrioritySelector: React.FC = () => {
  const { filters, setFilter } = useFilterState();
  const priority = (filters.ranking_priority && filters.ranking_priority.length === 4) 
    ? (filters.ranking_priority as RankingCriterion[]) 
    : (["titles", "skills", "location", "experience"] as RankingCriterion[]);

  const setRankingPriority = (newPriority: RankingCriterion[]) => {
    setFilter("ranking_priority", newPriority);
  };

  const moveLeft = (index: number) => {
    if (index <= 0) return;
    const newPriority = [...priority];
    [newPriority[index - 1], newPriority[index]] = [newPriority[index], newPriority[index - 1]];
    setRankingPriority(newPriority);
  };

  const moveRight = (index: number) => {
    if (index >= priority.length - 1) return;
    const newPriority = [...priority];
    [newPriority[index + 1], newPriority[index]] = [newPriority[index], newPriority[index + 1]];
    setRankingPriority(newPriority);
  };

  return (
    <div className="space-y-3 w-full max-w-2xl">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-widest px-0.5">Ranking Order</h4>
        <span className="text-[10px] text-slate-400 font-medium italic">Adjust list to prioritize results</span>
      </div>

      <div className="flex items-center gap-2 p-1.5 bg-slate-50/50 rounded-2xl border border-slate-100/80 overflow-x-auto no-scrollbar pb-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {priority.map((id, index) => {
            const isFirst = index === 0;
            const isLast = index === priority.length - 1;

            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 450, damping: 25, mass: 0.8 }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-300 min-w-[130px] shrink-0",
                  isFirst 
                    ? "bg-white border-blue-200 shadow-sm ring-1 ring-blue-50/50" 
                    : "bg-white/80 border-slate-200 shadow-sm"
                )}
              >
                {/* Priority Num */}
                <div className={cn(
                  "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0",
                  isFirst ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"
                )}>
                  {index + 1}
                </div>

                {/* Label */}
                <span className={cn(
                  "text-[12px] font-bold truncate flex-1",
                  isFirst ? "text-slate-900" : "text-slate-600"
                )}>
                  {LABELS[id]}
                </span>

                {/* Controls */}
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={() => moveLeft(index)}
                    disabled={isFirst}
                    className={cn(
                      "p-1 rounded-md transition-all",
                      isFirst ? "text-slate-200 cursor-not-allowed" : "text-slate-400 hover:bg-slate-100 hover:text-blue-600 active:scale-90"
                    )}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveRight(index)}
                    disabled={isLast}
                    className={cn(
                      "p-1 rounded-md transition-all",
                      isLast ? "text-slate-200 cursor-not-allowed" : "text-slate-400 hover:bg-slate-100 hover:text-blue-600 active:scale-90"
                    )}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
