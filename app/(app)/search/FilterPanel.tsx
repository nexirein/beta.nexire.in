"use client";
// nexire-app — app/(app)/search/FilterPanel.tsx
// Full Prospeo filter modal with Suggestions API autocomplete

import { X, Plus, Loader2, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ProspeoFilters, ProspeoSeniority, ProspeoHeadcountRange, ProspeoTopDepartment } from "@/lib/prospeo/types";

// ─── Constants ───────────────────────────────────────────────────────────

const SENIORITY_VALUES: ProspeoSeniority[] = [
  "C-Suite", "Director", "Entry", "Founder/Owner", "Head",
  "Intern", "Manager", "Partner", "Senior", "Vice President",
];

const DEPARTMENT_VALUES: ProspeoTopDepartment[] = [
  "C-Suite", "Consulting", "Design", "Education & Coaching",
  "Engineering & Technical", "Finance", "Human Resources",
  "Information Technology", "Legal", "Marketing", "Medical & Health",
  "Operations", "Product", "Sales",
];

const HEADCOUNT_RANGES: ProspeoHeadcountRange[] = [
  "1-10", "11-20", "21-50", "51-100", "101-200", "201-500",
  "501-1000", "1001-2000", "2001-5000", "5001-10000", "10000+",
];

const COMPANY_TYPES = ["Private", "Public", "Non Profit", "Other"] as const;

const FUNDING_STAGES = [
  "Pre seed", "Seed", "Angel", "Series A", "Series B", "Series C",
  "Series D", "Series E-J", "Private equity", "Post IPO equity",
  "Grant", "Convertible note", "Debt financing",
];

const POPULAR_INDUSTRIES = [
  "Software Development", "IT Services and IT Consulting",
  "Financial Services", "Banking", "Insurance", "E-Commerce",
  "Healthcare", "Education", "Staffing and Recruiting",
  "Telecommunications", "Manufacturing", "Retail",
];

const POPULAR_TECHNOLOGIES = [
  "Salesforce", "HubSpot", "AWS", "React", "Node.js", "Python",
  "Docker", "Kubernetes", "Azure", "Google Cloud", "Stripe", "Zendesk",
];

// ─── Autocomplete Component ───────────────────────────────────────────────

function AutocompleteInput({
  placeholder,
  type,
  onSelect,
}: {
  placeholder: string;
  type: "location_search" | "job_title_search";
  onSelect: (val: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ label: string; badge?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/prospeo/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [type]: query }),
        });
        const data = await res.json();
        if (data.error === false) {
          if (type === "location_search") {
            setSuggestions((data.location_suggestions || []).map((s: { name: string; type: string }) => ({
              label: s.name, badge: s.type,
            })));
          } else {
            setSuggestions((data.job_title_suggestions || []).map((s: string) => ({ label: s })));
          }
          setOpen(true);
        } else { setSuggestions([]); }
      } catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 300);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [query, type]);

  return (
    <div className="relative">
      <div className={cn(
        "flex items-center rounded-xl border px-3 py-2.5 text-sm transition-all",
        "border-[var(--border)] bg-[var(--background)]",
        "focus-within:border-brand-500/60 focus-within:ring-1 focus-within:ring-brand-500/20",
      )}>
        <Search className="w-3.5 h-3.5 text-[var(--muted)] mr-2 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-[var(--foreground)] placeholder:text-[var(--muted)] text-sm"
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--muted)]" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface-overlay)] border border-[var(--border)] rounded-xl shadow-2xl z-[60] max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onMouseDown={e => { e.preventDefault(); onSelect(s.label); setQuery(""); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-500/10 hover:text-brand-400 border-b border-[var(--border)] last:border-0 transition-colors flex items-center justify-between"
            >
              <span className="truncate">{s.label}</span>
              {s.badge && <span className="ml-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded bg-[var(--surface-raised)] text-[var(--muted)] flex-shrink-0">{s.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chip Component ───────────────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-lg px-2.5 py-1.5 font-medium">
      {label}
      <button onClick={onRemove} className="text-brand-400/70 hover:text-red-400 transition-colors ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────

function FilterSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[var(--border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-[var(--surface-raised)] hover:bg-[var(--surface)] transition-colors text-left"
      >
        <span className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
          {title}
          {count != null && count > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-500 text-white tabular-nums">{count}</span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--muted)]" />}
      </button>
      {open && <div className="px-5 py-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Toggle Button ────────────────────────────────────────────────────────

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-3 py-1.5 rounded-xl border transition-all font-medium whitespace-nowrap",
        active
          ? "border-brand-500/50 bg-brand-500/15 text-brand-400"
          : "border-[var(--border)] bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]"
      )}
    >
      {label}
    </button>
  );
}

// ─── Main FilterPanel ─────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: ProspeoFilters;
  onChange: (f: ProspeoFilters) => void;
  onClose?: () => void;
  onApply?: () => void;
}

export function FilterPanel({ filters, onChange, onClose, onApply }: FilterPanelProps) {
  // ── Helper utilities ──
  const update = <K extends keyof ProspeoFilters>(key: K, value: ProspeoFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const addToInclude = (key: keyof ProspeoFilters, subKey: "include" | "names", val: string) => {
    const existing = (filters[key] as any) ?? {};
    if (subKey === "names") {
      const arr: string[] = existing.names?.include ?? [];
      if (!arr.includes(val)) {
        update(key, { ...existing, names: { ...existing.names, include: [...arr, val] } } as any);
      }
    } else {
      const arr: string[] = existing.include ?? [];
      if (!arr.includes(val)) {
        update(key, { ...existing, include: [...arr, val] } as any);
      }
    }
  };

  const removeFromInclude = (key: keyof ProspeoFilters, subKey: "include" | "names", val: string) => {
    const existing = (filters[key] as any) ?? {};
    if (subKey === "names") {
      const arr: string[] = existing.names?.include ?? [];
      update(key, { ...existing, names: { ...existing.names, include: arr.filter((v: string) => v !== val) } } as any);
    } else {
      const arr: string[] = existing.include ?? [];
      update(key, { ...existing, include: arr.filter((v: string) => v !== val) } as any);
    }
  };

  const toggleArray = <T extends string>(key: keyof ProspeoFilters, val: T) => {
    const arr = ((filters[key] as any[]) ?? []) as T[];
    update(key, (arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]) as any);
  };

  const toggleInclude = <T extends string>(key: keyof ProspeoFilters, val: T) => {
    const existing = (filters[key] as any) ?? {};
    const arr: T[] = existing.include ?? [];
    update(key, { ...existing, include: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] } as any);
  };

  // ── State for free-text inputs ──
  const [keyword, setKeyword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [techInput, setTechInput] = useState("");
  const [jobPostingTitle, setJobPostingTitle] = useState("");

  // ── Count active filters per section ──
  const personFiltersCount = [
    filters.person_job_title?.include?.length,
    filters.person_seniority?.include?.length,
    filters.person_department?.include?.length,
    filters.person_location_search?.include?.length,
    filters.person_year_of_experience,
    filters.person_time_in_current_role,
    filters.person_time_in_current_company,
    filters.max_person_per_company,
    filters.person_job_change,
    filters.person_contact_details,
  ].filter(Boolean).length;

  const companyFiltersCount = [
    filters.company?.names?.include?.length,
    filters.company_location_search?.include?.length,
    filters.company_headcount_range?.length,
    filters.company_industry?.include?.length,
    filters.company_funding?.stage?.length,
    filters.company_type,
    filters.company_technology?.include?.length,
    filters.company_keywords?.include?.length,
    filters.company_founded,
    filters.company_headcount_growth,
    filters.company_job_posting_hiring_for?.length,
  ].filter(Boolean).length;

  const inp = "w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand-500/60 transition-all";

  return (
    <div className="bg-[var(--surface)] w-full max-w-2xl mx-auto rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-raised)] flex-shrink-0 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">Search Filters</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Powered by Prospeo · Start typing to get valid suggestions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onChange({})} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 border border-red-500/20 hover:border-red-500/40 rounded-xl transition-all">
            Clear All
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-[var(--surface)] rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">

        {/* ── PERSON FILTERS ─────────────────────────────── */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400 px-1">Person Filters</p>

        {/* Job Title */}
        <FilterSection title="Job Title" count={(filters.person_job_title?.include?.length ?? 0)}>
          <div>
            <AutocompleteInput
              type="job_title_search"
              placeholder="Type to search job titles (e.g. Software Engineer)"
              onSelect={val => addToInclude("person_job_title", "include", val)}
            />
            {(filters.person_job_title?.include?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {filters.person_job_title!.include!.map(t => (
                  <Chip key={t} label={t} onRemove={() => removeFromInclude("person_job_title", "include", t)} />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1.5 block">Boolean Search <span className="text-brand-400">(advanced)</span></label>
            <input
              className={inp}
              placeholder='e.g. (CEO OR CTO) AND !Intern'
              value={filters.person_job_title?.boolean_search ?? ""}
              onChange={e => update("person_job_title", { boolean_search: e.target.value || undefined })}
            />
            <p className="text-[10px] text-[var(--muted)] mt-1">Note: Boolean search cannot be combined with include list above.</p>
          </div>
        </FilterSection>

        {/* Seniority */}
        <FilterSection title="Seniority" count={(filters.person_seniority?.include?.length ?? 0)}>
          <div className="flex flex-wrap gap-2">
            {SENIORITY_VALUES.map(s => (
              <ToggleChip
                key={s} label={s}
                active={(filters.person_seniority?.include ?? []).includes(s)}
                onClick={() => toggleInclude("person_seniority", s)}
              />
            ))}
          </div>
        </FilterSection>

        {/* Department */}
        <FilterSection title="Department" count={(filters.person_department?.include?.length ?? 0)}>
          <div className="flex flex-wrap gap-2">
            {DEPARTMENT_VALUES.map(d => (
              <ToggleChip
                key={d} label={d}
                active={(filters.person_department?.include ?? []).includes(d)}
                onClick={() => toggleInclude("person_department", d)}
              />
            ))}
          </div>
        </FilterSection>

        {/* Person Location */}
        <FilterSection title="Person Location" count={(filters.person_location_search?.include?.length ?? 0)}>
          <AutocompleteInput
            type="location_search"
            placeholder="Type city, state or country (e.g. Bangalore)"
            onSelect={val => addToInclude("person_location_search", "include", val)}
          />
          {(filters.person_location_search?.include?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {filters.person_location_search!.include!.map(l => (
                <Chip key={l} label={l} onRemove={() => removeFromInclude("person_location_search", "include", l)} />
              ))}
            </div>
          )}
        </FilterSection>

        {/* Experience & Time */}
        <FilterSection title="Experience & Tenure" count={
          [filters.person_year_of_experience, filters.person_time_in_current_role, filters.person_time_in_current_company].filter(Boolean).length
        }>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Total Experience (years)</label>
              <div className="flex gap-2">
                <input type="number" placeholder="Min" min={0} max={60} className={cn(inp, "flex-1")}
                  value={filters.person_year_of_experience?.min ?? ""}
                  onChange={e => update("person_year_of_experience", { ...filters.person_year_of_experience, min: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input type="number" placeholder="Max" min={0} max={60} className={cn(inp, "flex-1")}
                  value={filters.person_year_of_experience?.max ?? ""}
                  onChange={e => update("person_year_of_experience", { ...filters.person_year_of_experience, max: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Time in Current Role (months <span className="text-amber-400">≈ Notice Proxy</span>)</label>
              <div className="flex gap-2">
                <input type="number" placeholder="Min" min={0} className={cn(inp, "flex-1")}
                  value={filters.person_time_in_current_role?.min ?? ""}
                  onChange={e => update("person_time_in_current_role", { ...filters.person_time_in_current_role, min: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input type="number" placeholder="Max" min={0} className={cn(inp, "flex-1")}
                  value={filters.person_time_in_current_role?.max ?? ""}
                  onChange={e => update("person_time_in_current_role", { ...filters.person_time_in_current_role, max: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Time at Current Company (months)</label>
              <div className="flex gap-2">
                <input type="number" placeholder="Min" min={0} className={cn(inp, "flex-1")}
                  value={filters.person_time_in_current_company?.min ?? ""}
                  onChange={e => update("person_time_in_current_company", { ...filters.person_time_in_current_company, min: e.target.value ? Number(e.target.value) : undefined })}
                />
                <input type="number" placeholder="Max" min={0} className={cn(inp, "flex-1")}
                  value={filters.person_time_in_current_company?.max ?? ""}
                  onChange={e => update("person_time_in_current_company", { ...filters.person_time_in_current_company, max: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Max People Per Company</label>
              <input type="number" placeholder="e.g. 5" min={1} max={100} className={inp}
                value={filters.max_person_per_company ?? ""}
                onChange={e => update("max_person_per_company", e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>
        </FilterSection>

        {/* Job Change */}
        <FilterSection title="Recent Job Change" count={filters.person_job_change ? 1 : 0}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Changed job within</label>
              <select className={inp}
                value={filters.person_job_change?.timeframe_days ?? ""}
                onChange={e => {
                  if (!e.target.value) { update("person_job_change", undefined); return; }
                  update("person_job_change", { ...filters.person_job_change, timeframe_days: Number(e.target.value) as any });
                }}>
                <option value="">Any</option>
                {[30, 60, 90, 180, 270, 365].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Job change type</label>
              <div className="flex gap-2 flex-wrap">
                <ToggleChip label="New Company" active={filters.person_job_change?.only_new_company === true} onClick={() => {
                  update("person_job_change", { ...filters.person_job_change, timeframe_days: filters.person_job_change?.timeframe_days ?? 90, only_new_company: !filters.person_job_change?.only_new_company, only_promotion: false });
                }} />
                <ToggleChip label="Promotion" active={filters.person_job_change?.only_promotion === true} onClick={() => {
                  update("person_job_change", { ...filters.person_job_change, timeframe_days: filters.person_job_change?.timeframe_days ?? 90, only_promotion: !filters.person_job_change?.only_promotion, only_new_company: false });
                }} />
              </div>
            </div>
          </div>
        </FilterSection>

        {/* Contact Details */}
        <FilterSection title="Contact Details" count={filters.person_contact_details ? 1 : 0}>
          <div className="flex flex-wrap gap-2">
            <ToggleChip label="✉ Verified Email" active={(filters.person_contact_details?.email ?? []).includes("VERIFIED")} onClick={() => {
              const cur = filters.person_contact_details?.email ?? [];
              update("person_contact_details", { ...filters.person_contact_details, email: cur.includes("VERIFIED") ? cur.filter(v => v !== "VERIFIED") : [...cur, "VERIFIED"] });
            }} />
            <ToggleChip label="📱 Verified Mobile" active={(filters.person_contact_details?.mobile ?? []).includes("VERIFIED")} onClick={() => {
              const cur = filters.person_contact_details?.mobile ?? [];
              update("person_contact_details", { ...filters.person_contact_details, mobile: cur.includes("VERIFIED") ? cur.filter(v => v !== "VERIFIED") : [...cur, "VERIFIED"] });
            }} />
          </div>
        </FilterSection>

        {/* ── COMPANY FILTERS ───────────────────────────── */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400 px-1 pt-2">Company Filters</p>

        {/* Company */}
        <FilterSection title="Company" count={(filters.company?.names?.include?.length ?? 0)}>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1.5 block">Company Name</label>
            <div className="flex gap-2">
              <input className={cn(inp, "flex-1")} placeholder="e.g. Google, Zepto..." value={companyName} onChange={e => setCompanyName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && companyName.trim()) { addToInclude("company", "names", companyName.trim()); setCompanyName(""); } }} />
              <button onClick={() => { if (companyName.trim()) { addToInclude("company", "names", companyName.trim()); setCompanyName(""); } }}
                className="p-2.5 rounded-xl border border-[var(--border)] hover:border-brand-500/40 text-[var(--muted)] hover:text-brand-400">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {(filters.company?.names?.include?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {filters.company!.names!.include!.map(c => (
                  <Chip key={c} label={c} onRemove={() => removeFromInclude("company", "names", c)} />
                ))}
              </div>
            )}
          </div>
        </FilterSection>

        {/* Company Location */}
        <FilterSection title="Company HQ Location" count={(filters.company_location_search?.include?.length ?? 0)}>
          <AutocompleteInput
            type="location_search"
            placeholder="e.g. Bangalore, Mumbai, India"
            onSelect={val => addToInclude("company_location_search", "include", val)}
          />
          {(filters.company_location_search?.include?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {filters.company_location_search!.include!.map(l => (
                <Chip key={l} label={l} onRemove={() => removeFromInclude("company_location_search", "include", l)} />
              ))}
            </div>
          )}
        </FilterSection>

        {/* Company Size */}
        <FilterSection title="Company Size (Headcount)" count={filters.company_headcount_range?.length ?? 0}>
          <div className="flex flex-wrap gap-2">
            {HEADCOUNT_RANGES.map(r => (
              <ToggleChip key={r} label={r} active={(filters.company_headcount_range ?? []).includes(r)} onClick={() => toggleArray("company_headcount_range", r)} />
            ))}
          </div>
        </FilterSection>

        {/* Industry */}
        <FilterSection title="Industry" count={(filters.company_industry?.include?.length ?? 0)}>
          <div className="flex flex-wrap gap-2 mb-3">
            {POPULAR_INDUSTRIES.map(ind => (
              <ToggleChip key={ind} label={ind} active={(filters.company_industry?.include ?? []).includes(ind)} onClick={() => toggleInclude("company_industry", ind)} />
            ))}
          </div>
          <div className="flex gap-2">
            <input className={cn(inp, "flex-1")} placeholder="Add custom industry..."
              onKeyDown={e => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) { addToInclude("company_industry", "include", v); (e.target as HTMLInputElement).value = ""; } } }} />
          </div>
        </FilterSection>

        {/* Funding */}
        <FilterSection title="Funding Stage" count={(filters.company_funding?.stage?.length ?? 0)}>
          <div className="flex flex-wrap gap-2">
            {FUNDING_STAGES.map(s => (
              <ToggleChip key={s} label={s} active={(filters.company_funding?.stage ?? []).includes(s)} onClick={() => {
                const arr = filters.company_funding?.stage ?? [];
                update("company_funding", { ...filters.company_funding, stage: arr.includes(s) ? arr.filter(v => v !== s) : [...arr, s] });
              }} />
            ))}
          </div>
        </FilterSection>

        {/* Company Type */}
        <FilterSection title="Company Type" count={filters.company_type?.length ?? 0}>
          <div className="flex flex-wrap gap-2">
            {COMPANY_TYPES.map(t => (
              <ToggleChip key={t} label={t} active={(filters.company_type ?? []).includes(t)} onClick={() => toggleArray("company_type", t)} />
            ))}
          </div>
        </FilterSection>

        {/* Technology Stack */}
        <FilterSection title="Tech Stack" count={(filters.company_technology?.include?.length ?? 0)}>
          <div className="flex flex-wrap gap-2 mb-3">
            {POPULAR_TECHNOLOGIES.filter(t => !(filters.company_technology?.include ?? []).includes(t)).map(t => (
              <button key={t} onClick={() => addToInclude("company_technology", "include", t)}
                className="text-[11px] px-2.5 py-1 rounded-xl border border-[var(--border)] hover:border-brand-500/30 hover:bg-brand-500/5 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                + {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={cn(inp, "flex-1")} placeholder="Add technology..." value={techInput} onChange={e => setTechInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && techInput.trim()) { addToInclude("company_technology", "include", techInput.trim()); setTechInput(""); } }} />
            <button onClick={() => { if (techInput.trim()) { addToInclude("company_technology", "include", techInput.trim()); setTechInput(""); } }}
              className="p-2.5 rounded-xl border border-[var(--border)] hover:border-brand-500/40 text-[var(--muted)] hover:text-brand-400">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {(filters.company_technology?.include?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {filters.company_technology!.include!.map(t => (
                <Chip key={t} label={t} onRemove={() => removeFromInclude("company_technology", "include", t)} />
              ))}
            </div>
          )}
        </FilterSection>

        {/* Keywords */}
        <FilterSection title="Company Keywords" count={(filters.company_keywords?.include?.length ?? 0)}>
          <div className="flex gap-2">
            <input className={cn(inp, "flex-1")} placeholder="e.g. saas, b2b, enterprise..." value={keyword} onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && keyword.trim()) { addToInclude("company_keywords", "include", keyword.trim()); setKeyword(""); } }} />
            <button onClick={() => { if (keyword.trim()) { addToInclude("company_keywords", "include", keyword.trim()); setKeyword(""); } }}
              className="p-2.5 rounded-xl border border-[var(--border)] hover:border-brand-500/40 text-[var(--muted)] hover:text-brand-400">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {(filters.company_keywords?.include?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {filters.company_keywords!.include!.map(k => (
                <Chip key={k} label={k} onRemove={() => removeFromInclude("company_keywords", "include", k)} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer select-none">
              <input type="checkbox" checked={filters.company_keywords?.include_all ?? false}
                onChange={e => update("company_keywords", { ...filters.company_keywords, include_all: e.target.checked })}
                className="rounded" />
              Match ALL keywords (AND)
            </label>
          </div>
        </FilterSection>

        {/* Headcount Growth */}
        <FilterSection title="Headcount Growth" count={filters.company_headcount_growth ? 1 : 0}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Timeframe</label>
              <select className={inp}
                value={filters.company_headcount_growth?.timeframe_month ?? ""}
                onChange={e => update("company_headcount_growth", e.target.value ? { ...filters.company_headcount_growth, timeframe_month: Number(e.target.value) as any } : undefined)}>
                <option value="">—</option>
                {[3, 6, 12, 24].map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Min %</label>
              <input type="number" placeholder="0" className={inp}
                value={filters.company_headcount_growth?.min ?? ""}
                onChange={e => update("company_headcount_growth", { ...filters.company_headcount_growth, timeframe_month: filters.company_headcount_growth?.timeframe_month ?? 12, min: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] mb-1.5 block">Max %</label>
              <input type="number" placeholder="100" className={inp}
                value={filters.company_headcount_growth?.max ?? ""}
                onChange={e => update("company_headcount_growth", { ...filters.company_headcount_growth, timeframe_month: filters.company_headcount_growth?.timeframe_month ?? 12, max: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </div>
        </FilterSection>

        {/* Job Postings */}
        <FilterSection title="Job Postings" count={[filters.company_job_posting_hiring_for?.length, filters.company_job_posting_quantity].filter(Boolean).length}>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1.5 block">Hiring For (job titles)</label>
            <div className="flex gap-2">
              <input className={cn(inp, "flex-1")} placeholder="e.g. Software Engineer..." value={jobPostingTitle} onChange={e => setJobPostingTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && jobPostingTitle.trim()) { update("company_job_posting_hiring_for", [...(filters.company_job_posting_hiring_for ?? []), jobPostingTitle.trim()]); setJobPostingTitle(""); } }} />
              <button onClick={() => { if (jobPostingTitle.trim()) { update("company_job_posting_hiring_for", [...(filters.company_job_posting_hiring_for ?? []), jobPostingTitle.trim()]); setJobPostingTitle(""); } }}
                className="p-2.5 rounded-xl border border-[var(--border)] hover:border-brand-500/40 text-[var(--muted)] hover:text-brand-400">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {(filters.company_job_posting_hiring_for?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {filters.company_job_posting_hiring_for!.map(t => (
                  <Chip key={t} label={t} onRemove={() => update("company_job_posting_hiring_for", filters.company_job_posting_hiring_for!.filter(v => v !== t))} />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1.5 block">Active Job Postings (count range)</label>
            <div className="flex gap-3">
              <input type="number" placeholder="Min" min={0} className={cn(inp, "flex-1")}
                value={(filters as any).company_job_posting_quantity?.min ?? ""}
                onChange={e => update("company_job_posting_quantity" as any, { ...(filters as any).company_job_posting_quantity, min: e.target.value ? Number(e.target.value) : undefined })}
              />
              <input type="number" placeholder="Max" min={0} className={cn(inp, "flex-1")}
                value={(filters as any).company_job_posting_quantity?.max ?? ""}
                onChange={e => update("company_job_posting_quantity" as any, { ...(filters as any).company_job_posting_quantity, max: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </div>
        </FilterSection>

      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-raised)] flex-shrink-0 flex items-center justify-between">
        <div className="text-xs text-[var(--muted)]">
          <span className="font-semibold text-[var(--foreground)]">{personFiltersCount + companyFiltersCount}</span> active filter groups
        </div>
        <div className="flex gap-3">
          {onClose && <button onClick={onClose} className="px-4 py-2.5 text-sm border border-[var(--border)] rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Cancel</button>}
          {onApply && (
            <button onClick={onApply} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold">
              Apply & Search →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
