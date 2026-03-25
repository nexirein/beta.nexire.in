<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/reveal.md          ← this module's API contract
-->

# M04 — TASK 01: CANDIDATE PROFILE SLIDEOVER
# Trae: Read CLAUDE.md first.
# The CandidateSlideOver is a right-side panel (460px) that appears when a user
# clicks on any candidate card. It shows full profile + reveal + shortlist actions.
# It's used from BOTH search results AND the shortlist pipeline board.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build CandidateSlideOver component:
- Slides in from the right (460px, dark panel)
- Header: avatar, name, headline, LinkedIn button, close
- Tabs: Overview | Contact | Notes
- Overview: skills, experience timeline (estimated), current role, location
- Contact tab: email reveal + phone reveal + WhatsApp button (all built in M04 tasks 03–05)
- Notes tab: textarea to add recruiter notes (saves to shortlists.notes)
- Shortlist button (bottom sticky): add to project picker

---

## DESIGN SPEC
Panel: fixed right-0 top-0 bottom-0 w-[460px] bg-[#0D0D0D] border-l border-[#222222]
Overlay: bg-black/50 backdrop-blur-sm
Header: bg-[#0D0D0D] border-b border-[#1A1A1A] px-6 py-5
Tabs: pill tab bar (same as ProjectDetailClient)
Bottom bar: bg-[#0D0D0D] border-t border-[#1A1A1A] px-6 py-4 sticky bottom-0

---

## FILE — components/reveal/CandidateSlideOver.tsx

```tsx
"use client";
import { useState, useEffect } from "react";
import {
  X, ExternalLink, MapPin, Briefcase, Building2,
  Mail, Phone, MessageCircle, Star, StickyNote, User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmailRevealButton } from "./EmailRevealButton";
import { PhoneRevealButton } from "./PhoneRevealButton";
import { WhatsAppButton } from "./WhatsAppButton";
import { ShortlistDropdown } from "@/components/search/ShortlistDropdown";

type Tab = "overview" | "contact" | "notes";

interface CandidateSlideOverProps {
  candidate: any | null;
  open: boolean;
  onClose: () => void;
  projects: { id: string; title: string }[];
  onShortlisted?: (candidateId: string, projectId: string) => void;
  onReveal?: (candidateId: string, data: any) => void;
  creditsBalance: number;
  onCreditDeducted: () => void;
}

function Avatar({ name, size = "lg" }: { name: string; size?: "sm" | "lg" }) {
  const initials = (name ?? "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const sz = size === "lg" ? "w-14 h-14 text-lg" : "w-9 h-9 text-sm";
  return (
    <div className={cn("rounded-2xl bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center font-semibold text-white flex-shrink-0", sz)}>
      {initials}
    </div>
  );
}

export function CandidateSlideOver({
  candidate, open, onClose, projects,
  onShortlisted, onReveal, creditsBalance, onCreditDeducted,
}: CandidateSlideOverProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [notes, setNotes] = useState(candidate?.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [localCandidate, setLocalCandidate] = useState(candidate);

  useEffect(() => {
    setLocalCandidate(candidate);
    setNotes(candidate?.notes ?? "");
    setTab("overview");
  }, [candidate]);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleRevealUpdate = (data: { email: string | null; phone: string | null; candidate_id: string }) => {
    setLocalCandidate((prev: any) => ({
      ...prev, ...data, is_revealed: true
    }));
    onReveal?.(data.candidate_id, data);
    onCreditDeducted();
  };

  const saveNotes = async () => {
    if (!localCandidate?.shortlist_id) return;
    setSavingNotes(true);
    const res = await fetch(`/api/shortlist/${localCandidate.shortlist_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSavingNotes(false);
    if (res.ok) toast.success("Notes saved");
    else toast.error("Failed to save notes");
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: User },
    { id: "contact",  label: "Contact",  icon: Mail },
    { id: "notes",    label: "Notes",    icon: StickyNote },
  ];

  if (!open || !localCandidate) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[460px] bg-[#0D0D0D] border-l border-[#222222] flex flex-col shadow-[−20px_0_60px_rgba(0,0,0,0.6)] animate-slide-left overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 border-b border-[#1A1A1A] flex-shrink-0">
          <div className="flex items-start gap-3">
            <Avatar name={localCandidate.full_name} />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-[#FAFAFA] truncate">{localCandidate.full_name}</h2>
              {localCandidate.headline && (
                <p className="text-xs text-[#A0A0A0] mt-0.5 truncate">{localCandidate.headline}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                {localCandidate.location && (
                  <span className="flex items-center gap-1 text-[11px] text-[#555555]">
                    <MapPin className="w-3 h-3" />{localCandidate.location}
                  </span>
                )}
                <a
                  href={localCandidate.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-[#38BDF8] hover:text-[#0EA5E9] transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />LinkedIn
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-[#1A1A1A] flex-shrink-0">
          <div className="flex items-center gap-1 bg-[#111111] border border-[#1A1A1A] rounded-xl p-1 w-fit">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    tab === t.id ? "bg-[#1A1A1A] text-[#FAFAFA]" : "text-[#555555] hover:text-[#A0A0A0]"
                  )}
                >
                  <Icon className="w-3 h-3" />{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Overview Tab */}
          {tab === "overview" && (
            <div className="space-y-5 animate-fade-in">
              {/* Current role */}
              {localCandidate.current_company && (
                <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4">
                  <p className="text-[10px] text-[#555555] uppercase tracking-wider mb-2">Current Role</p>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#555555]" />
                    <div>
                      <p className="text-sm font-medium text-[#FAFAFA]">{localCandidate.current_company}</p>
                      {localCandidate.headline && (
                        <p className="text-xs text-[#555555]">{localCandidate.headline}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Experience */}
              {localCandidate.experience_years !== null && (
                <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4">
                  <p className="text-[10px] text-[#555555] uppercase tracking-wider mb-2">Experience</p>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[#555555]" />
                    <p className="text-sm text-[#FAFAFA]">~{localCandidate.experience_years} years</p>
                    <span className="text-[10px] text-[#333333]">(estimated)</span>
                  </div>
                </div>
              )}
              {/* Skills */}
              {localCandidate.skills?.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#555555] uppercase tracking-wider mb-3">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {localCandidate.skills.map((s: string) => (
                      <span key={s} className="text-xs text-[#A0A0A0] bg-[#111111] border border-[#222222] rounded-lg px-2.5 py-1">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* AI Score */}
              {localCandidate.ai_score !== null && localCandidate.ai_score !== undefined && (
                <div className="bg-[#38BDF8]/5 border border-[#38BDF8]/20 rounded-xl p-4">
                  <p className="text-[10px] text-[#38BDF8] uppercase tracking-wider mb-1">AI Match Score</p>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-[#38BDF8]">{localCandidate.ai_score}</span>
                    <span className="text-xs text-[#555555]">/ 100</span>
                    <div className="flex-1 h-2 bg-[#111111] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] rounded-full"
                        style={{ width: `${localCandidate.ai_score}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact Tab */}
          {tab === "contact" && (
            <div className="space-y-4 animate-fade-in">
              <EmailRevealButton
                candidate={localCandidate}
                creditsBalance={creditsBalance}
                onReveal={handleRevealUpdate}
              />
              <PhoneRevealButton
                candidate={localCandidate}
                creditsBalance={creditsBalance}
                onReveal={handleRevealUpdate}
              />
              {localCandidate.is_revealed && localCandidate.phone && (
                <WhatsAppButton phone={localCandidate.phone} name={localCandidate.full_name} />
              )}
              <p className="text-[11px] text-[#333333] text-center mt-4">
                Contact info sourced via Prospeo · Reveal costs 1 credit
              </p>
            </div>
          )}

          {/* Notes Tab */}
          {tab === "notes" && (
            <div className="animate-fade-in">
              <p className="text-[10px] text-[#555555] uppercase tracking-wider mb-3">Recruiter Notes</p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this candidate — interview status, salary expectation, availability..."
                rows={8}
                className="w-full bg-[#111111] border border-[#333333] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/20 resize-none transition-all"
              />
              <button
                onClick={saveNotes}
                disabled={savingNotes || !localCandidate.shortlist_id}
                className="mt-3 px-4 py-2 bg-[#1A1A1A] border border-[#333333] rounded-xl text-sm text-[#A0A0A0] hover:text-[#FAFAFA] hover:border-[#444444] transition-all disabled:opacity-40"
              >
                {savingNotes ? "Saving..." : "Save notes"}
              </button>
              {!localCandidate.shortlist_id && (
                <p className="text-[11px] text-[#555555] mt-2">Shortlist this candidate to save notes</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom: Shortlist action */}
        <div className="px-6 py-4 border-t border-[#1A1A1A] flex-shrink-0 bg-[#0D0D0D]">
          <div className="relative">
            <button
              onClick={() => setShortlistOpen(!shortlistOpen)}
              disabled={!localCandidate.is_revealed || localCandidate.is_shortlisted}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all",
                localCandidate.is_shortlisted
                  ? "bg-green-400/10 border border-green-400/30 text-green-400 cursor-default"
                  : localCandidate.is_revealed
                  ? "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white hover:from-[#0EA5E9] hover:to-[#0284C7]"
                  : "bg-[#111111] border border-[#222222] text-[#555555] cursor-not-allowed"
              )}
            >
              <Star className={cn("w-4 h-4", localCandidate.is_shortlisted && "fill-current")} />
              {localCandidate.is_shortlisted
                ? "Shortlisted"
                : localCandidate.is_revealed
                ? "Add to project"
                : "Reveal contact first"}
            </button>
            {shortlistOpen && localCandidate.is_revealed && !localCandidate.is_shortlisted && (
              <ShortlistDropdown
                projects={projects}
                candidateId={localCandidate.candidate_id}
                onShortlist={(pId) => {
                  setLocalCandidate((prev: any) => ({ ...prev, is_shortlisted: true, shortlisted_project_id: pId }));
                  setShortlistOpen(false);
                  onShortlisted?.(localCandidate.candidate_id, pId);
                }}
                onClose={() => setShortlistOpen(false)}
              />
            )}
          </div>
        </div>

      </div>
    </>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] Slideover animates in from right (animate-slide-left)
- [ ] ESC key closes the panel
- [ ] Overview tab: current role, experience, skills, AI score bar
- [ ] Contact tab: EmailRevealButton + PhoneRevealButton + WhatsApp (built in 03–05)
- [ ] Notes tab: textarea + save button (calls PATCH /api/shortlist/[id])
- [ ] Shortlist button disabled until is_revealed=true
- [ ] Avatar shows initials gradient, same as CandidateCard
- [ ] Clicking backdrop closes panel

## BUILD LOG ENTRY
## M04-01 Candidate SlideOver — [date]
### File: components/reveal/CandidateSlideOver.tsx
### Status: ✅ Complete
