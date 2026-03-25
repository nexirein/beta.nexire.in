import React, { useState } from "react";
import { Check, Plus, Zap, SkipForward } from "lucide-react";
import { motion } from "framer-motion";

export interface WidgetOption {
  field: string;
  label: string;
  options: string[];
}

interface WidgetRendererProps {
  widgetData: WidgetOption[];
  onSelectCallback: (selected: Record<string, string[]>) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

export function WidgetRenderer({ widgetData, onSelectCallback, onSkip, disabled }: WidgetRendererProps) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  if (!widgetData || widgetData.length === 0) return null;

  // Separate the special "auto" group from regular chip groups
  const autoGroup = widgetData.find((w) => w.field === "auto");
  const regularGroups = widgetData.filter((w) => w.field !== "auto");

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
    setCustomInputs((prev) => ({ ...prev, [field]: "" }));
  };

  const handleConfirm = () => {
    onSelectCallback(selections);
  };

  // Auto-fill: fires immediately with a special auto signal
  const handleAutoFill = () => {
    onSelectCallback({ auto: ["⚡ Auto-fill best options"] });
  };

  const hasSelections = Object.values(selections).some((arr) => arr.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3 flex flex-col gap-3"
    >
      {/* Regular multi-select chip groups */}
      {regularGroups.map((widget, idx) => {
        const selectedForField = selections[widget.field] || [];

        return (
          <div key={idx} className="flex flex-col gap-2.5 p-4 rounded-2xl border border-brand-200 bg-brand-50/30 shadow-sm">
            <span className="text-[10px] font-bold text-brand-600/60 uppercase tracking-widest">{widget.label}</span>
            <div className="flex flex-wrap gap-2">
              {widget.options.map((opt) => {
                const isSelected = selectedForField.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggleSelection(widget.field, opt)}
                    disabled={disabled}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all duration-200 border ${
                      isSelected
                        ? "bg-brand-500 border-brand-400 text-white shadow-md shadow-brand-500/20 scale-[1.02]"
                        : "bg-white border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/50 hover:shadow-sm"
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    {opt}
                  </button>
                );
              })}

              {/* Custom text input */}
              <div className="relative flex items-center border border-gray-200 rounded-xl bg-white focus-within:border-brand-500/40 focus-within:ring-2 focus-within:ring-brand-500/10 overflow-hidden pl-3 pr-1 py-1 transition-all">
                <input
                  type="text"
                  placeholder="Add other... (Enter to add)"
                  disabled={disabled}
                  value={customInputs[widget.field] || ""}
                  onChange={(e) => setCustomInputs((prev) => ({ ...prev, [widget.field]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomOption(widget.field);
                    }
                  }}
                  className="bg-transparent text-[12px] text-gray-700 w-36 outline-none placeholder:text-gray-400"
                />
                <button
                  onClick={() => addCustomOption(widget.field)}
                  disabled={disabled || !customInputs[widget.field]?.trim()}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-30 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Action row: Apply Selections + Auto-fill + Skip */}
      <div className="flex items-stretch gap-2 mt-1">
        {hasSelections && (
          <button
            onClick={handleConfirm}
            disabled={disabled}
            className="flex-1 px-4 py-3 bg-white border border-brand-200 text-brand-600 rounded-2xl text-[13px] font-bold hover:bg-brand-50 hover:border-brand-300 transition-all disabled:opacity-40 shadow-sm"
          >
            Apply Selections
          </button>
        )}

        {/* Auto-fill button — always visible */}
        {autoGroup && (
          <button
            onClick={handleAutoFill}
            disabled={disabled}
            className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl text-[13px] font-bold transition-all duration-200 bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 disabled:opacity-40"
            style={{ flex: hasSelections ? "0 0 auto" : 1 }}
          >
            <Zap className="w-4 h-4 fill-current" />
            {autoGroup.label}
          </button>
        )}

        {/* Skip — always visible; lets user proceed without selecting any suggestions */}
        {onSkip && (
          <button
            onClick={onSkip}
            disabled={disabled}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl text-[13px] font-semibold text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 hover:text-gray-700 transition-all disabled:opacity-40"
            title="Skip suggestions and search now"
          >
            <SkipForward className="w-4 h-4" />
            Skip
          </button>
        )}
      </div>
    </motion.div>
  );
}
