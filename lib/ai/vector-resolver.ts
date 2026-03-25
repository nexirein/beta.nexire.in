/**
 * lib/ai/vector-resolver.ts
 * Phase 4 — Resolve raw HR terms (tech/industry) to exact Prospeo enum values
 * using Supabase pgvector + OpenAI embeddings.
 * Requires: prospeo_embeddings table built via scripts/build-embedding-index.ts
 */

import { createClient } from "@supabase/supabase-js";
import { embedSingle } from "./embeddings";

// Admin client — reads prospeo_embeddings (no user session needed)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ResolvedMatch {
  query: string;               // what HR typed ("AWS")
  match: string;               // exact Prospeo value ("Amazon Web Services")
  score: number;               // similarity 0-2 (1 - negative inner product)
  confident: boolean;          // score >= 1.24
}

/**
 * Resolve a list of raw tech/industry strings to exact Prospeo enum values.
 * Embeds each term and queries pgvector match_prospeo_enum RPC.
 * All embeds run in parallel for speed (~100ms total for 5 terms).
 */
export async function resolveTerms(
  terms: string[],
  category: "technology" | "industry" | "department",
  options: { threshold?: number; topK?: number } = {}
): Promise<{ resolved: ResolvedMatch[]; unresolved: string[] }> {
  const threshold = options.threshold ?? 1.22;
  const topK = options.topK ?? 3;

  if (terms.length === 0) return { resolved: [], unresolved: [] };

  // Check if pgvector index is populated — if not, skip gracefully
  const supabase = getAdminClient();
  const { count } = await supabase
    .from("prospeo_embeddings")
    .select("*", { count: "exact", head: true })
    .eq("category", category)
    .limit(1);

  if (!count || count === 0) {
    // Index not built yet — return all as unresolved (graceful degradation)
    console.warn(`[vector-resolver] prospeo_embeddings empty for category: ${category}`);
    return { resolved: [], unresolved: terms };
  }

  const resolved: ResolvedMatch[] = [];
  const unresolved: string[] = [];

  const uniqueTerms = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)));

  const { data: exactRows } = await supabase
    .from("prospeo_embeddings")
    .select("label")
    .eq("category", category)
    .in("label", uniqueTerms);

  const exact = new Set(
    (Array.isArray(exactRows) ? exactRows : [])
      .map((r) => (typeof r === "object" && r !== null ? (r as Record<string, unknown>).label : null))
      .filter((l): l is string => typeof l === "string" && l.length > 0)
  );

  for (const t of uniqueTerms) {
    if (exact.has(t)) {
      resolved.push({ query: t, match: t, score: 2, confident: true });
    }
  }

  const remaining = uniqueTerms.filter((t) => !exact.has(t));
  if (remaining.length === 0) return { resolved, unresolved };

  // Embed all remaining terms in parallel
  const embeddings = await Promise.all(remaining.map((t) => embedSingle(t)));

  // Query pgvector for each term in parallel
  const matchResults = await Promise.all(
    embeddings.map((embedding) =>
      supabase.rpc("match_prospeo_enum", {
        query_embedding: `[${embedding.join(",")}]`,
        match_category: category,
        match_threshold: threshold,
        match_count: topK,
      })
    )
  );

  remaining.forEach((term, idx) => {
    const { data, error } = matchResults[idx];
    if (error) {
      console.error("[vector-resolver] RPC error:", error);
      unresolved.push(term);
      return;
    }
    if (!data || data.length === 0) {
      console.warn(`[vector-resolver] No results above threshold ${threshold} for: ${term}`);
      unresolved.push(term);
      return;
    }
    const best = data[0];
    resolved.push({
      query: term,
      match: best.label,
      score: best.similarity,
      confident: best.similarity >= 1.24,
    });
  });

  return { resolved, unresolved };
}
