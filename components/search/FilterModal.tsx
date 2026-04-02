"use client";

/**
 * components/search/FilterModal.tsx — Juicebox-parity Edition
 *
 * Categories (matching Juicebox sidebar order):
 *   1. General    → experience, recently_changed_jobs, connections, max_per_company
 *   2. Locations  → region (geo_distance radius), past_regions, exclude_regions
 *   3. Job        → titles, exclude_titles, past_titles, seniority, function_category, tenure
 *   4. Company    → company_names, exclude_companies, company_type, headcount, HQ, verified_email
 *   5. Industry   → company_industries, exclude_industries
 *   6. Funding    → company_funding_min/max, company_domains
 *   7. Skills     → skills[], keywords[]
 *   8. Education  → school, degree, field_of_study, grad_year, profile_language, languages
 *   9. Boolean    → boolean_expression, full_name, headline
 */

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import {
  X, Search as SearchIcon, Check, MapPin, Briefcase,
  Building2, Sliders, GraduationCap, Wrench,
  User, DollarSign, Settings, Type, Globe, Mail,
} from "lucide-react";
import { CrustDataAutocomplete } from "./CrustDataAutocomplete";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useFilterState } from "@/lib/hooks/useFilterState";
import { useSearchStore } from "@/lib/store/search-store";
import type { CrustDataFilterState, TitleMode } from "@/lib/crustdata/types";


// ─── Statics ──────────────────────────────────────────────────────────────────

const SENIORITIES = [
  "Owner / Partner", "CXO", "Vice President", "Director",
  "Experienced Manager", "Entry Level Manager", "Strategic",
  "Senior", "Entry Level", "In Training",
];

const FUNCTION_CATEGORIES = [
  "Accounting", "Administrative", "Arts and Design", "Business Development",
  "Community and Social Services", "Consulting", "Education", "Engineering",
  "Entrepreneurship", "Finance", "Healthcare Services", "Human Resources",
  "Information Technology", "Legal", "Marketing", "Media and Communication",
  "Military and Protective Services", "Operations", "Product Management",
  "Program and Project Management", "Purchasing", "Quality Assurance",
  "Real Estate", "Research", "Sales", "Customer Success and Support",
];

const HEADCOUNT_RANGES = [
  "Self-employed", "1-10", "11-50", "51-200", "201-500",
  "501-1,000", "1,001-5,000", "5,001-10,000", "10,001+",
];

// Ordered indices for cumulative-upward display logic
const HEADCOUNT_ORDER_IDX: Record<string, number> = Object.fromEntries(
  HEADCOUNT_RANGES.map((r, i) => [r, i])
);

const DEGREE_LEVELS = [
  "High School / Secondary",
  "Diploma / Associate's",
  "Bachelor's",
  "Postgraduate Diploma (PGD)",
  "Master's",
  "MBA",
  "PhD / Doctorate",
  "Professional Qualification",
];

// Grouped field-of-study options for structured selection
const FIELD_OF_STUDY_GROUPS: Record<string, string[]> = {
  "Architecture & Design": [
    "Architecture", "Urban Planning", "Interior Design",
    "Landscape Architecture", "Industrial Design", "Urban Design",
  ],
  "Engineering": [
    "Civil Engineering", "Mechanical Engineering", "Electrical Engineering",
    "Chemical Engineering", "Computer Science & Engineering",
    "Structural Engineering", "Environmental Engineering",
  ],
  "Business": [
    "Business Administration", "Finance", "Marketing", "Economics",
    "Human Resources", "Supply Chain Management", "Accounting",
  ],
  "Technology": [
    "Computer Science", "Information Technology", "Data Science",
    "Artificial Intelligence", "Cybersecurity", "Software Engineering",
  ],
  "Healthcare & Science": [
    "Medicine", "Pharmacy", "Life Sciences", "Biotechnology",
    "Nursing", "Psychology", "Public Health",
  ],
  "Social Sciences & Law": [
    "Law", "Political Science", "Sociology", "Economics",
    "International Relations", "Journalism", "Mass Communication",
  ],
};


const COMPANY_TYPES = [
  "Privately Held", "Public Company", "Self Employed",
  "Non Profit", "Government Agency", "Educational Institution",
  "Partnership",
];

const PROFILE_LANGUAGES = [
  "Arabic", "English", "Spanish", "Portuguese", "Chinese", "French",
  "Italian", "Russian", "German", "Dutch", "Turkish", "Polish",
  "Korean", "Japanese", "Romanian", "Swedish",
];

const RADIUS_STEPS = [10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 500];

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "general",   label: "General",         icon: Settings },
  { id: "locations", label: "Locations",        icon: MapPin },
  { id: "job",       label: "Job",              icon: Briefcase },
  { id: "company",   label: "Company",          icon: Building2 },
  { id: "industry",  label: "Industry",         icon: Building2 },
  { id: "funding",   label: "Funding & Revenue",icon: DollarSign },
  { id: "skills",    label: "Skills & Keywords",icon: Wrench },
  { id: "education", label: "Education",        icon: GraduationCap },
  { id: "boolean",   label: "Boolean & Name",   icon: Type },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">
        {children}
      </span>
      {note && <span className="text-xs text-[#9CA3AF]">{note}</span>}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-[#374151]">{children}</label>
  );
}

function NumberInput({
  placeholder, value, onChange, min, max
}: { placeholder: string; value?: number; onChange: (v: number | undefined) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      placeholder={placeholder}
      value={value ?? ""}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="w-full rounded-lg border border-[#E8ECFF] bg-white px-3 py-2 text-sm text-[#0F1629] placeholder:text-[#9CA3AF] transition-all focus:border-[#4C6DFD] focus:outline-none focus:ring-2 focus:ring-[#4C6DFD]/15"
    />
  );
}

function TextInput({
  placeholder, value, onChange
}: { placeholder: string; value?: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[#E8ECFF] bg-white px-3 py-2 text-sm text-[#0F1629] placeholder:text-[#9CA3AF] transition-all focus:border-[#4C6DFD] focus:outline-none focus:ring-2 focus:ring-[#4C6DFD]/15"
    />
  );
}

function ChipToggle({
  label, active, onClick
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "bg-[#4C6DFD] text-white shadow-[0_0_12px_rgba(76,109,253,0.3)]"
          : "bg-white border border-[#E8ECFF] text-[#374151] hover:border-[#4C6DFD] hover:text-[#4C6DFD]"
      )}
    >
      {active && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

function Toggle({
  label, description, value, onChange
}: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div
        onClick={() => onChange(!value)}
        className={cn(
          "relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-all duration-200",
          value ? "bg-[#4C6DFD]" : "bg-[#E8ECFF]"
        )}
      >
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
          value ? "translate-x-5" : "translate-x-0.5"
        )} />
      </div>
      <div>
        <span className="text-sm text-[#374151]">{label}</span>
        {description && <p className="mt-0.5 text-xs text-[#9CA3AF]">{description}</p>}
      </div>
    </label>
  );
}

function TagInput({
  tags, onAdd, onRemove, placeholder, suggestions = [], loading = false
}: {
  tags: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
  suggestions?: string[];
  loading?: boolean;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const v = input.trim();
      if (v && !tags.includes(v)) { onAdd(v); }
      setInput("");
      setShowSuggestions(false);
    }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div className={cn(
        "flex min-h-[40px] flex-wrap gap-1.5 rounded-lg border bg-white px-3 py-2 transition-all",
        "border-[#E8ECFF] focus-within:border-[#4C6DFD] focus-within:ring-2 focus-within:ring-[#4C6DFD]/15"
      )}>
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-medium text-[#4C6DFD]"
          >
            {t}
            <button
              type="button"
              onClick={() => onRemove(t)}
              className="ml-0.5 text-[#4C6DFD]/60 hover:text-[#4C6DFD]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(e.target.value.length >= 2);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onFocus={() => input.length >= 2 && setShowSuggestions(true)}
          placeholder={tags.length === 0 ? placeholder : "Add more..."}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-[#0F1629] placeholder:text-[#9CA3AF] focus:outline-none"
        />
        {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4C6DFD] border-t-transparent" />}
      </div>

      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-[#E8ECFF] bg-white shadow-[0_8px_32px_rgba(76,109,253,0.12)]"
          >
            {suggestions.filter((s) => !tags.includes(s)).slice(0, 8).map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={() => {
                  onAdd(s);
                  setInput("");
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-[#374151] hover:bg-[#F8F9FF] hover:text-[#4C6DFD]"
              >
                <SearchIcon className="mr-2 h-3 w-3 text-[#9CA3AF]" />
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Section Components ───────────────────────────────────────────────────────

import { RankingPrioritySelector, RankingCriterion } from "./RankingPrioritySelector";

function GeneralSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  return (
    <div className="space-y-5">
      <div>
        <RankingPrioritySelector 
          priorityVars={(filters.ranking_priority as RankingCriterion[]) || ["titles", "skills", "experience", "location"]}
          onChange={(newPriority) => setFilter("ranking_priority", newPriority)}
        />
      </div>

      <div className="pt-2">
        <SectionTitle>Years of Experience</SectionTitle>
        <div className="flex items-center gap-3">
          <NumberInput
            placeholder="Min"
            value={filters.experience_min}
            onChange={(v) => setFilter("experience_min", v)}
            min={0} max={40}
          />
          <span className="text-[#9CA3AF]">–</span>
          <NumberInput
            placeholder="Max"
            value={filters.experience_max}
            onChange={(v) => setFilter("experience_max", v)}
            min={0} max={40}
          />
          <span className="text-xs text-[#9CA3AF]">years</span>
        </div>
      </div>

      <div>
        <SectionTitle>Activity Signals</SectionTitle>
        <div className="space-y-3">
          <Toggle
            label="Recently Changed Jobs"
            description="Changed jobs in the last 90 days"
            value={!!filters.recently_changed_jobs}
            onChange={(v) => setFilter("recently_changed_jobs", v || undefined as unknown as boolean)}
          />
        </div>
      </div>

      <div>
        <SectionTitle>Min Profile Connections</SectionTitle>
        <NumberInput
          placeholder="e.g. 500"
          value={filters.num_connections_min}
          onChange={(v) => setFilter("num_connections_min", v)}
          min={0}
        />
      </div>

      <div>
        <SectionTitle>Max per Company</SectionTitle>
        <NumberInput
          placeholder="e.g. 3"
          value={filters.max_per_company}
          onChange={(v) => setFilter("max_per_company", v)}
          min={1} max={50}
        />
        <p className="mt-1 text-xs text-[#9CA3AF]">Limit candidates from the same company</p>
      </div>
    </div>
  );
}

function LocationsSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  const radiusKm = filters.radius_km ?? 50;

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle note="(geo-distance radius search)">Current Location</SectionTitle>
        <CrustDataAutocomplete
          fieldType="region"
          label=""
          value={filters.regions ?? (filters.region ? [filters.region] : [])}
          onChange={(v) => {
            setFilter("regions", v);
            setFilter("region", v.length > 0 ? v[0] : undefined);
          }}
          placeholder="e.g. San Francisco, California, United States"
          maxValues={5}
        />
      </div>

      <div>
        <FieldLabel>Search Radius</FieldLabel>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={RADIUS_STEPS.length - 1}
            value={RADIUS_STEPS.indexOf(radiusKm) === -1 ? 4 : RADIUS_STEPS.indexOf(radiusKm)}
            onChange={(e) => setFilter("radius_km", RADIUS_STEPS[Number(e.target.value)])}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#E8ECFF] accent-[#4C6DFD]"
          />
          <span className="min-w-[70px] rounded-full bg-[#EEF2FF] px-3 py-1 text-center text-xs font-semibold text-[#4C6DFD]">
            {radiusKm} km
          </span>
        </div>
      </div>

      <div>
        <SectionTitle>Past Locations</SectionTitle>
        <CrustDataAutocomplete
          fieldType="region"
          label=""
          value={filters.past_regions ?? []}
          onChange={(v) => setFilter("past_regions", v)}
          placeholder="e.g. London, United Kingdom"
          maxValues={5}
        />
      </div>

      <div>
        <SectionTitle>Exclude Regions</SectionTitle>
        <CrustDataAutocomplete
          fieldType="region"
          label=""
          value={filters.exclude_regions ?? []}
          onChange={(v) => setFilter("exclude_regions", v)}
          placeholder="Regions to avoid..."
          maxValues={5}
        />
      </div>
    </div>
  );
}

// ─── Title Mode Selector ──────────────────────────────────────────────────────

const TITLE_MODES: { id: TitleMode; label: string; description: string }[] = [
  {
    id: "current_only",
    label: "Current Only",
    description: "Find people who currently hold these job titles",
  },
  {
    id: "current_recent",
    label: "Current + Recent",
    description: "Find people holding / who held these titles in the last 2 years",
  },
  {
    id: "current_and_past",
    label: "Current + Past",
    description: "Find people who held these titles at any point in their career",
  },
  {
    id: "nested_companies",
    label: "Nested with Companies",
    description: "Match titles only at the companies you've already selected",
  },
  {
    id: "funding_stage",
    label: "Funding Stage",
    description: "Match titles at companies in the funding range you've set",
  },
];

function TitleModeSelector({
  mode,
  onChange,
}: {
  mode: TitleMode;
  onChange: (m: TitleMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = TITLE_MODES.find((m) => m.id === mode) ?? TITLE_MODES[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Label row with mode toggle button */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">
          Job Titles
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
            open
              ? "border-[#4C6DFD] bg-[#EEF2FF] text-[#4C6DFD]"
              : "border-[#E8ECFF] bg-white text-[#374151] hover:border-[#4C6DFD] hover:text-[#4C6DFD]"
          )}
        >
          {selected.label}
          <svg
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 w-[340px] overflow-hidden rounded-2xl border border-[#E8ECFF] bg-white shadow-[0_12px_40px_rgba(76,109,253,0.15)]"
          >
            {TITLE_MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors",
                  i !== 0 && "border-t border-[#F3F4F6]",
                  m.id === selected.id
                    ? "bg-[#EEF2FF]"
                    : "hover:bg-[#F8F9FF]"
                )}
              >
                <span
                  className={cn(
                    "text-sm font-semibold",
                    m.id === selected.id ? "text-[#4C6DFD]" : "text-[#111827]"
                  )}
                >
                  {m.label}
                </span>
                <span className="text-xs text-[#6B7280]">{m.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Section Components ───────────────────────────────────────────────────────

function JobSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  const titleMode: TitleMode = filters.title_mode ?? "current_only";

  return (
    <div className="space-y-6">
      <div>
        <TitleModeSelector
          mode={titleMode}
          onChange={(m) => setFilter("title_mode", m)}
        />
        <div className="mt-2">
          <CrustDataAutocomplete
            fieldType="title"
            label=""
            value={filters.titles ?? []}
            onChange={(v) => setFilter("titles", v)}
            placeholder="e.g. Software Engineer, Product Manager"
            maxValues={10}
          />
        </div>
        {/* Contextual hint for modes that narrow scope */}
        {titleMode === "nested_companies" && (
          <p className="mt-1.5 text-xs text-[#4C6DFD]">
            ✦ Titles will be matched within the companies you selected in the Company tab.
          </p>
        )}
        {titleMode === "funding_stage" && (
          <p className="mt-1.5 text-xs text-[#4C6DFD]">
            ✦ Titles will be matched at companies within the funding range set in Funding &amp; Revenue.
          </p>
        )}
      </div>

      <div>
        <SectionTitle>Exclude Titles</SectionTitle>
        <CrustDataAutocomplete
          fieldType="title"
          label=""
          value={filters.exclude_titles ?? []}
          onChange={(v) => setFilter("exclude_titles", v)}
          placeholder="Titles to exclude..."
          maxValues={5}
        />
      </div>

      <div>
        <SectionTitle>Past Job Titles</SectionTitle>
        <CrustDataAutocomplete
          fieldType="title"
          label=""
          value={filters.past_titles ?? []}
          onChange={(v) => setFilter("past_titles", v)}
          placeholder="e.g. Intern, Junior Developer"
          maxValues={10}
        />
      </div>

      <div>
        <SectionTitle>Seniority Level</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {SENIORITIES.map((s) => (
            <ChipToggle
              key={s}
              label={s}
              active={(filters.seniority ?? []).includes(s)}
              onClick={() => {
                const current = filters.seniority ?? [];
                setFilter(
                  "seniority",
                  current.includes(s) ? current.filter((x) => x !== s) : [...current, s]
                );
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Job Function / Role</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {FUNCTION_CATEGORIES.map((f) => (
            <ChipToggle
              key={f}
              label={f}
              active={(filters.function_category ?? []).includes(f)}
              onClick={() => {
                const current = filters.function_category ?? [];
                setFilter(
                  "function_category",
                  current.includes(f) ? current.filter((x) => x !== f) : [...current, f]
                );
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <SectionTitle>Time at Current Company</SectionTitle>
          <div className="flex items-center gap-2">
            <NumberInput
              placeholder="Min yrs"
              value={filters.years_at_company_min}
              onChange={(v) => setFilter("years_at_company_min", v)}
              min={0}
            />
            <span className="text-[#9CA3AF]">–</span>
            <NumberInput
              placeholder="Max yrs"
              value={filters.years_at_company_max}
              onChange={(v) => setFilter("years_at_company_max", v)}
              min={0}
            />
          </div>
        </div>
        <div>
          <SectionTitle>Time in Current Role</SectionTitle>
          <div className="flex items-center gap-2">
            <NumberInput
              placeholder="Min yrs"
              value={filters.years_at_current_role_min}
              onChange={(v) => setFilter("years_at_current_role_min", v)}
              min={0}
            />
            <span className="text-[#9CA3AF]">–</span>
            <NumberInput
              placeholder="Max yrs"
              value={filters.years_at_current_role_max}
              onChange={(v) => setFilter("years_at_current_role_max", v)}
              min={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanySection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  const matchMode = filters.company_match_mode ?? "strict";

  return (
    <div className="space-y-6">
      {/* Include Companies with intent toggle */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6B7280]">
            Include Companies
          </span>
          {/* Intent mode toggle */}
          <div className="flex rounded-full border border-[#E8ECFF] overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilter("company_match_mode", "strict")}
              className={cn(
                "px-3 py-1.5 transition-all",
                matchMode === "strict"
                  ? "bg-[#4C6DFD] text-white"
                  : "bg-white text-[#6B7280] hover:bg-[#EEF2FF] hover:text-[#4C6DFD]"
              )}
            >
              Strict
            </button>
            <button
              type="button"
              onClick={() => setFilter("company_match_mode", "boost")}
              className={cn(
                "px-3 py-1.5 border-l border-[#E8ECFF] transition-all",
                matchMode === "boost"
                  ? "bg-[#4C6DFD] text-white"
                  : "bg-white text-[#6B7280] hover:bg-[#EEF2FF] hover:text-[#4C6DFD]"
              )}
            >
              Boost
            </button>
          </div>
        </div>
        {/* Mode explanation banner */}
        <div className={cn(
          "mb-3 rounded-xl border px-4 py-2.5 text-xs leading-relaxed transition-all",
          matchMode === "strict"
            ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4C6DFD]"
            : "border-[#D1FAE5] bg-[#ECFDF5] text-[#059669]"
        )}>
          {matchMode === "strict" ? (
            <>
              <strong>Strict mode:</strong> Search returns <em>only</em> candidates currently employed at these companies.
            </>
          ) : (
            <>
              <strong>Boost mode:</strong> Search returns all relevant candidates, but those from these companies are ranked higher.
            </>
          )}
        </div>
        <CrustDataAutocomplete
          fieldType="company"
          label=""
          value={filters.company_names ?? []}
          onChange={(v) => setFilter("company_names", v)}
          placeholder="e.g. Google, Microsoft, Infosys"
          maxValues={10}
        />
      </div>

      <div>
        <SectionTitle>Exclude Companies</SectionTitle>
        <CrustDataAutocomplete
          fieldType="company"
          label=""
          value={filters.exclude_company_names ?? []}
          onChange={(v) => setFilter("exclude_company_names", v)}
          placeholder="Companies to avoid..."
          maxValues={5}
        />
      </div>

      <div>
        <SectionTitle>Company HQ Location</SectionTitle>
        <CrustDataAutocomplete
          fieldType="region"
          label=""
          value={filters.company_hq_location ?? []}
          onChange={(v) => setFilter("company_hq_location", v)}
          placeholder="e.g. United States, India"
          maxValues={3}
        />
      </div>

      {/* Headcount — cumulative-upward selection */}
      <div>
        <div className="mb-3">
          <SectionTitle>Company Size (Headcount)</SectionTitle>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">
            Selecting a size automatically <strong>includes all larger companies</strong> too — this is a minimum floor, not a restriction.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {HEADCOUNT_RANGES.map((h) => {
            const selectedRanges = filters.company_headcount_range ?? [];
            // A range is "explicitly selected" if the user clicked it
            const isExplicitlySelected = selectedRanges.includes(h);
            // A range is "auto-included" if it is above the lowest explicitly-selected band
            const lowestSelectedIdx = selectedRanges.length > 0
              ? Math.min(...selectedRanges.map((r) => HEADCOUNT_ORDER_IDX[r] ?? 999))
              : 999;
            const thisIdx = HEADCOUNT_ORDER_IDX[h] ?? 0;
            const isAutoIncluded = !isExplicitlySelected && thisIdx > lowestSelectedIdx;

            return (
              <button
                key={h}
                type="button"
                onClick={() => {
                  // Toggle: if it's already explicitly selected, remove it
                  if (isExplicitlySelected) {
                    const next = selectedRanges.filter((x) => x !== h);
                    setFilter("company_headcount_range", next);
                  } else {
                    // Add it — the floor logic in filter-builder handles expansion
                    setFilter("company_headcount_range", [...selectedRanges, h]);
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 border",
                  isExplicitlySelected
                    ? "bg-[#4C6DFD] text-white border-[#4C6DFD] shadow-[0_0_12px_rgba(76,109,253,0.3)]"
                    : isAutoIncluded
                      ? "bg-[#EEF2FF] text-[#4C6DFD] border-[#C7D2FE] opacity-60"
                      : "bg-white border-[#E8ECFF] text-[#374151] hover:border-[#4C6DFD] hover:text-[#4C6DFD]"
                )}
              >
                {isExplicitlySelected && <Check className="h-3 w-3" />}
                {isAutoIncluded && <span className="text-[#4C6DFD]/70 font-normal">✓</span>}
                {h}
              </button>
            );
          })}
        </div>
        {(filters.company_headcount_range ?? []).length > 0 && (
          <p className="mt-2 text-[11px] text-[#4C6DFD]">
            ✦ Also automatically includes all larger company sizes above your selection.
          </p>
        )}
      </div>

      <div>
        <SectionTitle>Company Type</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {COMPANY_TYPES.map((t) => (
            <ChipToggle
              key={t}
              label={t}
              active={(filters.company_type ?? []).includes(t)}
              onClick={() => {
                const current = filters.company_type ?? [];
                setFilter(
                  "company_type",
                  current.includes(t) ? current.filter((x) => x !== t) : [...current, t]
                );
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Contact Quality</SectionTitle>
        <Toggle
          label="Verified Business Email Only"
          description="Only show candidates with a verified work email address"
          value={!!filters.verified_business_email}
          onChange={(v) => setFilter("verified_business_email", v || undefined as unknown as boolean)}
        />
      </div>
    </div>
  );
}

function IndustrySection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionTitle note="(powered by CrustData autocomplete)">Industries to Include</SectionTitle>
        <CrustDataAutocomplete
          fieldType="industry"
          label=""
          value={filters.company_industries ?? []}
          onChange={(v) => setFilter("company_industries", v)}
          placeholder="e.g. Software Development, Financial Technology"
          maxValues={10}
        />
      </div>

      <div>
        <SectionTitle>Exclude Industries</SectionTitle>
        <CrustDataAutocomplete
          fieldType="industry"
          label=""
          value={filters.exclude_industries ?? []}
          onChange={(v) => setFilter("exclude_industries", v)}
          placeholder="Industry to exclude"
          maxValues={5}
        />
      </div>
    </div>
  );
}

function FundingSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <SectionTitle>Min Funding</SectionTitle>
          <div className="flex items-center gap-2">
            <NumberInput
              placeholder="e.g. 10"
              value={filters.company_funding_min}
              onChange={(v) => setFilter("company_funding_min", v)}
              min={0}
            />
            <span className="text-xs text-[#9CA3AF] whitespace-nowrap">M USD</span>
          </div>
        </div>
        <div>
          <SectionTitle>Max Funding</SectionTitle>
          <div className="flex items-center gap-2">
            <NumberInput
              placeholder="e.g. 500"
              value={filters.company_funding_max}
              onChange={(v) => setFilter("company_funding_max", v)}
              min={0}
            />
            <span className="text-xs text-[#9CA3AF] whitespace-nowrap">M USD</span>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Company Domains</SectionTitle>
        <TagInput
          tags={filters.company_domains ?? []}
          onAdd={(v) => setFilter("company_domains", [...(filters.company_domains ?? []), v])}
          onRemove={(v) => setFilter("company_domains", (filters.company_domains ?? []).filter((x) => x !== v))}
          placeholder="e.g. stripe.com, linear.app"
        />
        <p className="mt-1 text-xs text-[#9CA3AF]">Match by exact company website domain for high precision</p>
      </div>
    </div>
  );
}

function SkillsSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2">
          <SectionTitle note="(profile skills)">Required Skills</SectionTitle>
        </div>
        <CrustDataAutocomplete
          fieldType="skill"
          label=""
          value={filters.skills ?? []}
          onChange={(v) => setFilter("skills", v)}
          placeholder="e.g. ISO 9001, AutoCAD, Six Sigma, Python"
          maxValues={15}
        />
        <p className="mt-1.5 text-xs text-[#9CA3AF]">
          Matched against the <code>skills[]</code> field on each person&apos;s public profile.
        </p>
      </div>

      <div>
        <SectionTitle note="(fuzzy match in headline + skills)">Keywords</SectionTitle>
        <TagInput
          tags={filters.keywords ?? []}
          onAdd={(v) => setFilter("keywords", [...(filters.keywords ?? []), v])}
          onRemove={(v) => setFilter("keywords", (filters.keywords ?? []).filter((x) => x !== v))}
          placeholder="e.g. generative AI, MEDDPICC, B2B SaaS"
        />
        <p className="mt-1.5 text-xs text-[#9CA3AF]">
          Fuzzy search across headline and skills. Broader than exact skill matching.
        </p>
      </div>
    </div>
  );
}

function EducationSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  const [fieldSearch, setFieldSearch] = useState("");
  const [showFieldDropdown, setShowFieldDropdown] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);

  // Close field-of-study dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) setShowFieldDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedDegrees = filters.education_degree ?? [];
  const selectedFields = filters.education_field_of_study ?? [];

  // Filter groups by search query
  const filteredGroups = Object.entries(FIELD_OF_STUDY_GROUPS).reduce(
    (acc, [group, fields]) => {
      const q = fieldSearch.toLowerCase();
      const matched = fields.filter((f) => f.toLowerCase().includes(q));
      if (matched.length > 0) acc[group] = matched;
      return acc;
    },
    {} as Record<string, string[]>
  );

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Schools / Universities</SectionTitle>
        <CrustDataAutocomplete
          fieldType="school"
          label=""
          value={filters.education_school ?? []}
          onChange={(v) => setFilter("education_school", v)}
          placeholder="e.g. Harvard, IIT, Stanford"
          maxValues={5}
        />
      </div>

      {/* Degree Level — structured chip toggles */}
      <div>
        <SectionTitle note="(select all that apply)">
          Degree Level
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          {DEGREE_LEVELS.map((d) => (
            <ChipToggle
              key={d}
              label={d}
              active={selectedDegrees.includes(d)}
              onClick={() => {
                setFilter(
                  "education_degree",
                  selectedDegrees.includes(d)
                    ? selectedDegrees.filter((x) => x !== d)
                    : [...selectedDegrees, d]
                );
              }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[#9CA3AF]">
          e.g. selecting &quot;Master&apos;s&quot; matches M.Arch, M.Tech, MSc, ME and other postgraduate degrees.
        </p>
      </div>

      {/* Field of Study — grouped dropdown */}
      <div ref={fieldRef} className="relative">
        <SectionTitle>Field of Study</SectionTitle>
        {/* Selected fields as chips */}
        {selectedFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedFields.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-medium text-[#4C6DFD]"
              >
                {f}
                <button
                  type="button"
                  onClick={() => setFilter("education_field_of_study", selectedFields.filter((x) => x !== f))}
                  className="ml-0.5 text-[#4C6DFD]/60 hover:text-[#4C6DFD]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Search input */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-all cursor-text",
            showFieldDropdown ? "border-[#4C6DFD] ring-2 ring-[#4C6DFD]/15" : "border-[#E8ECFF]"
          )}
          onClick={() => setShowFieldDropdown(true)}
        >
          <SearchIcon className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0" />
          <input
            type="text"
            value={fieldSearch}
            onChange={(e) => { setFieldSearch(e.target.value); setShowFieldDropdown(true); }}
            onFocus={() => setShowFieldDropdown(true)}
            placeholder="e.g. Architecture, Computer Science, Finance..."
            className="flex-1 bg-transparent text-sm text-[#0F1629] placeholder:text-[#9CA3AF] focus:outline-none"
          />
        </div>
        {/* Grouped dropdown */}
        <AnimatePresence>
          {showFieldDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[#E8ECFF] bg-white shadow-[0_8px_32px_rgba(76,109,253,0.12)]"
            >
              {Object.entries(filteredGroups).map(([group, fields]) => (
                <div key={group}>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                    {group}
                  </div>
                  {fields.map((field) => {
                    const isSelected = selectedFields.includes(field);
                    return (
                      <button
                        key={field}
                        type="button"
                        onMouseDown={() => {
                          if (!isSelected) {
                            setFilter("education_field_of_study", [...selectedFields, field]);
                          }
                          setFieldSearch("");
                          setShowFieldDropdown(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between px-4 py-2 text-sm transition-colors",
                          isSelected
                            ? "bg-[#EEF2FF] text-[#4C6DFD]"
                            : "text-[#374151] hover:bg-[#F8F9FF] hover:text-[#4C6DFD]"
                        )}
                      >
                        <span>{field}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {Object.keys(filteredGroups).length === 0 && (
                <div className="px-4 py-4 text-center text-sm text-[#9CA3AF]">
                  No matches — type any field to add it as a custom entry
                </div>
              )}
              {/* Custom free-text entry */}
              {fieldSearch.trim().length >= 2 && !selectedFields.includes(fieldSearch.trim()) && (
                <button
                  type="button"
                  onMouseDown={() => {
                    setFilter("education_field_of_study", [...selectedFields, fieldSearch.trim()]);
                    setFieldSearch("");
                    setShowFieldDropdown(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-[#F3F4F6] px-4 py-3 text-sm text-[#4C6DFD] hover:bg-[#EEF2FF] transition-colors"
                >
                  <span className="font-medium">+ Add &quot;{fieldSearch.trim()}&quot;</span>
                  <span className="text-[#9CA3AF] text-xs">(custom entry)</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <SectionTitle>Graduation Year (Min)</SectionTitle>
          <NumberInput
            placeholder="e.g. 2015"
            value={filters.graduation_year_min}
            onChange={(v) => setFilter("graduation_year_min", v)}
            min={1970} max={2030}
          />
        </div>
        <div>
          <SectionTitle>Graduation Year (Max)</SectionTitle>
          <NumberInput
            placeholder="e.g. 2023"
            value={filters.graduation_year_max}
            onChange={(v) => setFilter("graduation_year_max", v)}
            min={1970} max={2030}
          />
        </div>
      </div>

      <div>
        <SectionTitle>Languages Spoken</SectionTitle>
        <TagInput
          tags={filters.languages ?? []}
          onAdd={(v) => setFilter("languages", [...(filters.languages ?? []), v])}
          onRemove={(v) => setFilter("languages", (filters.languages ?? []).filter((x) => x !== v))}
          placeholder="e.g. English, Spanish, Mandarin"
        />
      </div>

      <div>
        <SectionTitle>Profile Language</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {PROFILE_LANGUAGES.map((l) => (
            <ChipToggle
              key={l}
              label={l}
              active={(filters.profile_language ?? []).includes(l)}
              onClick={() => {
                const current = filters.profile_language ?? [];
                setFilter(
                  "profile_language",
                  current.includes(l) ? current.filter((x) => x !== l) : [...current, l]
                );
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BooleanSection({
  filters, setFilter
}: { filters: CrustDataFilterState; setFilter: ReturnType<typeof useFilterState>["setFilter"] }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Full Name</SectionTitle>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-[#9CA3AF] flex-shrink-0" />
          <TextInput
            placeholder="e.g. John Doe"
            value={filters.full_name ?? ""}
            onChange={(v) => setFilter("full_name", v || undefined)}
          />
        </div>
      </div>

      <div>
        <SectionTitle>Headline Contains</SectionTitle>
        <TextInput
          placeholder="e.g. ex-Google, YC founder, open to work"
          value={filters.headline ?? ""}
          onChange={(v) => setFilter("headline", v || undefined)}
        />
        <p className="mt-1 text-xs text-[#9CA3AF]">Fuzzy-matches against the person&apos;s headline and bio</p>
      </div>

      <div>
        <div className="mb-3 rounded-xl border border-[#E8ECFF] bg-[#F8F9FF] px-4 py-3">
          <p className="text-sm font-medium text-[#374151]">Advanced Boolean Search</p>
          <p className="mt-1 text-xs text-[#6B7280]">
            Search current title using AND/OR logic. Example:{" "}
            <code className="bg-white px-1 rounded">(Operations OR Logistics) AND Manager</code>
          </p>
        </div>
        <SectionTitle>Boolean Query</SectionTitle>
        <input
          type="text"
          value={filters.boolean_expression ?? ""}
          onChange={(e) => setFilter("boolean_expression", e.target.value || undefined)}
          placeholder="(Operations OR Fleet) AND Manager"
          className="w-full rounded-lg border border-[#E8ECFF] bg-white px-4 py-3 text-sm font-mono text-[#4C6DFD] placeholder:text-[#9CA3AF] transition-all focus:border-[#4C6DFD] focus:outline-none focus:ring-2 focus:ring-[#4C6DFD]/15"
        />
      </div>
    </div>
  );
}

// ─── Active filter summary chips ──────────────────────────────────────────────

// Strips admin suffixes and country for clean display: "Vadodara Taluka, Gujarat, India" → "Vadodara, Gujarat"
function formatRegionLabel(full: string): string {
  const ADMIN_RE = /\s+(taluka|district|tehsil|division|municipality|cantonment|township|block|mandal|nagar|rural)\b.*/i;
  const parts = full.split(",").map(p => p.trim());
  const cleanCity = parts[0].replace(ADMIN_RE, "").trim();
  return parts.length >= 2 ? `${cleanCity}, ${parts[1]}` : cleanCity;
}

function ActiveFilterBadges({ filters }: { filters: CrustDataFilterState }) {
  const chips: string[] = [];
  if (filters.titles?.length) chips.push(...filters.titles.slice(0, 2).map(t => `Title: ${t}`));
  if (filters.regions?.length) {
    const firstRegion = filters.regions[0];
    const restCount = filters.regions.length - 1;
    chips.push(`📍 ${formatRegionLabel(firstRegion)}${restCount > 0 ? ` +${restCount}` : ""}${filters.radius_km ? ` (${filters.radius_km}km)` : ""}`);
  } else if (filters.region) {
    chips.push(`📍 ${formatRegionLabel(filters.region)}${filters.radius_km ? ` (${filters.radius_km}km)` : ""}`);
  }
  if (filters.seniority?.length) chips.push(...filters.seniority.slice(0, 2));
  if (filters.company_industries?.length) chips.push(...filters.company_industries.slice(0, 1).map(i => `Industry: ${i}`));
  if (filters.company_names?.length) chips.push(...filters.company_names.slice(0, 1).map(c => `@ ${c}`));
  if (filters.skills?.length) chips.push(...filters.skills.slice(0, 2));
  if (filters.keywords?.length) chips.push(...filters.keywords.slice(0, 2).map(k => `🔑 ${k}`));
  if (filters.recently_changed_jobs) chips.push("Recently Changed Jobs");
  if (filters.verified_business_email) chips.push("Verified Email");
  if (filters.experience_min || filters.experience_max) {
    chips.push(`${filters.experience_min ?? 0}–${filters.experience_max ?? "∞"} yrs exp`);
  }

  if (chips.length === 0) return null;

  return (
    <div className="border-b border-[#F3F4F6] bg-[#F8F9FF] px-8 py-3 flex flex-wrap gap-1.5">
      {chips.slice(0, 8).map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center rounded-full bg-[#EEF2FF] border border-[#C7D2FE] px-2.5 py-0.5 text-[11px] font-medium text-[#4C6DFD]"
        >
          {chip}
        </span>
      ))}
      {chips.length > 8 && (
        <span className="text-[11px] text-[#9CA3AF] self-center">+{chips.length - 8} more</span>
      )}
    </div>
  );
}

// ─── Main FilterModal ─────────────────────────────────────────────────────────

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  onApply?: (filters: CrustDataFilterState) => void;
  initialFilters?: Partial<CrustDataFilterState>;
}

export function FilterModal({ open, onClose, onApply, initialFilters = {} }: FilterModalProps) {
  const { filters, setFilter, resetAll, getActiveFilterCount, activeCategories, toCrustDataPayload, fromCrustDataPayload } =
    useFilterState(initialFilters);
  const { accumulatedContext } = useSearchStore();

  useEffect(() => {
    if (open) {
      fromCrustDataPayload(initialFilters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [activeCategory, setActiveCategory] = useState<CategoryId>("general");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<CategoryId, HTMLDivElement | null>>({
    general: null,
    locations: null,
    job: null,
    company: null,
    industry: null,
    funding: null,
    skills: null,
    education: null,
    boolean: null,
  });

  const scrollToSection = (id: CategoryId) => {
    setActiveCategory(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let currentSection: CategoryId = "general";
      for (const cat of CATEGORIES) {
        const el = sectionRefs.current[cat.id];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top - containerTop <= 120) currentSection = cat.id;
        }
      }
      setActiveCategory(currentSection);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [open]);

  const handleApply = useCallback(() => {
    onApply?.(toCrustDataPayload());
    onClose();
  }, [toCrustDataPayload, onApply, onClose]);

  const activeCount = getActiveFilterCount();

  return (
    <AnimatePresence>
      {open && (
        <Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0F1629]/20 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="fixed inset-x-4 top-[5%] z-50 mx-auto flex h-[90vh] max-w-6xl overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(76,109,253,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left sidebar */}
            <div className="flex w-[220px] flex-shrink-0 flex-col border-r" style={{ background: "#F8F9FF", borderColor: "#E8ECFF" }}>
              <div className="border-b px-4 py-4" style={{ borderColor: "#E8ECFF" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[#0F1629]">Filters</h2>
                    {activeCount > 0 && (
                      <p className="text-xs text-[#4C6DFD]">{activeCount} active</p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-1.5 text-[#9CA3AF] hover:bg-[#E8ECFF] hover:text-[#374151]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <nav className="flex-1 overflow-y-auto py-2">
                {CATEGORIES.map(({ id, label, icon: Icon }) => {
                  const isActive = activeCategory === id;
                  type ActiveCatKey = keyof typeof activeCategories;
                  const hasFilters = id in activeCategories ? activeCategories[id as ActiveCatKey] : false;

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => scrollToSection(id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-all duration-150",
                        isActive
                          ? "bg-white text-[#4C6DFD] border-r-2 border-[#4C6DFD] shadow-[2px_0_10px_rgba(76,109,253,0.05)]"
                          : "text-[#6B7280] hover:bg-white/60 hover:text-[#374151]"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="flex-1 text-left">{label}</span>
                      {hasFilters && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#4C6DFD]" />
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="border-t p-4 space-y-2" style={{ borderColor: "#E8ECFF" }}>
                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full rounded-lg border border-[#E8ECFF] py-2 text-xs font-medium text-[#6B7280] hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-all"
                >
                  Clear All Filters
                </button>
              </div>
            </div>

            {/* Right content panel */}
            <div className="flex flex-1 flex-col overflow-hidden bg-white">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-8 py-4" style={{ borderColor: "#F3F4F6" }}>
                <div>
                  <h3 className="text-lg font-semibold text-[#0F1629]">
                    {CATEGORIES.find(c => c.id === activeCategory)?.label}
                  </h3>
                  {accumulatedContext.requirement_summary && (
                    <p className="mt-0.5 text-xs text-[#9CA3AF] truncate max-w-lg">
                      {accumulatedContext.requirement_summary}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleApply}
                  className="rounded-full bg-[#4C6DFD] px-6 py-2 text-sm font-semibold text-white transition-all hover:bg-[#3B5BDB] shadow-[0_4px_12px_rgba(76,109,253,0.2)]"
                >
                  Apply Filters {activeCount > 0 && `(${activeCount})`}
                </button>
              </div>

              {/* Active filter summary */}
              <ActiveFilterBadges filters={filters} />

              {/* Scrollable sections */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-8 py-6 space-y-12 overscroll-contain"
                style={{ willChange: "scroll-position", scrollBehavior: "auto" }}
              >
                {CATEGORIES.map(({ id, label }) => (
                  <div
                    key={id}
                    ref={(el) => { sectionRefs.current[id] = el; }}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-500"
                  >
                    <div className="mb-6 flex items-center gap-3 border-b pb-4" style={{ borderColor: "#F3F4F6" }}>
                      <h4 className="text-xl font-bold text-[#0F1629]">{label}</h4>
                    </div>

                    <div className="pl-1">
                      {id === "general"   && <GeneralSection  filters={filters} setFilter={setFilter} />}
                      {id === "locations" && <LocationsSection filters={filters} setFilter={setFilter} />}
                      {id === "job"       && <JobSection       filters={filters} setFilter={setFilter} />}
                      {id === "company"   && <CompanySection   filters={filters} setFilter={setFilter} />}
                      {id === "industry"  && <IndustrySection  filters={filters} setFilter={setFilter} />}
                      {id === "funding"   && <FundingSection   filters={filters} setFilter={setFilter} />}
                      {id === "skills"    && <SkillsSection    filters={filters} setFilter={setFilter} />}
                      {id === "education" && <EducationSection filters={filters} setFilter={setFilter} />}
                      {id === "boolean"   && <BooleanSection   filters={filters} setFilter={setFilter} />}
                    </div>
                  </div>
                ))}

                <div className="h-40" />
              </div>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}
