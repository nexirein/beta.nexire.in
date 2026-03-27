"use client";
/**
 * components/search/InsightSkeleton.tsx
 * Shimmer skeleton shown while AI insight is loading/streaming.
 */

export function InsightSkeleton() {
  return (
    <div className="mt-2.5 pt-2.5 border-t border-gray-100 animate-pulse space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        {/* Sparkle icon placeholder */}
        <div className="w-3 h-3 rounded-sm bg-indigo-100 flex-shrink-0" />
        <div className="w-16 h-2.5 bg-indigo-100 rounded-full" />
      </div>
      <div className="w-full h-2.5 bg-gray-100 rounded-full" />
      <div className="w-[90%] h-2.5 bg-gray-100 rounded-full" />
      <div className="w-[75%] h-2.5 bg-gray-100 rounded-full" />
    </div>
  );
}
