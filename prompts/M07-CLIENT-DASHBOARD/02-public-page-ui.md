<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/client-dashboard.md ← this module's API contract
-->

# M07 — TASK 02: PUBLIC PAGE UI
# Trae: Read CLAUDE.md first.
# The public client page (/c/[token]) is what the client sees.
# NO login required. It is branded with Nexire + recruiter org name.
# Shows shortlisted candidates in a clean card grid.
# Candidates can be clicked to expand profile inline.
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build the full public client page:
1. /c/[token] — password gate → candidate grid
2. PasswordGate component — for password-protected links
3. ClientPageShell — header (branding, project name, candidate count)
4. CandidateClientCard — public-safe card (no internal data)
5. CandidateExpandPanel — slide-in panel when a card is clicked
6. GET /api/share/[token]/candidates — returns shortlisted candidates (filtered by show_* settings)

---

## FILE 1 — app/c/[token]/page.tsx  (public route — no auth)

```tsx
import { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { ClientPageShell } from "./ClientPageShell";
import { PasswordGatedClient } from "./PasswordGatedClient";

interface Props { params: { token: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServiceClient();
  const { data: link } = await supabase
    .from("share_links")
    .select("title, client_name")
    .eq("token", params.token)
    .single();

  return {
    title: link?.title ? `${link.title} | Nexire` : "Candidate Shortlist | Nexire",
    description: "Review shortlisted candidates",
    robots: "noindex, nofollow",
  };
}

export default async function ClientPublicPage({ params }: Props) {
  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from("share_links")
    .select("id, token, title, client_name, is_active, expires_at, password_hash, show_contact, show_linkedin, show_notes, project_id, org_id")
    .eq("token", params.token)
    .single();

  // If not found or revoked
  if (!link || !link.is_active) {
    return <LinkErrorPage code="NOT_FOUND" />;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <LinkErrorPage code="EXPIRED" />;
  }

  // If password protected, show gate on client — pass hasPassword flag
  if (link.password_hash) {
    return (
      <PasswordGatedClient
        token={params.token}
        linkTitle={link.title ?? "Candidate Shortlist"}
        clientName={link.client_name}
      />
    );
  }

  // No password — show page directly
  return (
    <ClientPageShell
      token={params.token}
      link={link}
    />
  );
}

// ── Inline error pages ─────────────────────────────────────
function LinkErrorPage({ code }: { code: "NOT_FOUND" | "EXPIRED" }) {
  const msgs = {
    NOT_FOUND: { emoji: "🔗", title: "Link not found", body: "This link may have been revoked or doesn't exist." },
    EXPIRED:   { emoji: "⏰", title: "Link expired",   body: "This share link has expired. Ask your recruiter for an updated link." },
  };
  const msg = msgs[code];
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">{msg.emoji}</div>
        <h1 className="text-xl font-bold text-[#FAFAFA] mb-2">{msg.title}</h1>
        <p className="text-sm text-[#555555]">{msg.body}</p>
        <a href="https://nexire.in" className="mt-6 inline-block text-xs text-[#38BDF8] hover:underline">
          Powered by Nexire
        </a>
      </div>
    </div>
  );
}
```

---

## FILE 2 — app/c/[token]/PasswordGatedClient.tsx  (client component for password gate)

```tsx
"use client";
import { useState } from "react";
import { Shield, Eye, EyeOff } from "lucide-react";
import { ClientPageShell } from "./ClientPageShell";

interface Props {
  token:      string;
  linkTitle:  string;
  clientName: string | null;
}

export function PasswordGatedClient({ token, linkTitle, clientName }: Props) {
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [error, setError]         = useState("");
  const [checking, setChecking]   = useState(false);
  const [link, setLink]           = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setChecking(true);
    const res  = await fetch(`/api/share/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setChecking(false);
    if (!res.ok) {
      setError(data.code === "WRONG_PASSWORD" ? "Incorrect password" : data.error);
      return;
    }
    // Fetch full link data
    const lr  = await fetch(`/api/share/${token}/public-link`);
    const ld  = await lr.json();
    setLink(ld.link);
  };

  if (link) return <ClientPageShell token={token} link={link} />;

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-8 max-w-sm w-full">
        <div className="w-12 h-12 rounded-2xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center mx-auto mb-5">
          <Shield className="w-6 h-6 text-[#38BDF8]" />
        </div>
        <h1 className="text-lg font-bold text-[#FAFAFA] text-center mb-1">{linkTitle}</h1>
        {clientName && (
          <p className="text-sm text-[#555555] text-center mb-5">Hi, {clientName.split(" ")[0]} 👋</p>
        )}
        <p className="text-xs text-[#555555] text-center mb-5">
          This shortlist is password protected. Enter the password to view the candidates.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-[#0A0A0A] border border-[#333333] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555555] hover:text-[#A0A0A0]"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-[#EF4444]">{error}</p>}
          <button
            type="submit"
            disabled={!password || checking}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-white text-sm font-medium disabled:opacity-50 transition-all hover:from-[#0EA5E9] hover:to-[#0284C7]"
          >
            {checking ? "Verifying..." : "View candidates"}
          </button>
        </form>
        <p className="text-[10px] text-[#333333] text-center mt-4">Powered by Nexire</p>
      </div>
    </div>
  );
}
```

---

## FILE 3 — app/c/[token]/ClientPageShell.tsx  (main candidate grid)

```tsx
"use client";
import { useState, useEffect } from "react";
import { Users, ChevronDown, ChevronUp, Search } from "lucide-react";
import { CandidateClientCard } from "./CandidateClientCard";
import { CandidateExpandPanel } from "./CandidateExpandPanel";

interface ClientCandidate {
  shortlist_id:    string;
  full_name:       string;
  headline?:       string;
  current_company?:string;
  current_title?:  string;
  location?:       string;
  experience_years?:number;
  skills?:         string[];
  summary?:        string;
  linkedin_url?:   string;
  email?:          string;   // only if show_contact = true
  phone?:          string;   // only if show_contact = true
  stage:           string;
  rating?:         number | null;
  notes?:          string | null;  // only if show_notes = true
  client_status?:  string | null;  // thumbs up/down set by client
}

interface LinkData {
  token:        string;
  title:        string | null;
  client_name:  string | null;
  show_contact: boolean;
  show_linkedin:boolean;
  show_notes:   boolean;
  project_id:   string;
}

interface Props { token: string; link: LinkData; }

export function ClientPageShell({ token, link }: Props) {
  const [candidates, setCandidates]   = useState<ClientCandidate[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<ClientCandidate | null>(null);
  const [query, setQuery]             = useState("");

  useEffect(() => {
    fetch(`/api/share/${token}/candidates`)
      .then(r => r.json())
      .then(d => { setCandidates(d.candidates ?? []); setLoading(false); })
      .catch(() => setLoading(false));

    // Track view
    fetch(`/api/share/${token}/view`, { method: "POST" });
  }, [token]);

  const filtered = candidates.filter(c =>
    !query || `${c.full_name} ${c.current_company} ${c.current_title}`.toLowerCase().includes(query.toLowerCase())
  );

  const handleStatusUpdate = (shortlistId: string, status: string) => {
    setCandidates(prev => prev.map(c =>
      c.shortlist_id === shortlistId ? { ...c, client_status: status } : c
    ));
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Nav */}
      <header className="border-b border-[#1A1A1A] bg-[#0D0D0D] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Nexire logo mark */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center">
              <span className="text-white font-black text-xs">N</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#FAFAFA]">
                {link.title ?? "Candidate Shortlist"}
              </p>
              {link.client_name && (
                <p className="text-[10px] text-[#555555]">Shared with {link.client_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111111] border border-[#222222]">
              <Users className="w-3.5 h-3.5 text-[#555555]" />
              <span className="text-xs text-[#A0A0A0]">{candidates.length} candidates</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8">
        {/* Search bar */}
        {candidates.length > 4 && (
          <div className="relative mb-6 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter candidates..."
              className="w-full bg-[#111111] border border-[#222222] rounded-xl pl-8 pr-3 py-2 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all"
            />
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5 h-52 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-[#222222] mx-auto mb-3" />
            <p className="text-sm text-[#555555]">No candidates found</p>
          </div>
        )}

        {/* Candidate grid */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(candidate => (
              <CandidateClientCard
                key={candidate.shortlist_id}
                candidate={candidate}
                showContact={link.show_contact}
                showLinkedIn={link.show_linkedin}
                token={token}
                onClick={() => setSelected(candidate)}
                onStatusUpdate={handleStatusUpdate}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-[11px] text-[#333333]">
            Powered by{" "}
            <a href="https://nexire.in" target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">
              Nexire
            </a>
            {" "}· AI-powered recruiting
          </p>
        </div>
      </main>

      {/* Expand panel */}
      {selected && (
        <CandidateExpandPanel
          candidate={selected}
          showContact={link.show_contact}
          showLinkedIn={link.show_linkedin}
          showNotes={link.show_notes}
          token={token}
          onClose={() => setSelected(null)}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  );
}
```

---

## FILE 4 — app/c/[token]/CandidateClientCard.tsx

```tsx
"use client";
import { useState } from "react";
import { ExternalLink, Mail, Phone, ThumbsUp, ThumbsDown, Star, MapPin, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  candidate:      any;
  showContact:    boolean;
  showLinkedIn:   boolean;
  token:          string;
  onClick:        () => void;
  onStatusUpdate: (id: string, status: string) => void;
}

export function CandidateClientCard({ candidate, showContact, showLinkedIn, token, onClick, onStatusUpdate }: Props) {
  const [voting, setVoting] = useState(false);

  const initials = (candidate.full_name ?? "??")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  const vote = async (e: React.MouseEvent, status: "approved" | "rejected") => {
    e.stopPropagation();
    if (voting) return;
    setVoting(true);
    const newStatus = candidate.client_status === status ? null : status;
    await fetch(`/api/share/${token}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortlist_id: candidate.shortlist_id, status: newStatus }),
    });
    onStatusUpdate(candidate.shortlist_id, newStatus ?? "");
    setVoting(false);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-[#111111] border rounded-2xl p-5 cursor-pointer transition-all group relative overflow-hidden",
        candidate.client_status === "approved"
          ? "border-green-400/30 bg-green-400/5"
          : candidate.client_status === "rejected"
            ? "border-red-400/20 bg-red-400/5 opacity-60"
            : "border-[#1A1A1A] hover:border-[#333333]"
      )}
    >
      {/* Top-left status ribbon */}
      {candidate.client_status === "approved" && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-400/20 flex items-center justify-center">
          <ThumbsUp className="w-3 h-3 text-green-400 fill-green-400" />
        </div>
      )}

      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-glow-blue-sm">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#FAFAFA] truncate">{candidate.full_name}</p>
          {candidate.current_title && (
            <p className="text-xs text-[#555555] truncate">{candidate.current_title}</p>
          )}
        </div>
      </div>

      {/* Company */}
      {candidate.current_company && (
        <div className="flex items-center gap-1.5 mb-2">
          <Briefcase className="w-3 h-3 text-[#555555] flex-shrink-0" />
          <p className="text-xs text-[#A0A0A0] truncate">{candidate.current_company}</p>
        </div>
      )}

      {/* Location + Experience */}
      <div className="flex items-center gap-3 mb-3">
        {candidate.location && (
          <div className="flex items-center gap-1 text-[11px] text-[#555555]">
            <MapPin className="w-2.5 h-2.5" />
            <span className="truncate">{candidate.location}</span>
          </div>
        )}
        {candidate.experience_years && (
          <span className="text-[11px] text-[#555555]">{candidate.experience_years}y exp</span>
        )}
      </div>

      {/* Skills */}
      {candidate.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {candidate.skills.slice(0, 3).map((s: string) => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] text-[#555555] border border-[#222222]">
              {s}
            </span>
          ))}
          {candidate.skills.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] text-[#555555] border border-[#222222]">
              +{candidate.skills.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Rating stars */}
      {candidate.rating && (
        <div className="flex gap-0.5 mb-3">
          {[1,2,3,4,5].map(n => (
            <Star key={n} className={cn("w-3 h-3", n <= candidate.rating ? "text-yellow-400 fill-yellow-400" : "text-[#222222]")} />
          ))}
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between pt-3 border-t border-[#1A1A1A] mt-auto">
        <div className="flex items-center gap-2">
          {showContact && candidate.email && (
            <a href={`mailto:${candidate.email}`} onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-[#1A1A1A] text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all">
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          {showContact && candidate.phone && (
            <a href={`tel:${candidate.phone}`} onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-[#1A1A1A] text-[#555555] hover:text-green-400 hover:bg-green-400/10 transition-all">
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          {showLinkedIn && candidate.linkedin_url && (
            <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-[#1A1A1A] text-[#555555] hover:text-[#38BDF8] hover:bg-[#38BDF8]/10 transition-all">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Approve / Reject buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={e => vote(e, "approved")}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              candidate.client_status === "approved"
                ? "bg-green-400/20 text-green-400"
                : "bg-[#1A1A1A] text-[#555555] hover:bg-green-400/10 hover:text-green-400"
            )}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => vote(e, "rejected")}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              candidate.client_status === "rejected"
                ? "bg-red-400/20 text-red-400"
                : "bg-[#1A1A1A] text-[#555555] hover:bg-red-400/10 hover:text-red-400"
            )}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## FILE 5 — app/c/[token]/CandidateExpandPanel.tsx  (slide-in detail view)

```tsx
"use client";
import { useEffect, useState } from "react";
import {
  X, ExternalLink, Mail, Phone, MapPin, Briefcase,
  Star, ThumbsUp, ThumbsDown, MessageSquare, GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  candidate:       any;
  showContact:     boolean;
  showLinkedIn:    boolean;
  showNotes:       boolean;
  token:           string;
  onClose:         () => void;
  onStatusUpdate:  (id: string, status: string) => void;
}

export function CandidateExpandPanel({
  candidate, showContact, showLinkedIn, showNotes, token, onClose, onStatusUpdate,
}: Props) {
  const [comment, setComment]   = useState("");
  const [submitting, setSub]    = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [localStatus, setLocalStatus] = useState(candidate.client_status ?? "");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const vote = async (status: "approved" | "rejected") => {
    const newStatus = localStatus === status ? "" : status;
    setLocalStatus(newStatus);
    onStatusUpdate(candidate.shortlist_id, newStatus);
    await fetch(`/api/share/${token}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortlist_id: candidate.shortlist_id, status: newStatus || null }),
    });
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSub(true);
    await fetch(`/api/share/${token}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortlist_id: candidate.shortlist_id, comment }),
    });
    setSub(false);
    setSubmitted(true);
    setComment("");
  };

  const initials = (candidate.full_name ?? "??")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-[#0D0D0D] border-l border-[#1A1A1A] z-30 shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">

        {/* Header */}
        <div className="px-5 py-5 border-b border-[#1A1A1A] flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] flex items-center justify-center text-white font-bold shadow-glow-blue-sm">
                {initials}
              </div>
              <div>
                <h2 className="text-base font-bold text-[#FAFAFA]">{candidate.full_name}</h2>
                {candidate.current_title && (
                  <p className="text-sm text-[#555555]">{candidate.current_title}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#555555] hover:text-[#A0A0A0] hover:bg-[#1A1A1A] transition-all mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Quick info */}
          <div className="space-y-2.5">
            {candidate.current_company && (
              <div className="flex items-center gap-2.5 text-sm text-[#A0A0A0]">
                <Briefcase className="w-4 h-4 text-[#555555] flex-shrink-0" />
                <span>{candidate.current_company}</span>
              </div>
            )}
            {candidate.location && (
              <div className="flex items-center gap-2.5 text-sm text-[#A0A0A0]">
                <MapPin className="w-4 h-4 text-[#555555] flex-shrink-0" />
                <span>{candidate.location}</span>
              </div>
            )}
            {candidate.experience_years && (
              <div className="flex items-center gap-2.5 text-sm text-[#A0A0A0]">
                <GraduationCap className="w-4 h-4 text-[#555555] flex-shrink-0" />
                <span>{candidate.experience_years} years experience</span>
              </div>
            )}
          </div>

          {/* Contact (if show_contact = true) */}
          {showContact && (candidate.email || candidate.phone) && (
            <div className="space-y-2">
              <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Contact</p>
              {candidate.email && (
                <a href={`mailto:${candidate.email}`} className="flex items-center gap-2.5 text-sm text-[#38BDF8] hover:underline">
                  <Mail className="w-4 h-4" /> {candidate.email}
                </a>
              )}
              {candidate.phone && (
                <a href={`tel:${candidate.phone}`} className="flex items-center gap-2.5 text-sm text-[#A0A0A0] hover:text-[#FAFAFA]">
                  <Phone className="w-4 h-4 text-[#555555]" /> {candidate.phone}
                </a>
              )}
            </div>
          )}

          {/* LinkedIn */}
          {showLinkedIn && candidate.linkedin_url && (
            <a
              href={candidate.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111111] border border-[#222222] text-sm text-[#38BDF8] hover:border-[#38BDF8]/40 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              View LinkedIn profile
            </a>
          )}

          {/* Summary */}
          {candidate.summary && (
            <div>
              <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium mb-2">About</p>
              <p className="text-sm text-[#A0A0A0] leading-relaxed">{candidate.summary}</p>
            </div>
          )}

          {/* Skills */}
          {candidate.skills?.length > 0 && (
            <div>
              <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map((s: string) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-xl bg-[#111111] border border-[#222222] text-[#A0A0A0]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recruiter notes (if show_notes = true) */}
          {showNotes && candidate.notes && (
            <div>
              <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium mb-2">Recruiter notes</p>
              <div className="bg-[#111111] border border-[#222222] rounded-xl px-4 py-3 text-sm text-[#A0A0A0] leading-relaxed">
                {candidate.notes}
              </div>
            </div>
          )}

          {/* Approval + Comment */}
          <div className="space-y-3">
            <p className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">Your feedback</p>
            <div className="flex gap-3">
              <button
                onClick={() => vote("approved")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                  localStatus === "approved"
                    ? "bg-green-400/10 border-green-400/30 text-green-400"
                    : "bg-[#111111] border-[#222222] text-[#555555] hover:border-green-400/30 hover:text-green-400"
                )}
              >
                <ThumbsUp className={cn("w-4 h-4", localStatus === "approved" && "fill-green-400")} />
                Approve
              </button>
              <button
                onClick={() => vote("rejected")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                  localStatus === "rejected"
                    ? "bg-red-400/10 border-red-400/30 text-red-400"
                    : "bg-[#111111] border-[#222222] text-[#555555] hover:border-red-400/30 hover:text-red-400"
                )}
              >
                <ThumbsDown className={cn("w-4 h-4", localStatus === "rejected" && "fill-red-400")} />
                Pass
              </button>
            </div>

            {/* Comment box */}
            {!submitted ? (
              <div className="space-y-2">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Leave a comment for the recruiter (optional)..."
                  rows={3}
                  className="w-full bg-[#111111] border border-[#222222] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 resize-none transition-all"
                />
                <button
                  onClick={submitComment}
                  disabled={!comment.trim() || submitting}
                  className="w-full py-2.5 rounded-xl border border-[#222222] text-sm text-[#A0A0A0] hover:text-[#FAFAFA] hover:border-[#333333] disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {submitting ? "Sending..." : "Send comment"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-green-400 py-2">
                <span>✓</span> Comment sent to recruiter
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
```

---

## FILE 6 — app/api/share/[token]/candidates/route.ts  (public endpoint)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from("share_links")
    .select("id, project_id, is_active, expires_at, show_contact, show_linkedin, show_notes")
    .eq("token", params.token)
    .single();

  if (!link || !link.is_active) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const { data: shortlists } = await supabase
    .from("shortlists")
    .select(`
      id, stage, rating, notes,
      client_status,
      candidates:candidate_id (
        id, full_name, headline, current_title, current_company,
        location, experience_years, skills, summary, linkedin_url,
        email, phone
      )
    `)
    .eq("project_id", link.project_id)
    .neq("stage", "rejected")
    .neq("is_archived", true)
    .order("created_at");

  const candidates = (shortlists ?? []).map((s: any) => {
    const c = s.candidates ?? {};
    return {
      shortlist_id:     s.id,
      full_name:        c.full_name,
      headline:         c.headline,
      current_title:    c.current_title,
      current_company:  c.current_company,
      location:         c.location,
      experience_years: c.experience_years,
      skills:           c.skills ?? [],
      summary:          c.summary,
      linkedin_url:     link.show_linkedin ? c.linkedin_url : undefined,
      email:            link.show_contact  ? c.email         : undefined,
      phone:            link.show_contact  ? c.phone         : undefined,
      stage:            s.stage,
      rating:           s.rating,
      notes:            link.show_notes    ? s.notes         : undefined,
      client_status:    s.client_status,
    };
  });

  return NextResponse.json({ candidates });
}
```

---

## TAILWIND: add slide-in-right animation
```typescript
// tailwind.config.ts keyframes + animation:
"slide-in-right": {
  from: { transform: "translateX(100%)" },
  to:   { transform: "translateX(0)" },
},
// animation:
"slide-in-right": "slide-in-right 0.2s ease-out",
```

---

## COMPLETION CHECKLIST
- [ ] /c/[token] page: password gate → candidate grid
- [ ] PasswordGatedClient: shows shield icon, verify via API, shows grid on success
- [ ] ClientPageShell: header with project title + count, search filter
- [ ] CandidateClientCard: avatar, company, skills pills, star rating, approve/reject buttons
- [ ] Approved card: green border, thumbs-up overlay
- [ ] Rejected card: grey out (60% opacity)
- [ ] CandidateExpandPanel: full profile, contact (if show_contact), LinkedIn, notes (if show_notes)
- [ ] Feedback (approve/reject) persists via POST /api/share/[token]/feedback
- [ ] Comment box in panel: sends to recruiter, shows "sent" confirmation
- [ ] GET /api/share/[token]/candidates: filters contact/notes based on show_* flags
- [ ] Page view tracked via POST /api/share/[token]/view
- [ ] robots: noindex, nofollow metadata set
- [ ] slide-in-right animation added to tailwind.config.ts

## BUILD LOG ENTRY
## M07-02 Public Page UI — [date]
### Files: /c/[token] page, PasswordGatedClient, ClientPageShell, CandidateClientCard, CandidateExpandPanel, candidates API
### Status: ✅ Complete
