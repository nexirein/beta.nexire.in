// nexire-app — app/(app)/search/EnrollSequenceModal.tsx
import { useState, useEffect } from "react";
import { X, Send, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ScoredCandidate } from "@/lib/ai/scorer";

export function EnrollSequenceModal({ candidate, onClose }: { candidate: ScoredCandidate; onClose: () => void }) {
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetch("/api/sequences")
      .then(r => r.json())
      .then(d => setSequences(d.sequences?.filter((s: any) => s.status === "active") || []))
      .catch(() => toast.error("Failed to load sequences"))
      .finally(() => setLoading(false));
  }, []);

  async function handleEnroll(sequenceId: string) {
    setEnrolling(true);
    try {
      const res = await fetch("/api/sequences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidate.candidate_id,
          sequence_id: sequenceId
        })
      });
      if (!res.ok) throw new Error();
      toast.success(`Added ${candidate.full_name} to sequence!`);
      onClose();
    } catch {
      toast.error("Failed to add to sequence.");
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex py-10 justify-center items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--surface)] max-h-full overflow-hidden flex flex-col rounded-2xl border border-[var(--border)] shadow-2xl animate-fade-in mx-4">
        
        <div className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-raised)]">
          <div>
            <h2 className="text-lg font-bold">Add to Sequence</h2>
            <p className="text-xs text-[var(--muted)]">{candidate.full_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface)] rounded-lg text-[var(--muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" /></div>
          ) : sequences.length === 0 ? (
            <div className="text-center py-8">
              <Send className="w-8 h-8 text-[var(--muted)] mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium mb-1">No active sequences</p>
              <p className="text-xs text-[var(--muted)] mb-4">You need an active sequence to enroll candidates.</p>
              <a href="/sequences" className="text-sm text-brand-400 hover:underline">Go to Sequences to create one →</a>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">Active Sequences</label>
              {sequences.map(seq => (
                <button
                  key={seq.id}
                  onClick={() => handleEnroll(seq.id)}
                  disabled={enrolling}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-brand-500/50 hover:bg-brand-500/5 transition-all text-left disabled:opacity-50"
                >
                  <div>
                    <div className="font-medium text-sm">{seq.name}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">{seq.step_count} step{seq.step_count !== 1 && "s"}</div>
                  </div>
                  <Plus className="w-4 h-4 text-[var(--muted)]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
