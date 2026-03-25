"use client";
// nexire-app — app/(app)/sequences/SequencesClient.tsx
// Sequences list + create modal.

import { useState, useEffect, useCallback } from "react";
import { Plus, Send, PlayCircle, PlusCircle, Trash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Sequence {
  id: string;
  name: string;
  status: string;
  created_at: string;
  step_count: number;
  stats: { active: number; completed: number; bounced: number; total: number };
}

export function SequencesClient() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sequences");
      const data = await res.json();
      setSequences(data.sequences ?? []);
    } catch { toast.error("Failed to load sequences"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  return (
    <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Sequences</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Automate outreach with multi-step email drips.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> New Sequence
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="card h-48 animate-pulse bg-[var(--surface-raised)]" />)}
        </div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--border)] rounded-2xl bg-[var(--surface)]">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
            <Send className="w-8 h-8 text-brand-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No sequences yet</h2>
          <p className="text-[var(--muted)] text-sm max-w-sm mb-6">Create your first automated email campaign to reach out to candidates in bulk.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium">
            <Plus className="w-4 h-4" /> Create Sequence
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sequences.map(seq => (
            <div key={seq.id} className="card flex flex-col group relative">
              <div className="flex items-start justify-between mb-4">
                <span className={cn(
                  "badge text-xs font-bold uppercase tracking-wider",
                  seq.status === "active" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                  seq.status === "paused" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                  "bg-[var(--surface-raised)] text-[var(--muted)] border border-[var(--border)]"
                )}>
                  {seq.status}
                </span>
                <span className="text-xs font-medium text-[var(--muted)] bg-[var(--surface-raised)] px-2 py-0.5 rounded-md">
                  {seq.step_count} step{seq.step_count !== 1 && "s"}
                </span>
              </div>
              <h3 className="font-bold text-lg text-[var(--foreground)] mb-1 truncate pr-8">{seq.name}</h3>
              
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-[var(--border)]">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider mb-0.5">Active</span>
                  <span className="text-base font-bold text-brand-400">{seq.stats.active}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider mb-0.5">Finished</span>
                  <span className="text-base font-bold text-emerald-400">{seq.stats.completed}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider mb-0.5">Total</span>
                  <span className="text-base font-bold text-[var(--foreground)]">{seq.stats.total}</span>
                </div>
              </div>
              
              {/* Abs/Hover overlay to view detail */}
              <a href={`/sequences/${seq.id}`} className="absolute inset-0 z-10 before:absolute before:inset-0 before:bg-brand-500/5 before:opacity-0 group-hover:before:opacity-100 before:transition-opacity rounded-2xl" />
            </div>
          ))}
        </div>
      )}

      {showModal && <CreateSequenceModal onClose={() => setShowModal(false)} onCreated={fetchSequences} />}
    </div>
  );
}

function CreateSequenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([{ step: 1, delay_days: 0, subject: "Opportunities at {{company}}", body: "Hi {{first_name}},\n\nSaw your profile and thought you'd be a great fit for a role I'm working on.\n\nBest,\n[Your Name]" }]);
  const [loading, setLoading] = useState(false);

  function addStep() {
    setSteps(s => [...s, { step: s.length + 1, delay_days: 3, subject: "Re: Opportunities at {{company}}", body: "Hi {{first_name}},\n\nJust bumping this up." }]);
  }

  function removeStep(idx: number) {
    if (steps.length === 1) return;
    setSteps(s => s.filter((_, i) => i !== idx).map((st, i) => ({ ...st, step: i + 1 })));
  }

  function updateStep(idx: number, field: string, val: any) {
    setSteps(s => s.map((st, i) => i === idx ? { ...st, [field]: field === "delay_days" ? parseInt(val) || 0 : val } : st));
  }

  async function handleSubmit() {
    if (!name.trim() || steps.some(s => !s.subject.trim() || !s.body.trim())) {
      toast.error("Please fill all fields"); return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), steps_json: steps }),
      });
      if (!res.ok) throw new Error();
      toast.success("Sequence created");
      onCreated();
      onClose();
    } catch { toast.error("Failed to create sequence"); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex py-10 justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[var(--surface)] max-h-full overflow-hidden flex flex-col rounded-2xl border border-[var(--border)] shadow-2xl animate-fade-in mx-4">
        <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">New Sequence</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">Use {"{{first_name}}"}, {"{{company}}"}, {"{{role}}"} tags</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface)] rounded-lg text-[var(--muted)] hover:text-red-400"><Trash className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 block">Sequence Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q3 Sr Frontend React" className="w-full bg-[var(--background)] border rounded-xl px-3 py-2.5 text-sm" autoFocus />
          </div>

          <div className="space-y-4">
            {steps.map((st, i) => (
              <div key={i} className="relative border border-[var(--border)] rounded-xl p-4 bg-[var(--surface-raised)]/30">
                <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-brand-500 border-2 border-[var(--surface)] text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                {i > 0 && (
                  <button onClick={() => removeStep(i)} className="absolute top-3 right-3 p-1.5 hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400 rounded-lg">
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                )}
                
                <div className="flex gap-4 mb-3 items-end">
                  <div className="w-24">
                    <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 block">Delay (Days)</label>
                    <input type="number" min="0" value={st.delay_days} onChange={e => updateStep(i, "delay_days", e.target.value)} disabled={i === 0} className="w-full bg-[var(--background)] border rounded-lg px-2.5 py-1.5 text-sm disabled:opacity-50" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 block">Subject</label>
                    <input value={st.subject} onChange={e => updateStep(i, "subject", e.target.value)} placeholder="Subject line" className="w-full bg-[var(--background)] border rounded-lg px-2.5 py-1.5 text-sm font-medium" />
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1 block">Body</label>
                  <textarea value={st.body} onChange={e => updateStep(i, "body", e.target.value)} rows={4} className="w-full bg-[var(--background)] border rounded-lg px-3 py-2 text-sm resize-none" placeholder="Email body..." />
                </div>
              </div>
            ))}
          </div>

          <button onClick={addStep} className="w-full py-3 border border-dashed border-[var(--border)] rounded-xl text-brand-400 text-sm font-medium hover:bg-brand-500/5 transition-colors flex items-center justify-center gap-2">
            <PlusCircle className="w-4 h-4" /> Add Step
          </button>
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface)] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">Cancel</button>
          <button onClick={handleSubmit} disabled={loading || !name} className="btn-primary px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} Create Sequence
          </button>
        </div>
      </div>
    </div>
  );
}
