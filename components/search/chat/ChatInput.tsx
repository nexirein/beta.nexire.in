import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, FileText, SlidersHorizontal } from "lucide-react";
import { useSearchStore } from "@/lib/store/search-store";
import { cn } from "@/lib/utils";

/**
 * ChatInput — light mode, Cursor-style clean input box.
 * White background, gray border, brand-blue send button.
 * No dark glassmorphism.
 */

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  onPasteJD?: () => void;
  onManualFilters?: () => void;
  hasMessages?: boolean;
}

const ROTATING_PLACEHOLDERS = [
  "Who are you looking to hire? Describe the role...",
  "E.g. Site engineer in Mumbai, 3+ years infrastructure...",
  "E.g. Backend developer, Node.js, Series B, Bangalore...",
  "E.g. Risk analyst in NBFC, Mumbai, 3-5 years...",
  "E.g. Warehouse manager Delhi NCR, 50k sqft, 5+ yrs...",
  "Paste a job description, or describe in plain English...",
];

function useAutoResizeTextarea(minHeight: number, maxHeight: number) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback((reset?: boolean) => {
    const el = textareaRef.current;
    if (!el) return;
    if (reset || !el.value.trim()) { el.style.height = `${minHeight}px`; return; }
    el.style.height = `${minHeight}px`;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [minHeight, maxHeight]);
  return { textareaRef, adjustHeight };
}

export function ChatInput({
  onSendMessage,
  disabled,
  onPasteJD,
  onManualFilters,
  hasMessages = false,
  placeholder,
}: ChatInputProps) {
  const [input, setInput] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("chat_input_draft") || "";
    }
    return "";
  });
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const status = useSearchStore((state) => state.status);
  const isProcessing = status === "RESOLVING" || status === "SEARCHING" || disabled;

  // Sync draft to sessionStorage
  useEffect(() => {
    if (input) {
      sessionStorage.setItem("chat_input_draft", input);
    } else {
      sessionStorage.removeItem("chat_input_draft");
    }
  }, [input]);

  const minH = hasMessages ? 44 : 100;
  const { textareaRef, adjustHeight } = useAutoResizeTextarea(minH, 200);

  // Auto-adjust height on initial render if there's drafted text
  useEffect(() => {
    if (input) {
      adjustHeight();
    }
  }, [input, adjustHeight]);

  useEffect(() => {
    if (hasMessages || input.trim()) return;
    const id = setInterval(() => setPlaceholderIdx((p) => (p + 1) % ROTATING_PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, [hasMessages, input]);

  const activePlaceholder = placeholder
    ? placeholder
    : hasMessages
      ? "Ask a follow-up or refine your search..."
      : ROTATING_PLACEHOLDERS[placeholderIdx];

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    onSendMessage(input.trim());
    setInput("");
    sessionStorage.removeItem("chat_input_draft");
    adjustHeight(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = input.trim().length > 0 && !isProcessing;

  return (
    <div className="flex flex-col w-full gap-2">
      {/* ── Main Input Box ── */}
      <div
        className={cn(
          "relative flex flex-col w-full rounded-2xl transition-all duration-200 overflow-hidden bg-white border",
          isFocused
            ? "border-brand-400 ring-2 ring-brand-500/10 shadow-sm"
            : "border-gray-200 shadow-sm hover:border-gray-300"
        )}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); adjustHeight(); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder={activePlaceholder}
          rows={1}
          disabled={isProcessing}
          style={{ minHeight: `${minH}px`, resize: "none", overflowY: "auto" }}
          className={cn(
            "w-full max-h-[200px] bg-transparent focus:outline-none transition-all duration-200 text-text-primary placeholder:text-gray-400",
            hasMessages
              ? "px-4 py-3 text-[14px] leading-relaxed pr-14"
              : "px-4 pt-4 pb-3 text-[14px] leading-relaxed"
          )}
        />

        {/* ── Action bar (empty state) ── */}
        {!hasMessages && (
          <div className="flex items-center justify-between px-3 pb-3 pt-0">
            <div className="flex items-center gap-2">

              <button
                onClick={() => onManualFilters?.()}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-gray-100 border border-gray-200 text-text-tertiary hover:text-text-primary hover:bg-gray-200 transition-all text-[11px] font-medium"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Filters
              </button>
            </div>

            {/* Send button — right aligned in action bar */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                canSend
                  ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-600"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              )}
            >
              {isProcessing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5 fill-current ml-0.5" strokeWidth={2.5} />
              }
            </button>
          </div>
        )}

        {/* ── Send button (hasMessages — floated inside textarea) ── */}
        {hasMessages && (
          <div className="absolute right-2.5 bottom-0 top-0 flex items-center">
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                canSend
                  ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-600"
                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
              )}
            >
              {isProcessing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5 fill-current ml-0.5" strokeWidth={2.5} />
              }
            </button>
          </div>
        )}
      </div>

      {/* ── Keyboard hint ── */}
      {canSend && (
        <div className="text-[10px] text-text-disabled text-right pr-1 font-mono tracking-tight">
          ↵ enter to send · ⇧↵ new line
        </div>
      )}
    </div>
  );
}
