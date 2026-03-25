/**
 * scripts/seed-filter-embeddings.ts
 *
 * Seeds the Supabase `filter_embeddings` table with Gemini Embedding 2 vectors
 * for all Set2 filter fields (industry, seniority, function, etc.)
 *
 * Run with:
 *   npx tsx scripts/seed-filter-embeddings.ts
 *
 * Requires:
 *   GEMINI_API_KEY in env
 *   NEXT_PUBLIC_SUPABASE_URL in env
 *   SUPABASE_SERVICE_ROLE_KEY in env (service role needed to bypass RLS)
 */

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { SET2_FILTER_REGISTRY } from "../lib/crustdata/filter-enum-values";

// ── Load env ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const BATCH_SIZE = 5;
const DELAY_MS = 300; // Gemini Embedding 2 rate limit buffer

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Embed a single text value ─────────────────────────────────────────────────
async function embedText(text: string): Promise<number[] | null> {
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text,
      config: {
        // MRL: reduce from 3072 → 768 for storage/search efficiency with minimal quality loss
        outputDimensionality: 768,
        taskType: "SEMANTIC_SIMILARITY",
      },
    });
    return result.embeddings?.[0]?.values ?? null;
  } catch (err) {
    console.error(`Failed to embed "${text}":`, err);
    return null;
  }
}

// ── Upsert a single embedding row ────────────────────────────────────────────
async function upsertEmbedding(
  filterType: string,
  value: string,
  embedding: number[]
): Promise<void> {
  const { error } = await supabase
    .from("filter_embeddings")
    .upsert(
      {
        filter_type: filterType,
        value,
        display_label: value,
        embedding: JSON.stringify(embedding),
      },
      { onConflict: "filter_type,value" }
    );

  if (error) {
    console.error(`Upsert failed for [${filterType}] "${value}":`, error.message);
  }
}

// ── Main seeding loop ─────────────────────────────────────────────────────────
async function seed() {
  let totalSeeded = 0;
  let totalSkipped = 0;

  for (const [filterType, { values }] of Object.entries(SET2_FILTER_REGISTRY)) {
    console.log(`\n[${filterType.toUpperCase()}] Seeding ${values.length} values...`);

    // Check which values already exist
    const { data: existing } = await supabase
      .from("filter_embeddings")
      .select("value")
      .eq("filter_type", filterType);

    const existingSet = new Set((existing ?? []).map((r: { value: string }) => r.value));
    const toEmbed = values.filter((v) => !existingSet.has(v));

    if (toEmbed.length === 0) {
      console.log(`  → All ${values.length} values already seeded. Skipping.`);
      totalSkipped += values.length;
      continue;
    }

    console.log(`  → ${existingSet.size} existing, embedding ${toEmbed.length} new values`);

    // Process in batches
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (value) => {
          // Build a rich text for embedding: "industry: Transportation, Logistics, Supply Chain"
          // This gives better semantic context than embedding the value alone
          const textToEmbed = `${filterType.replace(/_/g, " ")}: ${value}`;
          const embedding = await embedText(textToEmbed);
          if (embedding) {
            await upsertEmbedding(filterType, value, embedding);
            process.stdout.write(".");
            totalSeeded++;
          } else {
            process.stdout.write("X");
          }
        })
      );

      if (i + BATCH_SIZE < toEmbed.length) {
        await delay(DELAY_MS);
      }
    }

    console.log(`\n  ✓ Done [${filterType}]`);
  }

  console.log(`\n\n═══════════════════════════════`);
  console.log(`Seeding complete:`);
  console.log(`  Seeded:  ${totalSeeded}`);
  console.log(`  Skipped: ${totalSkipped} (already existed)`);
  console.log(`═══════════════════════════════`);
}

seed().catch((err) => {
  console.error("Fatal seeding error:", err);
  process.exit(1);
});
