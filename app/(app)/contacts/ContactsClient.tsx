"use client";
// nexire-app — app/(app)/contacts/ContactsClient.tsx
// Master Rolodex of all revealed/sequenced candidates.

import { useState, useEffect, useCallback } from "react";
import { Users, Mail, Phone, ExternalLink, Star, MapPin, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  person_id: string;
  full_name: string;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  linkedin_url: string | null;
  ai_score: number | null;
  updated_at: string;
  emails: string[];
  phones: string[];
  sequence: {
    id: string;
    name: string;
    status: string;
    step: number;
  } | null;
}

export function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contacts?limit=100");
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch { toast.error("Failed to load contacts"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  return (
    <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Contacts</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Your master list of revealed and sequenced talent.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-[var(--surface-raised)] rounded-xl animate-pulse" />)}
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--border)] rounded-2xl bg-[var(--surface)]">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-brand-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Your Rolodex is empty</h2>
          <p className="text-[var(--muted)] text-sm max-w-sm mb-6">When you reveal emails or add candidates to sequences from Search, they will appear here automatically.</p>
          <a href="/search" className="btn-primary px-5 py-2.5 rounded-xl text-sm font-medium">Go to Search</a>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[var(--surface-raised)] text-[var(--muted)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4 font-medium rounded-tl-xl border-b border-[var(--border)]">Candidate</th>
                  <th className="px-5 py-4 font-medium border-b border-[var(--border)]">Contact Info</th>
                  <th className="px-5 py-4 font-medium border-b border-[var(--border)]">Sequence Status</th>
                  <th className="px-5 py-4 font-medium rounded-tr-xl border-b border-[var(--border)]">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors group">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center font-bold flex-shrink-0">
                          {c.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--foreground)]">{c.full_name}</span>
                            {c.linkedin_url && (
                              <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-[#0a66c2] hover:underline">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-[var(--muted)] line-clamp-1 max-w-[250px]">
                            {c.current_title || c.headline}
                          </div>
                          <div className="text-[11px] text-[var(--muted)] flex items-center gap-2 mt-0.5 opacity-60">
                            {c.current_company && <span className="flex items-center gap-0.5"><Briefcase className="w-3 h-3" /> {c.current_company}</span>}
                            {c.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {c.location}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 align-top pt-5">
                      <div className="space-y-1 text-xs">
                        {c.emails.length > 0 ? (
                          c.emails.map(e => <div key={e} className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-[var(--muted)]" /> <a href={`mailto:${e}`} className="hover:underline">{e}</a></div>)
                        ) : <span className="text-[var(--muted)] opacity-50">—</span>}
                        {c.phones.map(p => <div key={p} className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-[var(--muted)]" /> <a href={`tel:${p}`} className="hover:underline">{p}</a></div>)}
                      </div>
                    </td>
                    <td className="px-5 py-3 align-top pt-5">
                      {c.sequence ? (
                        <div>
                          <span className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1",
                            c.sequence.status === "active" ? "bg-brand-500/10 text-brand-400" :
                            c.sequence.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                            "bg-[var(--surface-raised)] text-[var(--muted)]"
                          )}>
                            {c.sequence.status}
                          </span>
                          <div className="text-xs font-medium text-[var(--foreground)] truncate max-w-[150px]">{c.sequence.name}</div>
                          <div className="text-[10px] text-[var(--muted)]">Step {c.sequence.step + 1}</div>
                        </div>
                      ) : (
                        <span className="text-[var(--muted)] opacity-50 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 align-top pt-5">
                      {c.ai_score !== null ? (
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border",
                          c.ai_score >= 80 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          c.ai_score >= 60 ? "bg-brand-500/10 text-brand-400 border-brand-500/20" :
                          "bg-[var(--surface-raised)] text-[var(--muted)] border-[var(--border)]"
                        )}>
                          <Star className="w-3 h-3" /> {c.ai_score}
                        </div>
                      ) : (
                        <span className="text-[var(--muted)] opacity-50 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
