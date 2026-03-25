/**
 * lib/crustdata/filter-vector-search.ts
 *
 * Set2 filter resolution via Gemini Embedding 2 + Supabase pgvector.
 *
 * For a user/LLM-generated string like "Logistics" or "Supply Chain",
 * this module finds the closest canonical CrustData enum values stored
 * in the `filter_embeddings` table.
 *
 * Usage:
 *   const industries = await resolveSet2Values("industry", ["Logistics", "Supply Chain"]);
 *   // → ["Transportation, Logistics, Supply Chain and Storage"]
 */

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Embed a query string ──────────────────────────────────────────────────────
async function embedQuery(filterType: string, text: string): Promise<number[] | null> {
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: `${filterType.replace(/_/g, " ")}: ${text}`,
      config: {
        outputDimensionality: 768,
        taskType: "SEMANTIC_SIMILARITY",
      },
    });
    return result.embeddings?.[0]?.values ?? null;
  } catch {
    return null;
  }
}

export interface VectorMatch {
  value: string;
  similarity: number;
}

// ── Vector search for a single query term ────────────────────────────────────
async function searchSingle(
  filterType: string,
  query: string,
  topK = 3,
  threshold = 0.55
): Promise<VectorMatch[]> {
  const embedding = await embedQuery(filterType, query);
  if (!embedding) return [];

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("match_filter_value", {
    query_embedding: embedding,
    filter_type_param: filterType,
    match_count: topK,
    similarity_threshold: threshold,
  });

  if (error || !data) return [];
  return (data as VectorMatch[]);
}

// ── Resolve multiple user strings to canonical CrustData values ──────────────
/**
 * Resolves a list of user/LLM strings to canonical CrustData enum values.
 *
 * @param filterType - e.g. "industry", "seniority", "function"
 * @param inputs     - raw strings from LLM context
 * @param topK       - max matches per input
 * @returns deduplicated array of canonical values
 */
export async function resolveSet2Values(
  filterType: string,
  inputs: string[],
  topK = 3
): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];

  const results = await Promise.all(
    inputs.map((input) => searchSingle(filterType, input, topK))
  );

  const seen = new Set<string>();
  const canonical: string[] = [];

  for (const matches of results) {
    for (const m of matches) {
      if (!seen.has(m.value)) {
        seen.add(m.value);
        canonical.push(m.value);
      }
    }
  }

  return canonical;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

/** Resolve industry strings to canonical CrustData industry values */
export async function resolveIndustries(inputs: string[]): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];
  return resolveSet2Values("industry", inputs, 2);
}

/** Resolve seniority strings to canonical CrustData seniority values */
export async function resolveSeniority(inputs: string[]): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];
  return resolveSet2Values("seniority", inputs, 1);
}

/** Resolve function/department strings to canonical CrustData function values */
export async function resolveFunction(inputs: string[]): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];
  return resolveSet2Values("function", inputs, 1);
}

/** Resolve experience year strings to canonical CrustData years_of_experience value */
export async function resolveYearsExperience(input: string): Promise<string | null> {
  if (!input) return null;
  const results = await resolveSet2Values("years_experience", [input], 1);
  return results[0] ?? null;
}

/** Resolve company headcount string to canonical value */
export async function resolveHeadcount(inputs: string[]): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];
  return resolveSet2Values("company_headcount", inputs, 1);
}

/** Resolve company type string to canonical value */
export async function resolveCompanyType(inputs: string[]): Promise<string[]> {
  if (!inputs || inputs.length === 0) return [];
  return resolveSet2Values("company_type", inputs, 1);
}
