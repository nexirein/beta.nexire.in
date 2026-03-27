import React, { useState, useRef } from "react";
import { Check, Plus, Zap, SkipForward, Crosshair, Layers, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface WidgetOption {
  field: string;
  label: string;
  options: string[];
  recommended?: string;
}

interface WidgetRendererProps {
  widgetData: WidgetOption[];
  onSelectCallback: (selected: Record<string, string[]>) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

// Icons and descriptions for search_intent chips
const INTENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; borderColor: string; bg: string; description: string }> = {
  "Exact title only": {
    icon: <Crosshair className="w-4 h-4" />,
    color: "text-violet-600",
    borderColor: "group-hover:border-violet-400",
    bg: "group-hover:bg-violet-50/50",
    description: "Only profiles whose stated title is exactly this role",
  },
  "Similar titles too": {
    icon: <Layers className="w-4 h-4" />,
    color: "text-blue-600",
    borderColor: "group-hover:border-blue-400",
    bg: "group-hover:bg-blue-50/50",
    description: "This title + 3–4 closest synonyms professionals use in their profiles",
  },
  "Cast a wide net": {
    icon: <Globe className="w-4 h-4" />,
    color: "text-emerald-600",
    borderColor: "group-hover:border-emerald-400",
    bg: "group-hover:bg-emerald-50/50",
    description: "Full cluster of adjacent roles — best when talent pool is small",
  },
};

export function WidgetRenderer({ widgetData, onSelectCallback, onSkip, disabled }: WidgetRendererProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  // Track which custom additions just animated (for success feedback)
  const [justAdded, setJustAdded] = useState<Record<string, string | null>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!widgetData || widgetData.length === 0) return null;

  const autoGroup = widgetData.find((w) => w.field === "auto");
  const intentGroup = widgetData.find((w) => w.field === "search_intent");
  const regularGroups = widgetData.filter((w) => w.field !== "auto" && w.field !== "search_intent");

  const toggleSelection = (field: string, option: string) => {
    setSelections((prev) => {
      const current = prev[field] || [];
      const updated = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, [field]: updated };
    });
  };

  const addCustomOption = (field: string) => {
    const val = customInputs[field]?.trim();
    if (!val) return;
    toggleSelection(field, val);
    // Trigger success flash
    setJustAdded((prev) => ({ ...prev, [field]: val }));
    setTimeout(() => setJustAdded((prev) => ({ ...prev, [field]: null })), 1500);
    setCustomInputs((prev) => ({ ...prev, [field]: "" }));
    inputRefs.current[field]?.focus();
  };

  const handleConfirm = () => onSelectCallback(selections);

  const handleAutoFill = () => onSelectCallback({ auto: ["⚡ Auto-fill best options"] });

  // Search intent chips fire immediately (single-select, no "Apply" needed)
  const handleIntentSelect = (option: string) => {
    onSelectCallback({ search_intent: [option] });
  };

  const hasSelections = Object.values(selections).some((arr) => arr.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3 flex flex-col gap-3"
    >
      {/* ── Search intent (special: single-select, fires immediately) ── */}
      {intentGroup && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-0.5">{intentGroup.label}</span>
          <div className="flex flex-col gap-2">
            {intentGroup.options.map((opt) => {
              const cfg = INTENT_CONFIG[opt];
              const isRecommended = intentGroup.recommended === opt;

              // Recommended card gets a tinted border + background accent matching its color family
              const recommendedBase: Record<string, string> = {
                "Exact title only":   "border-violet-300 bg-violet-50/60 shadow-violet-100",
                "Similar titles too": "border-blue-300   bg-blue-50/60   shadow-blue-100",
                "Cast a wide net":    "border-emerald-300 bg-emerald-50/60 shadow-emerald-100",
              };
              const recommendedIcon: Record<string, string> = {
                "Exact title only":   "border-violet-200 bg-violet-100/60",
                "Similar titles too": "border-blue-200   bg-blue-100/60",
                "Cast a wide net":    "border-emerald-200 bg-emerald-100/60",
              };
              const recommendedBadge: Record<string, string> = {
                "Exact title only":   "bg-violet-100 text-violet-700 border-violet-200",
                "Similar titles too": "bg-blue-100   text-blue-700   border-blue-200",
                "Cast a wide net":    "bg-emerald-100 text-emerald-700 border-emerald-200",
              };

              const cardBase = isRecommended
                ? `border shadow-md ${recommendedBase[opt] ?? "border-brand-300 bg-brand-50/60"}`
                : `border border-gray-200 bg-white shadow-sm ${cfg?.borderColor ?? ""} ${cfg?.bg ?? ""}`;

              const iconBase = isRecommended
                ? `${recommendedIcon[opt] ?? "border-brand-200 bg-brand-100/60"} border`
                : "border border-gray-100 bg-gray-50 group-hover:border-current";

              return (
                <button
                  key={opt}
                  onClick={() => handleIntentSelect(opt)}
                  disabled={disabled}
                  className={`group flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-all disabled:opacity-40 ${cardBase}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${iconBase} ${cfg?.color ?? "text-gray-500"}`}>
                    {cfg?.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-bold transition-colors ${isRecommended ? (cfg?.color ?? "text-brand-700") : "text-gray-800 group-hover:text-gray-900"}`}>
                        {opt}
                      </span>
                      {isRecommended && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border tracking-wide ${recommendedBadge[opt] ?? "bg-brand-100 text-brand-700 border-brand-200"}`}>
                          Recommended
                        </span>
                      )}
                    </div>
                    {cfg?.description && (
                      <div className={`text-[11px] mt-0.5 leading-snug ${isRecommended ? "text-gray-500" : "text-gray-400"}`}>
                        {cfg.description}
                      </div>
                    )}
                  </div>
                  <div className={`ml-auto shrink-0 transition-opacity ${isRecommended ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${cfg?.color ?? "text-gray-400"}`}>
                      <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Regular chip groups ── */}
      {regularGroups.map((widget, idx) => {
        const selectedForField = selections[widget.field] || [];
        const customItems = selectedForField.filter(s => !widget.options.includes(s));

        return (
          <div key={idx} className="flex flex-col gap-2.5 p-4 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500">{widget.label}</span>
              {selectedForField.length > 0 && (
                <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full border border-brand-100">
                  {selectedForField.length} selected
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {widget.options.map((opt) => {
                const isSelected = selectedForField.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggleSelection(widget.field, opt)}
                    disabled={disabled}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-150 border ${
                      isSelected
                        ? "bg-brand-500 border-brand-400 text-white shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/60"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 shrink-0" />}
                    {opt}
                  </button>
                );
              })}

              {/* Custom-added chips (distinct style) */}
              {customItems.map((val) => (
                <button
                  key={val}
                  onClick={() => toggleSelection(widget.field, val)}
                  disabled={disabled}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-violet-500 border-violet-400 text-white border shadow-sm transition-all"
                >
                  <Check className="w-3 h-3 shrink-0" />
                  {val}
                </button>
              ))}
            </div>

            {/* Custom text input */}
            <div className={`flex items-center border rounded-xl bg-white transition-all overflow-hidden ${
              justAdded[widget.field]
                ? "border-emerald-400 ring-2 ring-emerald-400/20"
                : "border-gray-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/15"
            }`}>
              <AnimatePresence mode="wait">
                {justAdded[widget.field] ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-3 py-2 flex-1"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-[12px] text-emerald-600 font-medium">
                      &quot;{justAdded[widget.field]}&quot; added
                    </span>
                  </motion.div>
                ) : (
                  <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center flex-1 pl-3 pr-1 py-1">
                    <input
                      ref={(el) => { inputRefs.current[widget.field] = el; }}
                      type="text"
                      placeholder={`Type to add a custom ${widget.field === "job_titles" ? "title" : "option"}...`}
                      disabled={disabled}
                      value={customInputs[widget.field] || ""}
                      onChange={(e) => setCustomInputs((prev) => ({ ...prev, [widget.field]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomOption(widget.field);
                        }
                      }}
                      className="bg-transparent text-[12px] text-gray-700 flex-1 min-w-0 outline-none placeholder:text-gray-400"
                    />
                    <button
                      onClick={() => addCustomOption(widget.field)}
                      disabled={disabled || !customInputs[widget.field]?.trim()}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-30 transition-all shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}

      {/* ── Action row ── */}
      <div className="flex items-stretch gap-2 mt-1">
        {hasSelections && (
          <button
            onClick={handleConfirm}
            disabled={disabled}
            className="flex-1 px-4 py-2.5 bg-white border border-brand-200 text-brand-600 rounded-xl text-[13px] font-bold hover:bg-brand-50 hover:border-brand-300 transition-all disabled:opacity-40 shadow-sm"
          >
            Apply Selections
          </button>
        )}

        {autoGroup && (
          <button
            onClick={handleAutoFill}
            disabled={disabled}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all bg-brand-500 text-white hover:bg-brand-600 shadow-sm disabled:opacity-40"
            style={{ flex: hasSelections ? "0 0 auto" : 1 }}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            {autoGroup.label.replace(/^[\u26A1\u{1F9E8}\s⚡️\s]+/u, "").trim()}
          </button>
        )}

        {onSkip && (
          <button
            onClick={onSkip}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 hover:text-gray-700 transition-all disabled:opacity-40"
            title="Search with current criteria only"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
        )}
      </div>
    </motion.div>
  );
}
