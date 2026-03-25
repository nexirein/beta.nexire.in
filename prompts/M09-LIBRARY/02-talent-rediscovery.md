<!--
@_meta/HLD-COMPACT.md        ← architecture, DB schema, rules, design tokens
@CLAUDE.md                   ← project rules + conventions
@docs/DATABASE.md            ← full 17-table schema
@docs/api/library.md         ← this module's API contract
-->

# M09 — TASK 02: TALENT REDISCOVERY
# Trae: Read CLAUDE.md first.
# Talent Rediscovery surfaces candidates the recruiter has ALREADY seen —
# previously revealed, shortlisted, or messaged — who now match a new job opening.
# Instead of buying fresh reveals, the recruiter mines their existing talent pool.
# "You already know 14 people who match this new role."
# Route: /library/rediscovery
# After completion, append to _meta/BUILD-LOG.md

---

## OBJECTIVE
Build Talent Rediscovery:
1. DB view: vw_rediscovery_candidates — joins revealed/shortlisted candidates with current search
2. GET /api/rediscovery — query previously seen candidates against a JD or filters
3. RediscoveryPage at /library/rediscovery
4. JDMatchInput — paste a job description, AI extracts skills + role for matching
5. RediscoveryResultCard — shows candidate, why they match, last interaction
6. "Add to shortlist" direct action from rediscovery result
7. Cost savings banner: "You saved ₹X by using existing reveals"

---

## FILE 1 — Supabase SQL: rediscovery supporting view + index

```sql
-- Index to power rediscovery queries on revealed candidates
CREATE INDEX idx_reveals_org_candidate ON candidate_reveals(org_id, candidate_id, created_at DESC);

-- View: all candidates an org has ever interacted with (revealed OR shortlisted)
CREATE OR REPLACE VIEW vw_org_known_candidates AS
SELECT DISTINCT ON (cr.candidate_id, cr.org_id)
  cr.candidate_id,
  cr.org_id,
  cr.created_at           AS first_seen_at,
  cr.created_by           AS first_seen_by,
  'reveal'::TEXT          AS interaction_type,
  NULL::UUID              AS shortlist_id
FROM candidate_reveals cr
UNION ALL
SELECT DISTINCT ON (sl.candidate_id, p.org_id)
  sl.candidate_id,
  p.org_id,
  sl.created_at           AS first_seen_at,
  sl.added_by             AS first_seen_by,
  'shortlist'::TEXT       AS interaction_type,
  sl.shortlist_id
FROM shortlist_candidates sl
JOIN profiles p ON p.id = sl.added_by;
```

---

## FILE 2 — lib/rediscovery/matcher.ts  (core matching logic)

```typescript
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";

export interface RediscoveryFilters {
  roles?:        string[];
  skills?:       string[];
  locations?:    string[];
  experience?:   { min?: number; max?: number };
  jd_text?:      string;    // optional raw JD to extract from
}

export interface RediscoveryCandidate {
  candidate_id:     string;
  full_name:        string;
  current_role:     string;
  current_company:  string;
  skills:           string[];
  location:         string;
  experience_years: number;
  match_score:      number;      // 0-100
  match_reasons:    string[];    // ["Matched: React, Node.js", "5 yrs exp", "Bangalore"]
  last_interaction: string;      // "Revealed 3 months ago"
  interaction_type: string;      // "reveal" | "shortlist"
  shortlist_id?:    string;
  first_seen_at:    string;
}

/**
 * If jd_text is provided, use AI to extract role/skills/location before matching.
 */
export async function extractFiltersFromJD(jdText: string): Promise<RediscoveryFilters> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: [
      {
        role:    "system",
        content: `Extract structured requirements from a job description. 
                  Return JSON only: { roles: string[], skills: string[], locations: string[], 
                  experience: { min: number, max: number } }
                  - roles: job titles/roles mentioned (max 3)
                  - skills: technical + soft skills (max 15)
                  - locations: cities or regions mentioned
                  - experience: years range if mentioned`,
      },
      { role: "user", content: jdText.slice(0, 4000) },
    ],
    response_format: { type: "json_object" },
    max_tokens: 400,
    temperature: 0.1,
  });

  try {
    return JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return {};
  }
}

/**
 * Find previously revealed/shortlisted candidates matching the given filters.
 */
export async function findRediscoveryCandidates(
  orgId:   string,
  filters: RediscoveryFilters,
  limit:   number = 30,
): Promise<{ candidates: RediscoveryCandidate[]; total_known: number; credit_savings: number }> {
  const supabase = createServiceClient();

  // Step 1: Get all candidate IDs this org has ever interacted with
  const { data: knownIds } = await supabase
    .from("candidate_reveals")
    .select("candidate_id, created_at, created_by")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const { data: shortlistedIds } = await supabase
    .from("shortlist_candidates")
    .select("candidate_id, created_at, added_by, shortlist_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  // Build map: candidate_id → interaction info
  const interactionMap = new Map<string, { type: string; date: string; shortlist_id?: string }>();
  (shortlistedIds ?? []).forEach(s => {
    interactionMap.set(s.candidate_id, {
      type: "shortlist",
      date: s.created_at,
      shortlist_id: s.shortlist_id,
    });
  });
  (knownIds ?? []).forEach(r => {
    if (!interactionMap.has(r.candidate_id)) {
      interactionMap.set(r.candidate_id, { type: "reveal", date: r.created_at });
    }
  });

  const allKnownIds = Array.from(interactionMap.keys());
  if (!allKnownIds.length) {
    return { candidates: [], total_known: 0, credit_savings: 0 };
  }

  // Step 2: Query candidates with matching skills/roles/location
  let query = supabase
    .from("candidates")
    .select(`
      id, full_name, current_role, current_company,
      skills, location, experience_years, profile_data
    `)
    .in("id", allKnownIds)
    .limit(200);   // fetch up to 200 known candidates for client-side scoring

  const { data: candidates } = await query;

  // Step 3: Score each candidate
  const skillSet     = new Set((filters.skills ?? []).map(s => s.toLowerCase()));
  const roleKeywords = (filters.roles ?? []).map(r => r.toLowerCase());
  const locationSet  = new Set((filters.locations ?? []).map(l => l.toLowerCase()));

  const scored = (candidates ?? []).map(c => {
    let score         = 0;
    const matchReasons: string[] = [];

    // Skills match (up to 50 points)
    const cSkills = (c.skills ?? []).map((s: string) => s.toLowerCase());
    const matchedSkills = cSkills.filter((s: string) => skillSet.has(s));
    if (matchedSkills.length > 0) {
      const skillScore = Math.min(50, Math.round((matchedSkills.length / Math.max(skillSet.size, 1)) * 50));
      score += skillScore;
      matchReasons.push(`Skills: ${matchedSkills.slice(0, 3).join(", ")}${matchedSkills.length > 3 ? ` +${matchedSkills.length - 3}` : ""}`);
    }

    // Role match (up to 30 points)
    const roleText = `${c.current_role ?? ""} ${c.profile_data?.summary ?? ""}`.toLowerCase();
    const roleMatches = roleKeywords.filter(r => roleText.includes(r));
    if (roleMatches.length > 0) {
      score += 30;
      matchReasons.push(`Role: ${roleMatches[0]}`);
    }

    // Location match (up to 20 points)
    const cLocation = (c.location ?? "").toLowerCase();
    const locationMatch = Array.from(locationSet).some(l => cLocation.includes(l));
    if (locationMatch) {
      score += 20;
      matchReasons.push(`Location: ${c.location}`);
    }

    // Experience match (bonus 10 points)
    if (filters.experience) {
      const exp = c.experience_years ?? 0;
      const { min = 0, max = 99 } = filters.experience;
      if (exp >= min && exp <= max) {
        score += 10;
        matchReasons.push(`${exp} yrs experience`);
      }
    }

    const interaction = interactionMap.get(c.id);
    const daysAgo     = Math.floor((Date.now() - new Date(interaction?.date ?? "").getTime()) / 86400000);
    const lastInteraction = daysAgo < 7 ? `${daysAgo}d ago`
      : daysAgo < 30 ? `${Math.floor(daysAgo / 7)}w ago`
      : daysAgo < 365 ? `${Math.floor(daysAgo / 30)}mo ago`
      : `${Math.floor(daysAgo / 365)}y ago`;

    return {
      candidate_id:     c.id,
      full_name:        c.full_name,
      current_role:     c.current_role ?? "",
      current_company:  c.current_company ?? "",
      skills:           c.skills ?? [],
      location:         c.location ?? "",
      experience_years: c.experience_years ?? 0,
      match_score:      Math.min(100, score),
      match_reasons:    matchReasons,
      last_interaction: `${interaction?.type === "shortlist" ? "Shortlisted" : "Revealed"} ${lastInteraction}`,
      interaction_type: interaction?.type ?? "reveal",
      shortlist_id:     interaction?.shortlist_id,
      first_seen_at:    interaction?.date ?? "",
    } as RediscoveryCandidate;
  });

  // Sort by match score descending, filter score > 20
  const filtered = scored
    .filter(c => c.match_score > 20)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);

  // Credit savings: each shortlisted/revealed candidate we surface = 1 reveal credit saved
  const credit_savings = filtered.length;

  return {
    candidates: filtered,
    total_known: allKnownIds.length,
    credit_savings,
  };
}
```

---

## FILE 3 — app/api/rediscovery/route.ts

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findRediscoveryCandidates, extractFiltersFromJD } from "@/lib/rediscovery/matcher";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { jd_text, roles, skills, locations, experience } = body;

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();

  let filters = { roles, skills, locations, experience };

  // If JD text provided, extract filters via AI first
  if (jd_text?.trim()) {
    const extracted = await extractFiltersFromJD(jd_text);
    filters = {
      roles:      [...(roles ?? []), ...(extracted.roles ?? [])],
      skills:     [...(skills ?? []), ...(extracted.skills ?? [])],
      locations:  [...(locations ?? []), ...(extracted.locations ?? [])],
      experience: experience ?? extracted.experience,
      jd_text,
    };
  }

  const result = await findRediscoveryCandidates(profile?.org_id, filters, 30);
  return NextResponse.json(result);
}
```

---

## FILE 4 — app/(app)/library/rediscovery/page.tsx  (main page)

```tsx
"use client";
import { useState } from "react";
import { RefreshCw, Sparkles, Target, TrendingUp, Users,
         ChevronRight, Zap, RotateCcw, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { JDMatchInput } from "./JDMatchInput";
import { RediscoveryResultCard } from "./RediscoveryResultCard";

export default function RediscoveryPage() {
  const [results, setResults]       = useState<any[]>([]);
  const [totalKnown, setTotalKnown] = useState(0);
  const [savings, setSavings]       = useState(0);
  const [loading, setLoading]       = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [extractedFilters, setExtractedFilters] = useState<any>(null);

  const search = async (payload: any) => {
    setLoading(true);
    setHasSearched(true);
    const res  = await fetch("/api/rediscovery", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { toast.error("Search failed"); return; }
    setResults(data.candidates ?? []);
    setTotalKnown(data.total_known ?? 0);
    setSavings(data.credit_savings ?? 0);
    if (payload.jd_text) setExtractedFilters(payload);
  };

  const addToShortlist = async (candidateId: string, shortlistId: string) => {
    const res = await fetch(`/api/shortlists/${shortlistId}/candidates`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ candidate_id: candidateId }),
    });
    if (res.ok) toast.success("Added to shortlist");
    else toast.error("Failed to add");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-purple-400/10 border border-purple-400/20 flex items-center justify-center">
          <RotateCcw className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">Talent Rediscovery</h1>
          <p className="text-xs text-[#555555] mt-0.5">Find candidates you already know who match a new opening</p>
        </div>
      </div>

      {/* How it works — only on first visit */}
      {!hasSearched && (
        <div className="grid grid-cols-3 gap-3 my-6">
          {[
            { icon: FileText, color: "text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/20", title: "Paste a JD", desc: "Or manually enter role, skills, location" },
            { icon: Sparkles, color: "text-purple-400 bg-purple-400/10 border-purple-400/20", title: "AI matches",  desc: "We score your entire history of revealed candidates" },
            { icon: Zap,      color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", title: "Save credits", desc: "No new reveals needed — use what you already have" },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-3 border", s.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold text-[#FAFAFA] mb-1">{s.title}</p>
                <p className="text-xs text-[#555555] leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Input */}
      <JDMatchInput onSearch={search} loading={loading} />

      {/* Extracted filter summary (after JD parse) */}
      {extractedFilters && !loading && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-[#555555] uppercase tracking-wider">Extracted:</span>
          {[
            ...(extractedFilters.roles ?? []).map((r: string) => ({ label: r, color: "text-purple-400 bg-purple-400/10 border-purple-400/20" })),
            ...(extractedFilters.skills?.slice(0, 5) ?? []).map((s: string) => ({ label: s, color: "text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/20" })),
            ...(extractedFilters.locations ?? []).map((l: string) => ({ label: l, color: "text-green-400 bg-green-400/10 border-green-400/20" })),
          ].map((chip, i) => (
            <span key={i} className={cn("text-[10px] px-2 py-0.5 rounded-md border font-medium", chip.color)}>
              {chip.label}
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      {hasSearched && !loading && (
        <>
          {/* Stats bar */}
          <div className="mt-5 grid grid-cols-3 gap-3 mb-5">
            {[
              { icon: Users,     color: "text-[#38BDF8]", label: "Known candidates", value: totalKnown.toLocaleString() },
              { icon: Target,    color: "text-purple-400", label: "Matches found",    value: results.length.toString() },
              { icon: TrendingUp, color: "text-green-400", label: "Reveals saved",   value: savings.toString() },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-4 flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-xl bg-[#1A1A1A] flex items-center justify-center flex-shrink-0", s.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                    <p className="text-[10px] text-[#555555]">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Credit savings banner */}
          {savings > 0 && (
            <div className="flex items-center gap-3 bg-green-400/5 border border-green-400/20 rounded-2xl px-4 py-3.5 mb-5">
              <Zap className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-400">
                <span className="font-bold">{savings} reveal credit{savings !== 1 ? "s" : ""} saved</span>
                <span className="text-green-400/70"> · These candidates are already in your history — no new credits needed to shortlist them.</span>
              </p>
            </div>
          )}

          {results.length === 0 ? (
            <div className="text-center py-16 bg-[#111111] border border-[#1A1A1A] rounded-2xl">
              <Target className="w-10 h-10 text-[#222222] mx-auto mb-3" />
              <p className="text-sm text-[#555555]">No matches in your existing history</p>
              <p className="text-xs text-[#333333] mt-1">Try adjusting skills or location, or run a fresh search</p>
              <a href="/search" className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#38BDF8] hover:underline">
                Search for new candidates <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="grid gap-3">
              {results.map(c => (
                <RediscoveryResultCard
                  key={c.candidate_id}
                  candidate={c}
                  onAddToShortlist={addToShortlist}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

---

## FILE 5 — app/(app)/library/rediscovery/JDMatchInput.tsx

```tsx
"use client";
import { useState } from "react";
import { FileText, X, Search, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onSearch: (payload: any) => void;
  loading:  boolean;
}

type Mode = "jd" | "manual";

export function JDMatchInput({ onSearch, loading }: Props) {
  const [mode, setMode]           = useState<Mode>("jd");
  const [jdText, setJdText]       = useState("");
  const [roles, setRoles]         = useState("");
  const [skills, setSkills]       = useState("");
  const [locations, setLocations] = useState("");
  const [expMin, setExpMin]       = useState("");
  const [expMax, setExpMax]       = useState("");

  const handleSearch = () => {
    if (mode === "jd") {
      if (!jdText.trim()) return;
      onSearch({ jd_text: jdText });
    } else {
      onSearch({
        roles:      roles.split(",").map(r => r.trim()).filter(Boolean),
        skills:     skills.split(",").map(s => s.trim()).filter(Boolean),
        locations:  locations.split(",").map(l => l.trim()).filter(Boolean),
        experience: (expMin || expMax) ? { min: Number(expMin) || 0, max: Number(expMax) || 99 } : undefined,
      });
    }
  };

  return (
    <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl p-5 mt-5">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-1 w-fit mb-4">
        <button onClick={() => setMode("jd")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all",
            mode === "jd" ? "bg-purple-400/10 text-purple-400" : "text-[#555555] hover:text-[#A0A0A0]"
          )}>
          <Sparkles className="w-3.5 h-3.5" /> Paste JD (AI extract)
        </button>
        <button onClick={() => setMode("manual")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all",
            mode === "manual" ? "bg-[#38BDF8]/10 text-[#38BDF8]" : "text-[#555555] hover:text-[#A0A0A0]"
          )}>
          <Search className="w-3.5 h-3.5" /> Manual filters
        </button>
      </div>

      {mode === "jd" ? (
        <div className="space-y-3">
          <textarea
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder={`Paste the job description here...\n\nExample:\nWe are hiring a Senior Backend Engineer with 5+ years of experience in Node.js, PostgreSQL, and AWS. Based in Bangalore or remote. Experience with high-scale systems is a must.`}
            rows={7}
            className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-purple-400/50 resize-none transition-all leading-relaxed"
          />
          <p className="text-[10px] text-[#555555]">
            AI will extract role, required skills, location, and experience range from the JD.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Roles (comma-separated)</label>
            <input value={roles} onChange={e => setRoles(e.target.value)}
              placeholder="Backend Engineer, SRE"
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all" />
          </div>
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Skills (comma-separated)</label>
            <input value={skills} onChange={e => setSkills(e.target.value)}
              placeholder="Node.js, PostgreSQL, AWS"
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all" />
          </div>
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Locations</label>
            <input value={locations} onChange={e => setLocations(e.target.value)}
              placeholder="Bangalore, Mumbai"
              className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all" />
          </div>
          <div>
            <label className="text-[10px] text-[#555555] uppercase tracking-wider font-medium block mb-1.5">Experience (years)</label>
            <div className="flex items-center gap-2">
              <input value={expMin} onChange={e => setExpMin(e.target.value)} type="number" placeholder="Min"
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all" />
              <span className="text-[#333333] text-xs">to</span>
              <input value={expMax} onChange={e => setExpMax(e.target.value)} type="number" placeholder="Max"
                className="w-full bg-[#0A0A0A] border border-[#222222] rounded-xl px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#333333] focus:outline-none focus:border-[#38BDF8]/50 transition-all" />
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleSearch}
        disabled={loading || (mode === "jd" ? !jdText.trim() : !roles.trim() && !skills.trim())}
        className="mt-4 flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-medium hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 transition-all"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching your history...</>
          : <><Search className="w-4 h-4" /> Find in my talent pool</>}
      </button>
    </div>
  );
}
```

---

## FILE 6 — app/(app)/library/rediscovery/RediscoveryResultCard.tsx

```tsx
"use client";
import { useState } from "react";
import { Building2, MapPin, Star, Plus, CheckCircle,
         RotateCcw, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  candidate:       any;
  onAddToShortlist:(candidateId: string, shortlistId: string) => void;
}

export function RediscoveryResultCard({ candidate: c, onAddToShortlist }: Props) {
  const [added, setAdded] = useState(false);
  const [showShortlists, setShowShortlists] = useState(false);

  const scoreColor =
    c.match_score >= 80 ? "text-green-400 bg-green-400/10 border-green-400/20" :
    c.match_score >= 50 ? "text-[#38BDF8] bg-[#38BDF8]/10 border-[#38BDF8]/20" :
    "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";

  const initials = (c.full_name ?? "?")
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="bg-[#111111] border border-[#1A1A1A] rounded-2xl px-5 py-4 hover:border-[#222222] transition-all">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-sm font-bold text-[#555555] flex-shrink-0">
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#FAFAFA]">{c.full_name}</h3>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1 text-xs text-[#555555]">
                  <Building2 className="w-3 h-3" /> {c.current_role}{c.current_company ? ` @ ${c.current_company}` : ""}
                </span>
                {c.location && (
                  <span className="flex items-center gap-1 text-xs text-[#555555]">
                    <MapPin className="w-3 h-3" /> {c.location}
                  </span>
                )}
              </div>
            </div>
            {/* Match score */}
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-sm font-bold flex-shrink-0", scoreColor)}>
              <Star className="w-3.5 h-3.5" />
              {c.match_score}%
            </div>
          </div>

          {/* Match reasons */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {c.match_reasons.map((r: string, i: number) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-400/10 border border-purple-400/20 text-purple-400">
                ✓ {r}
              </span>
            ))}
          </div>

          {/* Skills */}
          <div className="flex flex-wrap gap-1 mt-2">
            {(c.skills ?? []).slice(0, 6).map((skill: string) => (
              <span key={skill} className="text-[10px] px-2 py-0.5 rounded-md bg-[#1A1A1A] border border-[#222222] text-[#555555]">
                {skill}
              </span>
            ))}
            {c.skills?.length > 6 && (
              <span className="text-[10px] text-[#333333]">+{c.skills.length - 6}</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1A1A1A]">
        {/* Last interaction */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#555555]">
          <RotateCcw className="w-3 h-3" />
          {c.last_interaction}
          {c.interaction_type === "shortlist" && (
            <span className="text-[10px] text-[#38BDF8] bg-[#38BDF8]/10 border border-[#38BDF8]/20 px-1.5 py-0.5 rounded-md ml-1">
              In shortlist
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <a
            href={`/search?candidate=${c.candidate_id}`}
            className="px-3 py-1.5 rounded-xl border border-[#222222] text-xs text-[#555555] hover:text-[#A0A0A0] hover:border-[#333333] transition-all"
          >
            View profile
          </a>
          {added ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-400/10 border border-green-400/20 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" /> Added
            </span>
          ) : (
            <button
              onClick={() => {
                // In real use, open a shortlist picker modal
                // For now, add to first available shortlist
                if (c.shortlist_id) {
                  onAddToShortlist(c.candidate_id, c.shortlist_id);
                  setAdded(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-400/10 border border-purple-400/20 text-xs text-purple-400 hover:bg-purple-400/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add to shortlist
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## COMPLETION CHECKLIST
- [ ] DB view vw_org_known_candidates joins candidate_reveals + shortlist_candidates
- [ ] lib/rediscovery/matcher.ts: extractFiltersFromJD() (GPT-4o-mini), findRediscoveryCandidates()
- [ ] Scoring: skills (50pts), role match (30pts), location (20pts), experience (10pts bonus)
- [ ] Only return candidates with score > 20
- [ ] POST /api/rediscovery: accepts jd_text (AI extract) OR manual filters
- [ ] RediscoveryPage: how-it-works cards on first visit, stats bar after search
- [ ] JDMatchInput: "Paste JD" tab (AI) + "Manual filters" tab toggle
- [ ] Extracted filter chips shown after JD parse
- [ ] RediscoveryResultCard: match score badge (green/blue/yellow), match reason chips (purple), last interaction
- [ ] "N reveal credits saved" green banner when results found
- [ ] Empty state links to /search for fresh candidates
- [ ] OPENAI_API_KEY needed in env for JD extraction

## BUILD LOG ENTRY
## M09-02 Talent Rediscovery — [date]
### Files: DB view, matcher.ts (AI), rediscovery API, RediscoveryPage, JDMatchInput, ResultCard
### Status: ✅ Complete
