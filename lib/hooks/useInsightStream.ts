/**
 * lib/hooks/useInsightStream.ts
 * React hook that opens an SSE connection to /api/ai/candidate-insight
 * and streams the AI insight text token-by-token.
 *
 * Features:
 * - Caches streamed text in component state
 * - Handles [DONE] signal
 * - Cleans up EventSource on unmount
 * - Exposes isStreaming, insight, isDone states
 */

"use client";

import { useEffect, useRef, useState } from "react";

interface UseInsightStreamOptions {
  personId: string;
  searchId: string;
  /** If false, stream won't start (used for batching control) */
  enabled?: boolean;
  contextData: {
    currentTitle: string;
    currentCompany: string;
    experienceYears: number;
    skills: string[];
    educationStr: string | null;
    summary: string | null;
  };
  onDone?: (insight: string) => void;
}

interface UseInsightStreamResult {
  insight: string;
  isStreaming: boolean;
  isDone: boolean;
  error: string | null;
}

export function useInsightStream({
  personId,
  searchId,
  enabled = true,
  contextData,
  onDone,
}: UseInsightStreamOptions): UseInsightStreamResult {
  const [insight, setInsight] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether we've already started streaming for this personId+searchId
  const hasStartedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset on ID change
    setInsight("");
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
    hasStartedRef.current = false;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [personId, searchId]);

  useEffect(() => {
    if (!enabled || !personId || !searchId) return;
    if (hasStartedRef.current) return;

    hasStartedRef.current = true;
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    let accumulated = "";

    fetch("/api/ai/candidate-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: personId, search_id: searchId, contextData }),
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          setError("Failed to start stream");
          setIsStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            if (data === "[DONE]") {
              setIsStreaming(false);
              setIsDone(true);
              if (onDone) onDone(accumulated);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                setError(parsed.error);
                setIsStreaming(false);
                return;
              }
              if (parsed.token) {
                accumulated += parsed.token;
                setInsight(accumulated);
              }
            } catch {
              // ignore parse errors on partial chunks
            }
          }
        }

        setIsStreaming(false);
        setIsDone(true);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("Stream connection failed");
        setIsStreaming(false);
      });

    return () => {
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, personId, searchId]);

  return { insight, isStreaming, isDone, error };
}
