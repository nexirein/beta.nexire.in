"use client";
// nexire-app — app/(app)/search/CandidateCard.tsx
// Individual candidate result card with inline reveal functionality.
// Email reveal = 1 credit, Phone reveal = 8 credits.
// Re-reveal is free — handled by server-side cache check.

import { useState } from "react";
import { MapPin, Briefcase, Clock, ExternalLink, Star, Send, Mail, Phone, Loader2, CheckCircle2, Smartphone, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ScoredCandidate } from "@/lib/ai/scorer";
import { sanitizeTitle } from "@/lib/utils/sanitizeTitle";

interface CandidateCardProps {
  candidate: ScoredCandidate;
  onReveal?: (personId: string, type: "email" | "phone", result: { email?: string; phone?: string; credits_remaining: number }) => void;
  onSequenceEnroll?: (candidate: ScoredCandidate) => void;
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
  if (score >= 65) return "text-brand-400 bg-brand-400/10 border-brand-400/20";
  if (score >= 50) return "text-amber-400 bg-amber-400/10 border-amber-400/20";
  return "text-[var(--muted)] bg-[var(--surface-raised)] border-[var(--border)]";
}

export function CandidateCard({ candidate, onReveal, onSequenceEnroll }: CandidateCardProps) {
  const {
    person_id, full_name, headline, current_company, location_city, location_country,
    skills, linkedin_url, ai_score, match_label,
    notice_label, current_title, open_to_work, ai_reason,
  } = candidate;

  const [emailLoading, setEmailLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [revealedEmail, setRevealedEmail] = useState<string | null>(candidate.email);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(candidate.phone);

  // Build location display string
  const locationStr = location_city
    ? location_city + (location_country ? `, ${location_country}` : "")
    : location_country ?? null;

  // Prioritize chips: Notable Companies > Skills
  const notableCompanies = (candidate.raw_crustdata_json as any)?.current_employers?.[0]?.company_headcount_latest > 200 ? [current_company] : [];
  const displayChips = [
    ...(notableCompanies.filter(Boolean) as string[]),
    ...skills.filter(s => s.toLowerCase() !== "any")
  ].slice(0, 8);

  const displayTitle = sanitizeTitle(current_title || headline);

  async function handleRevealEmail() {
    if (revealedEmail || emailLoading || !linkedin_url) return;
    setEmailLoading(true);
    try {
      const res = await fetch("/api/reveal/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id,
          linkedin_url,
          candidate_id: candidate.candidate_id,
          full_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(`Insufficient credits — need 1 credit, have ${data.balance}`);
        } else {
          toast.error(data.message ?? "Email reveal failed");
        }
        return;
      }
      if (data.email) {
        setRevealedEmail(data.email);
        onReveal?.(person_id, "email", { email: data.email, credits_remaining: data.credits_remaining });
        if (data.fromCache) {
          toast.success("Email retrieved (free — already in your database!)");
        } else {
          toast.success(`Email revealed — ${data.credits_remaining} credits remaining`);
        }
      } else {
        toast.info("No email found for this candidate");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleRevealPhone() {
    if (revealedPhone || phoneLoading || !linkedin_url) return;
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/reveal/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id,
          linkedin_url,
          candidate_id: candidate.candidate_id,
          full_name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast.error(`Insufficient credits — need 8 credits, have ${data.balance}`);
        } else {
          toast.error(data.message ?? "Phone reveal failed");
        }
        return;
      }
      if (data.phone) {
        setRevealedPhone(data.phone);
        if (data.email && !revealedEmail) setRevealedEmail(data.email);
        onReveal?.(person_id, "phone", { phone: data.phone, email: data.email, credits_remaining: data.credits_remaining });
        if (data.fromCache) {
          toast.success("Phone retrieved (free — already in your database!)");
        } else {
          toast.success(`Phone revealed — ${data.credits_remaining} credits remaining`);
        }
      } else {
        toast.info("No phone number found for this candidate");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setPhoneLoading(false);
    }
  }

  return (
    <div className="card-hover group">
      <div className="flex items-start justify-between gap-4">
        {/* Left: info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[var(--foreground)] truncate flex items-center gap-1.5">
              {full_name}
              {open_to_work && (
                <div className="group/tooltip relative">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse cursor-help" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-black/90 text-[10px] text-white rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 z-50">
                    Actively open to work
                  </div>
                </div>
              )}
            </h3>
            {(revealedEmail || revealedPhone) && (
              <span className="badge bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                <CheckCircle2 className="w-3 h-3" /> Revealed
              </span>
            )}
          </div>

          {/* Current position */}
          {displayTitle && (
            <p className="text-sm text-[var(--muted)] truncate mt-0.5">
              {displayTitle}
            </p>
          )}

          {/* Match reason tags — sourced from ai_reason score breakdown */}
          {ai_reason && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {ai_reason.split(" • ").map((reason) => (
                <span
                  key={reason}
                  className="text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400/80 font-medium tracking-wide"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[var(--muted)]">
            {current_company && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3 flex-shrink-0" />
                {current_company}
              </span>
            )}
            {locationStr && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {locationStr}
              </span>
            )}
            {notice_label && (
              <span className="flex items-center gap-1 text-amber-400/80">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span title="Estimated notice period">{notice_label}</span>
              </span>
            )}
          </div>

          {/* Chips (Prioritized) */}
          {displayChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {displayChips.map((chip, idx) => {
                const isCompany = idx < notableCompanies.length;
                return (
                  <span
                    key={chip}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md border",
                      isCompany 
                        ? "bg-brand-500/10 text-brand-400 border-brand-500/20 font-semibold"
                        : "bg-[var(--surface-raised)] text-[var(--muted)] border-[var(--border)]"
                    )}
                  >
                    {chip}
                  </span>
                );
              })}
              {skills.length > (8 - notableCompanies.length) && (
                <span className="text-[11px] px-2 py-0.5 text-[var(--muted)]">
                  +{skills.length - (8 - notableCompanies.length)}
                </span>
              )}
            </div>
          )}

          {/* Revealed contact info */}
          {(revealedEmail || revealedPhone) && (
            <div className="flex flex-col gap-1 mt-3 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              {revealedEmail && (
                <a
                  href={`mailto:${revealedEmail}`}
                  className="flex items-center gap-2 text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors"
                >
                  <Mail className="w-3 h-3 flex-shrink-0" />
                  {revealedEmail}
                </a>
              )}
              {revealedPhone && (
                <a
                  href={`tel:${revealedPhone}`}
                  className="flex items-center gap-2 text-xs text-emerald-400 font-mono hover:text-emerald-300 transition-colors"
                >
                  <Phone className="w-3 h-3 flex-shrink-0" />
                  {revealedPhone}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Right: score + actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {/* AI Score */}
          <div className={cn("badge border text-sm font-bold tabular-nums gap-1", getScoreColor(ai_score))}>
            <Star className="w-3 h-3" />
            {ai_score}
          </div>
          <span className="text-[10px] text-[var(--muted)] whitespace-nowrap text-right">{match_label}</span>

          {/* Actions */}
          <div className="flex flex-col items-end gap-1.5 mt-1">
            {/* Email reveal button */}
            {!revealedEmail ? (
              <button
                onClick={handleRevealEmail}
                disabled={emailLoading || !linkedin_url}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all",
                  "border-[var(--border)] text-[var(--muted)] hover:border-brand-500/40 hover:text-brand-400",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  emailLoading && "opacity-70"
                )}
                title="Reveal email (1 credit)"
              >
                {emailLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                {emailLoading ? "..." : "Email · 1cr"}
              </button>
            ) : (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Email
              </span>
            )}

            {/* Phone reveal button */}
            {!revealedPhone ? (
              <button
                onClick={handleRevealPhone}
                disabled={phoneLoading || !linkedin_url}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all",
                  "border-[var(--border)] text-[var(--muted)] hover:border-amber-500/40 hover:text-amber-400",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  phoneLoading && "opacity-70"
                )}
                title="Reveal phone (8 credits)"
              >
                {phoneLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Smartphone className="w-3 h-3" />
                )}
                {phoneLoading ? "..." : "Phone · 8cr"}
              </button>
            ) : (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Phone
              </span>
            )}

            {/* LinkedIn + Shortlist */}
            <div className="flex items-center gap-1.5 mt-0.5">
              {linkedin_url && (
                <a
                  href={linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--muted)] hover:text-brand-400 transition-colors"
                  title="Open professional profile"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={() => onSequenceEnroll?.(candidate)}
                className="p-1.5 rounded-lg hover:bg-brand-500/10 text-[var(--muted)] hover:text-brand-400 transition-colors"
                title="Add to sequence"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
