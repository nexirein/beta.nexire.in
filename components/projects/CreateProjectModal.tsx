"use client";

/**
 * components/projects/CreateProjectModal.tsx
 * Modal for creating a new project — Phase 1 deliverable.
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Folder, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: { id: string; title: string }) => void;
}

export function CreateProjectModal({ open, onClose, onCreated }: CreateProjectModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setTitle("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create project");
        return;
      }

      onCreated?.(data.project);
      onClose();
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-md pointer-events-auto"
            >
            <div className="rounded-2xl border border-[#222222] bg-[#111111] shadow-2xl shadow-black/60">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#1A1A1A] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7C3AED]/20">
                    <Folder className="h-4 w-4 text-[#A855F7]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">Create Project</h2>
                    <p className="text-xs text-[#52525B]">Organise searches and shortlists</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#52525B] transition-colors hover:bg-[#1A1A1A] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                    Project Name <span className="text-[#EF4444]">*</span>
                  </label>
                  <input
                    ref={inputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Backend Engineer — Q2"
                    maxLength={100}
                    required
                    className="w-full rounded-xl border border-[#222222] bg-[#0A0A0A] px-4 py-2.5 text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#7C3AED]/50 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                    Description <span className="text-[#52525B]">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief context about this role or hiring requirement…"
                    rows={3}
                    maxLength={500}
                    className="w-full resize-none rounded-xl border border-[#222222] bg-[#0A0A0A] px-4 py-2.5 text-sm text-white placeholder:text-[#52525B] transition-colors focus:border-[#7C3AED]/50 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
                  />
                </div>

                {error && (
                  <p className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
                    {error}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-[#222222] bg-transparent px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-colors hover:border-[#333333] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !title.trim()}
                    className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/25 transition-all hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
                    ) : (
                      "Create Project"
                    )}
                  </button>
                </div>
              </form>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
