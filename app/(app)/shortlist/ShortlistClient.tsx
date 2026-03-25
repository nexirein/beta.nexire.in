"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Star, MapPin, Building, Briefcase, Trash2, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { CandidateDrawer } from "@/app/(app)/search/CandidateDrawer";
import type { ScoredCandidate } from "@/lib/ai/scorer";

function timeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

export function ShortlistClient() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedCandidate, setSelectedCandidate] = useState<ScoredCandidate | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    fetchData(page);
  }, [page]);

  async function fetchData(p: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/shortlist?page=${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      toast.error("Failed to load shortlist");
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(id: string, e: React.MouseEvent) {
    // Prevent triggering the row click
    e.stopPropagation();
    try {
       const res = await fetch(`/api/shortlist?id=${id}`, { method: "DELETE" });
       if (!res.ok) throw new Error();
       setEntries(prev => prev.filter(x => x.id !== id));
       setTotal(t => t - 1);
       toast.success("Removed from shortlist");
    } catch {
       toast.error("Failed to remove candidate");
    }
  }

  const openDrawer = (entry: any) => {
    // Map existing candidate record back to the shape of ScoredCandidate for the drawer
    const cand: ScoredCandidate = {
       ...entry.candidates,
       candidate_id: entry.candidates.id,
       raw_crustdata_json: entry.candidates.raw_json,
    };
    setSelectedCandidate(cand);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] text-gray-900 border-l border-gray-100/60 overflow-y-auto">
      {/* HEADER */}
      <div className="px-10 py-8 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100/50 shadow-sm">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900 leading-none">Shortlisted</h1>
            <p className="text-[13.5px] text-gray-500 font-medium mt-1.5 flex items-center gap-2">
              Viewing saved candidates <span className="w-1 h-1 rounded-full bg-gray-300" /> {loading ? "-" : total} profiles
            </p>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 p-10 max-w-[1200px] mx-auto w-full">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-64">
             <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center max-w-sm mx-auto">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
              <Star className="w-6 h-6 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No profiles shortlisted yet</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              When you find a candidate you like in the search results, click "Shortlist" on their profile to save them here for later review.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {entries.map((entry) => {
              const c = entry.candidates;
              const savedAt = new Date(entry.created_at);
              const initials = c.full_name?.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("") || "?";

              return (
                <div 
                  key={entry.id} 
                  onClick={() => openDrawer(entry)}
                  className="group bg-white border border-gray-200 hover:border-indigo-300 rounded-xl p-5 flex items-start gap-5 cursor-pointer transition-all hover:shadow-md hover:shadow-indigo-500/5"
                >
                  <div className="relative">
                    {c.profile_pic_url ? (
                      <img src={c.profile_pic_url} alt={c.full_name} className="w-14 h-14 rounded-full object-cover border-2 border-gray-100" />
                    ) : (
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-700 font-bold rounded-full flex items-center justify-center border-2 border-indigo-100">
                        {initials}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 className="text-[16px] font-bold text-gray-900 leading-tight group-hover:text-indigo-700 transition-colors">
                      {c.full_name}
                    </h4>
                    
                    <div className="mt-1.5 flex items-center gap-3 text-[13px] font-medium text-gray-600 flex-wrap">
                      <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-gray-400" />{c.current_title || "Unknown Title"}</span>
                      {c.current_company && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-gray-300" />
                          <span className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5 text-gray-400" />{c.current_company}</span>
                        </>
                      )}
                      {c.location && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-gray-300" />
                          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" />{c.location}</span>
                        </>
                      )}
                    </div>

                    <p className="mt-2.5 text-[11px] font-mono text-gray-400">
                      Saved {timeAgo(savedAt)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => removeEntry(entry.id, e)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from shortlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="mt-auto px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[11px] font-bold rounded-lg flex items-center gap-1">
                      View Profile <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-gray-100">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 border border-gray-200 rounded-lg font-semibold text-[13px] text-gray-700 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-[13px] font-medium text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 border border-gray-200 rounded-lg font-semibold text-[13px] text-gray-700 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <CandidateDrawer
        candidate={selectedCandidate}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
}
