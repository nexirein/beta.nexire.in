/**
 * lib/ai/embeddings.ts
 * Phase 4 — Gemini text-embedding-001 client.
 * Used for: embedding HR query terms → vector search in Supabase pgvector.
 */

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const EMBEDDING_MODEL = "gemini-embedding-001" as const;
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Embed a single string. Returns 768-float array.
 * Gemini gemini-embedding-001 outputs are suitable for dot product or cosine calculations.
 */
export async function embedSingle(text: string): Promise<number[]> {
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text.trim().toLowerCase(),
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  if (!res.embeddings || !res.embeddings[0] || !res.embeddings[0].values) {
    throw new Error("Failed to generate embedding");
  }
  return res.embeddings[0].values;
}

/**
 * Embed multiple strings in chunks of 100 for batch embedding index build.
 * Gemini API rate limits apply. Be mindful of limits for concurrent batches.
 * Used only for the one-time index build script.
 */
export async function embedBatch(
  texts: string[]
): Promise<{ text: string; embedding: number[] }[]> {
  const CHUNK_SIZE = 100;
  const results: { text: string; embedding: number[] }[] = [];

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE);

    // Gemini's embedContent requires single content inputs via this SDK version.
    // Instead of passing the entire array, we'll blast them via Promise.all
    const batchPromises = chunk.map(text =>
      ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text.trim().toLowerCase(),
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      }).then(res => {
        if (!res.embeddings || !res.embeddings[0] || !res.embeddings[0].values) {
          throw new Error("Failed to generate embedding");
        }
        return { text, embedding: res.embeddings[0].values };
      })
    );

    const chunkResults = await Promise.all(batchPromises);
    results.push(...chunkResults);

    if (i + CHUNK_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 1000)); // 1s pause between chunks
    }
  }
  return results;
}
