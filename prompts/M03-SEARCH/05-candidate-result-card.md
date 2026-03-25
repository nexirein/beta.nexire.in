<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/search.md          ← this module's API contract
-->

# M03 — TASK 05: CANDIDATE RESULT CARD (Blurred + Reveal States)
# Trae: Read CLAUDE.md first. This is the most important UI component in Nexire.
# Every search result renders as a CandidateCard. It has 3 states:
# 1. LOCKED — contact info blurred, "Reveal" button shows credit cost
# 2. REVEALING — spinner, credit deduction in progress
# 3. REVEALED — full name, email, phone visible, shortlist button active
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build CandidateCard component used in search results:
- Shows: name (blurred until revealed), title, company, location, experience, skills chips
- LinkedIn URL always visible (it is public)
- Email + Phone: blurred text with "Reveal for 1 credit" overlay
- On reveal: calls POST /api/reveal, deducts 1 credit, shows real contact info
- Shortlist button: adds to a project (dropdown project picker)
- Already-revealed cards show full info instantly (cached in DB)
- Already-shortlisted badge shown if candidate exists in any project

---

## DESIGN SPEC
Card: bg-[#111111] border border-[#222222] rounded-2xl p-5
Revealed border: border-[#38BDF8]/30 (subtle blue glow)
Blurred text: blur-sm select-none text-[#555555] pointer-events-none
Reveal button: small, gradient, pill shape
Skills chips: bg-[#1A1A1A] text-[#A0A0A0] rounded-lg text-xs px-2 py-0.5
Avatar: initials circle, gradient bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9]
Experience badge: bg-[#1A1A1A] text-[#A0A0A0] text-xs

---

## FILE 1 — components/search/CandidateCard.tsx

```tsx
"use client";
import { useState } from "react";
import { ExternalLink, Eye, Loader2, Plus, Check, MapPin, Briefcase, Building2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ShortlistDropdown } from "./ShortlistDropdown";

export type CandidateResult = {
  prospeo_id: string;          // LinkedIn profile key from Prospeo
  full_name: string;           // always visible
  headline: string | null;     // title from LinkedIn
  current_company: string | null;
  location: string | null;
  experience_years: number | null;
  skills: string[];
  linkedin_url: string;
  // Reveal state
  is_revealed: boolean;
  email: string | null;
  phone: string | null;
  // Shortlist state
  is_shortlisted: boolean;
  shortlisted_project_id: string | null;
  // DB candidate id (set after reveal)
  candidate_id: string | null;
};

interface CandidateCardProps {
  candidate: CandidateResult;
  onReveal: (prospeoId: string, result: { email: string | null; phone: string | null; candidate_id: string }) => void;
  onShortlist: (candidateId: string, projectId: string) => void;
  projects: { id: string; title: string }[];
  creditsBalance: number;
  onCreditDeducted: () => void;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold">
      {initials}
    </div>
  );
}

export function CandidateCard({
  candidate,
  onReveal,
  onShortlist,
  projects,
  creditsBalance,
  onCreditDeducted,
}: CandidateCardProps) {
  const [revealing, setRevealing] = useState(false);
  const [localRevealed, setLocalRevealed] = useState(candidate.is_revealed);
  const [localEmail, setLocalEmail] = useState(candidate.email);
  const [localPhone, setLocalPhone] = useState(candidate.phone);
  const [localCandidateId, setLocalCandidateId] = useState(candidate.candidate_id);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [localShortlisted, setLocalShortlisted] = useState(candidate.is_shortlisted);

  const handleReveal = async () => {
    if (revealing) return;
    if (creditsBalance < 1) {
      toast.error("Not enough credits. Top up to reveal contact info.", {
        action: { label: "Top up", onClick: () => window.location.href = "/billing" },
      });
      return;
    }

    setRevealing(true);
    try {
      const res = await fetch("/api/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_url: candidate.linkedin_url, prospeo_id: candidate.prospeo_id }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 402) {
          toast.error("Not enough credits.");
        } else if (data.error === "NO_CONTACT_FOUND") {
          toast.error("No contact info found for this profile.", { description: "No credit was deducted." });
        } else {
          toast.error(data.error ?? "Reveal failed");
        }
        return;
      }

      setLocalEmail(data.email);
      setLocalPhone(data.phone);
      setLocalRevealed(true);
      setLocalCandidateId(data.candidate_id);
      onReveal(candidate.prospeo_id, { email: data.email, phone: data.phone, candidate_id: data.candidate_id });
      onCreditDeducted();
      toast.success("Contact revealed!", { description: data.email ?? data.phone ?? "LinkedIn profile saved" });
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setRevealing(false);
    }
  };

  const handleShortlisted = (projectId: string) => {
    setLocalShortlisted(true);
    setShortlistOpen(false);
    if (localCandidateId) onShortlist(localCandidateId, projectId);
  };

  const displaySkills = candidate.skills?.slice(0, 5) ?? [];
  const extraSkills = (candidate.skills?.length ?? 0) - 5;

  return (
    <div className={cn(
      "bg-[#111111] border rounded-2xl p-5 transition-all duration-300 group",
      localRevealed
        ? "border-[#38BDF8]/20 hover:border-[#38BDF8]/40"
        : "border-[#222222] hover:border-[#333333]"
    )}>
      {/* Top row: Avatar + Name + Title */}
      <div className="flex items-start gap-3 mb-4">
        <Avatar name={candidate.full_name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[#FAFAFA] truncate">
              {candidate.full_name}
            </h3>
            {localRevealed && (
              <span className="flex items-center gap-1 text-[10px] text-[#38BDF8] bg-[#38BDF8]/10 px-1.5 py-0.5 rounded-md font-medium">
                <Check className="w-2.5 h-2.5" /> Revealed
              </span>
            )}
            {localShortlisted && (
              <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-md font-medium">
                <Star className="w-2.5 h-2.5" fill="currentColor" /> Shortlisted
              </span>
            )}
          </div>
          {candidate.headline && (
            <p className="text-xs text-[#A0A0A0] mt-0.5 truncate">{candidate.headline}</p>
          )}
        </div>

        {/* LinkedIn */}
        <a
          href={candidate.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 p-1.5 rounded-lg text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all"
          title="View LinkedIn"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Meta chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {candidate.current_company && (
          <span className="flex items-center gap-1.5 text-[11px] text-[#555555] bg-[#1A1A1A] rounded-lg px-2.5 py-1">
            <Building2 className="w-3 h-3" /> {candidate.current_company}
          </span>
        )}
        {candidate.location && (
          <span className="flex items-center gap-1.5 text-[11px] text-[#555555] bg-[#1A1A1A] rounded-lg px-2.5 py-1">
            <MapPin className="w-3 h-3" /> {candidate.location}
          </span>
        )}
        {candidate.experience_years !== null && (
          <span className="flex items-center gap-1.5 text-[11px] text-[#555555] bg-[#1A1A1A] rounded-lg px-2.5 py-1">
            <Briefcase className="w-3 h-3" /> {candidate.experience_years}y exp
          </span>
        )}
      </div>

      {/* Skills */}
      {displaySkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {displaySkills.map(skill => (
            <span key={skill} className="text-[11px] text-[#A0A0A0] bg-[#1A1A1A] border border-[#222222] rounded-lg px-2 py-0.5">
              {skill}
            </span>
          ))}
          {extraSkills > 0 && (
            <span className="text-[11px] text-[#555555] bg-[#1A1A1A] rounded-lg px-2 py-0.5">
              +{extraSkills} more
            </span>
          )}
        </div>
      )}

      {/* Contact info row */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-[#0A0A0A] rounded-xl border border-[#1A1A1A]">
        {localRevealed ? (
          <div className="flex-1 space-y-1">
            {localEmail && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#555555] w-10">Email</span>
                <a href={`mailto:${localEmail}`} className="text-xs text-[#38BDF8] hover:underline truncate">
                  {localEmail}
                </a>
              </div>
            )}
            {localPhone && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#555555] w-10">Phone</span>
                <a href={`tel:${localPhone}`} className="text-xs text-[#FAFAFA] hover:underline">
                  {localPhone}
                </a>
              </div>
            )}
            {!localEmail && !localPhone && (
              <p className="text-xs text-[#555555]">No contact info found for this profile</p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between w-full gap-3">
            {/* Blurred placeholder */}
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#555555] w-10">Email</span>
                <span className="text-xs text-[#555555] blur-sm select-none">
                  ████████@████████.com
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#555555] w-10">Phone</span>
                <span className="text-xs text-[#555555] blur-sm select-none">
                  +91 ████ ████ ████
                </span>
              </div>
            </div>

            {/* Reveal CTA */}
            <button
              onClick={handleReveal}
              disabled={revealing}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-shrink-0",
                revealing
                  ? "bg-[#1A1A1A] text-[#555555] cursor-not-allowed"
                  : "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white hover:from-[#0EA5E9] hover:to-[#0284C7] shadow-glow-blue-sm"
              )}
            >
              {revealing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              {revealing ? "Revealing..." : "Reveal · 1 credit"}
            </button>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setShortlistOpen(!shortlistOpen)}
            disabled={localShortlisted || !localRevealed}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all",
              localShortlisted
                ? "border-green-400/30 text-green-400 bg-green-400/5 cursor-default"
                : localRevealed
                ? "border-[#333333] text-[#A0A0A0] hover:border-[#38BDF8]/40 hover:text-[#38BDF8] hover:bg-[#38BDF8]/5"
                : "border-[#1A1A1A] text-[#333333] cursor-not-allowed"
            )}
            title={!localRevealed ? "Reveal contact first" : undefined}
          >
            {localShortlisted ? (
              <><Check className="w-3.5 h-3.5" /> Shortlisted</>
            ) : (
              <><Plus className="w-3.5 h-3.5" /> Add to project</>
            )}
          </button>

          {shortlistOpen && localRevealed && !localShortlisted && (
            <ShortlistDropdown
              projects={projects}
              candidateId={localCandidateId!}
              onShortlist={handleShortlisted}
              onClose={() => setShortlistOpen(false)}
            />
          )}
        </div>

        <span className="text-[10px] text-[#333333]">via LinkedIn</span>
      </div>
    </div>
  );
}
```

---

## FILE 2 — components/search/ShortlistDropdown.tsx

```tsx
"use client";
import { useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

interface ShortlistDropdownProps {
  projects: { id: string; title: string }[];
  candidateId: string;
  onShortlist: (projectId: string) => void;
  onClose: () => void;
}

export function ShortlistDropdown({ projects, candidateId, onShortlist, onClose }: ShortlistDropdownProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleSelect = async (projectId: string) => {
    setLoading(projectId);
    try {
      const res = await fetch("/api/shortlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId, project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Shortlist failed");
      toast.success("Added to project!");
      onShortlist(projectId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(null);
    }
  };

  if (projects.length === 0) {
    return (
      <div ref={ref} className="absolute bottom-full left-0 mb-2 bg-[#1A1A1A] border border-[#333333] rounded-xl p-4 shadow-xl z-20 w-56 text-center">
        <p className="text-xs text-[#555555]">No active projects</p>
        <a href="/projects?new=true" className="text-xs text-[#38BDF8] hover:underline mt-1 block">
          Create a project first →
        </a>
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 bg-[#1A1A1A] border border-[#333333] rounded-xl shadow-xl z-20 w-60 overflow-hidden animate-slide-up">
      <p className="text-[10px] text-[#555555] font-medium uppercase tracking-wider px-3 py-2.5 border-b border-[#222222]">
        Select project
      </p>
      {projects.map(project => (
        <button
          key={project.id}
          onClick={() => handleSelect(project.id)}
          disabled={!!loading}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#A0A0A0] hover:bg-[#222222] hover:text-[#FAFAFA] transition-all disabled:opacity-50"
        >
          {loading === project.id ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#38BDF8]" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-[#555555]" />
          )}
          <span className="truncate">{project.title}</span>
        </button>
      ))}
    </div>
  );
}
```

---

## FILE 3 — components/search/CandidateCardSkeleton.tsx

```tsx
export function CandidateCardSkeleton() {
  return (
    <div className="bg-[#111111] border border-[#222222] rounded-2xl p-5 animate-pulse">
      {/* Top row */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#1A1A1A]" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-[#1A1A1A] rounded-lg w-2/3" />
          <div className="h-3 bg-[#1A1A1A] rounded-lg w-1/2" />
        </div>
      </div>
      {/* Meta chips */}
      <div className="flex gap-2 mb-4">
        <div className="h-6 bg-[#1A1A1A] rounded-lg w-28" />
        <div className="h-6 bg-[#1A1A1A] rounded-lg w-20" />
        <div className="h-6 bg-[#1A1A1A] rounded-lg w-16" />
      </div>
      {/* Skills */}
      <div className="flex gap-1.5 mb-4">
        {[60, 80, 50, 70].map(w => (
          <div key={w} className="h-5 bg-[#1A1A1A] rounded-lg" style={{ width: w }} />
        ))}
      </div>
      {/* Contact box */}
      <div className="h-16 bg-[#0A0A0A] rounded-xl border border-[#1A1A1A] mb-4" />
      {/* Footer */}
      <div className="h-8 bg-[#1A1A1A] rounded-xl w-32" />
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] CandidateCard.tsx — 3 states: locked (blur), revealing (spinner), revealed (email+phone)
- [ ] Reveal button disabled + toast when credits < 1
- [ ] NO_CONTACT_FOUND error: toast says "No credit deducted"
- [ ] ShortlistDropdown shows projects list, calls POST /api/shortlist
- [ ] "Add to project" disabled until contact is revealed
- [ ] Already revealed cards show "Revealed" badge immediately
- [ ] Already shortlisted cards show "Shortlisted" badge + green border
- [ ] CandidateCardSkeleton used while search is loading
- [ ] LinkedIn link always visible (opens new tab)

## BUILD LOG ENTRY
## M03-05 Candidate Result Card — [date]
### Files: CandidateCard.tsx, ShortlistDropdown.tsx, CandidateCardSkeleton.tsx
### States: locked blur → revealing spinner → revealed email/phone
### Status: ✅ Complete
