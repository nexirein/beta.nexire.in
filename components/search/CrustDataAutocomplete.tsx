"use client";
/**
 * components/search/CrustDataAutocomplete.tsx
 * Autocomplete input backed by CrustData realtime autocomplete API.
 *
 * Features:
 * - Debounced calls to /api/crustdata/autocomplete (200ms)
 * - Keyboard navigation (↑↓ Enter Escape)
 * - Multi-value chip selection
 * - fieldType: "title" | "region" | "company" | "skill" | "school"
 * - Displays brand-colored suggestion pills in dropdown
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, MapPin, Briefcase, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_ICONS = {
  title:   <Briefcase className="w-3 h-3 text-brand-400 flex-shrink-0" />,
  region:  <MapPin className="w-3 h-3 text-brand-400 flex-shrink-0" />,
  company: <Briefcase className="w-3 h-3 text-text-tertiary flex-shrink-0" />,
  industry:<Briefcase className="w-3 h-3 text-brand-400 flex-shrink-0" />,
  skill:   <Tag className="w-3 h-3 text-brand-400 flex-shrink-0" />,
  school:  <Tag className="w-3 h-3 text-text-tertiary flex-shrink-0" />,
};

const FIELD_PLACEHOLDER = {
  title:   "e.g. Software Engineer, Product Manager…",
  region:  "e.g. Mumbai, Bengaluru, Pune…",
  company: "e.g. Infosys, Google, HDFC…",
  industry:"e.g. Information Technology & Services, Finance…",
  skill:   "e.g. Python, SQL, Azure…",
  school:  "e.g. IIT Delhi, NIT, IIM…",
};

interface CrustDataAutocompleteProps {
  fieldType: "title" | "region" | "company" | "skill" | "school" | "industry";
  label: string;
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxValues?: number;
  className?: string;
}

export function CrustDataAutocomplete({
  fieldType,
  label,
  value,
  onChange,
  placeholder,
  maxValues = 5,
  className,
}: CrustDataAutocompleteProps) {
  const [inputVal, setInputVal] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/crustdata/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, fieldType }),
      });
      const data = await res.json();
      // Filter out already-selected values
      const filtered = (data.results as string[]).filter((r) => !value.includes(r));
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
      setActiveIdx(0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [fieldType, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputVal(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 200);
  };

  const addValue = (v: string) => {
    if (!value.includes(v) && value.length < maxValues) {
      onChange([...value, v]);
    }
    setInputVal("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeValue = (v: string) => {
    onChange(value.filter((x) => x !== v));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((p) => Math.min(p + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions[activeIdx]) {
        addValue(suggestions[activeIdx]);
      } else if (inputVal.trim()) {
        addValue(inputVal.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSuggestions([]);
    } else if (e.key === "Backspace" && inputVal === "" && value.length > 0) {
      removeValue(value[value.length - 1]);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        {label}
      </label>

      {/* Input container */}
      <div
        className="relative flex flex-wrap items-center gap-1.5 min-h-[42px] px-3 py-2 rounded-xl border border-gray-200 bg-white transition-all duration-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Selected value chips */}
        {value.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-medium"
          >
            {v}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeValue(v); }}
              className="text-brand-400 hover:text-brand-700 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}

        {/* Input */}
        {value.length < maxValues && (
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? (placeholder ?? FIELD_PLACEHOLDER[fieldType]) : "Add another..."}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-text-primary placeholder:text-gray-400 focus:outline-none"
          />
        )}

        {/* Loading indicator */}
        {loading && (
          <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
        )}
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="relative z-50 flex flex-col bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addValue(s); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors",
                i === activeIdx
                  ? "bg-brand-50 text-brand-700"
                  : "text-text-primary hover:bg-gray-50"
              )}
            >
              {FIELD_ICONS[fieldType]}
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hint */}
      {value.length >= maxValues && (
        <p className="text-[10px] text-text-tertiary">Max {maxValues} values selected</p>
      )}
    </div>
  );
}
