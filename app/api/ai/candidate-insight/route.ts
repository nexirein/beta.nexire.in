/**
 * app/api/ai/candidate-insight/route.ts
 * Streams a 2-4 line AI insight for a single candidate card.
 *
 * Uses Server-Sent Events (SSE) so the FE can render word-by-word.
 * After stream completes, persists the insight in search_result_items
 * so future loads are served from cache (no re-generation).
 *
 * Runtime: Edge (no timeout on Vercel Pro)
 */

import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const { person_id, search_id, contextData } = body as {
    person_id: string;
    search_id: string;
    contextData?: {
      currentTitle: string;
      currentCompany: string;
      experienceYears: number;
      skills: string[];
      educationStr: string | null;
      summary: string | null;
    };
  };

  if (!person_id || !search_id) {
    return new Response("Missing person_id or search_id", { status: 400 });
  }

  // ── 1. Check cache first ───────────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("search_result_items")
    .select("ai_insight")
    .eq("search_id", search_id)
    .eq("person_id", person_id)
    .not("ai_insight", "is", null)
    .maybeSingle();

  if (cached?.ai_insight) {
    const lower = cached.ai_insight.toLowerCase();
    const isBoilerplate = 
      lower.includes("here is the json") || 
      lower.includes("here's the json") || 
      lower.includes("requested:") ||
      lower.length < 10;

    if (!isBoilerplate) {
      // Valid cache hit — stream intended JSON instantly
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const words = cached.ai_insight!.split(" ");
          words.forEach((word: string, i: number) => {
            const data = `data: ${JSON.stringify({ token: word + (i < words.length - 1 ? " " : "") })}\n\n`;
            controller.enqueue(encoder.encode(data));
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
    // If it is boilerplate, we continue to Step 2 (Full Generation)
  }

  // ── 2. Load search_intent ───────────────────────────────────────────────────
  const { data: intentRow } = await supabase
    .from("search_conversations")
    .select("search_intent,accumulated_context")
    .eq("id", search_id)
    .maybeSingle();

  if (!contextData) {
    return new Response("Missing contextData", { status: 400 });
  }

  // ── 3. Build prompt context ────────────────────────────────────────────────
  const searchIntent = intentRow?.search_intent ?? intentRow?.accumulated_context ?? {};
  const { currentTitle, currentCompany, experienceYears, skills, educationStr, summary } = contextData;

  // What the recruiter wants (from search_intent or accumulated_context fallback)
  const recruiterNeed =
    (searchIntent as any)?.summary_for_insight ??
    (searchIntent as any)?.job_titles?.[0] ??
    "a qualified candidate";

  const prompt = `You are a world-class talent scout. 
Your goal is to extract the highest-signal information about a candidate for a busy recruiter.

Recruiter Search Context: ${recruiterNeed}
Industry: ${(searchIntent as any)?.industry_context ?? (searchIntent as any)?.industry?.[0] ?? "General"}

Candidate Data:
- Current: ${currentTitle} at ${currentCompany}
- Experience: ${experienceYears} years
- Skills: ${skills.join(", ")}
- Education: ${educationStr || "N/A"}
- Summary: ${summary?.slice(0, 300) || "N/A"}

OUTPUT FORMAT (MANDATORY):
Respond ONLY with a raw, valid JSON object. 
- NO markdown code blocks (NO \`\`\`json).
- NO conversational text before, after, or around the JSON.
- START directly with the '{' character.
- NO "Here is the JSON" or "As requested" fluff.
- THE OUTPUT SHOULD BE JUST THE JSON.

{
  "signal": "One bold differentiating sentence, max 15-20 words. Lead with the most unique hook.",
  "tags": ["Tag 1", "Tag 2", "Tag 3"] 
}

RULES:
1. "signal" MUST be a hook. Avoid: "Experienced professional...", "Strong candidate...".
2. "tags" should be high-density (e.g. "BArch Melbourne", "SaaS Scaleup", "React Native").
3. NEVER invent numbers or details not present in the data.
4. If no unique signal exists, keep it factual and brief.
5. NO call-to-actions ("Click profile", etc).
6. DO NOT TALK. ONLY OUTPUT JSON.`;

  // ── 4. Stream Gemini response via SSE ─────────────────────────────────────
  const encoder = new TextEncoder();
  let fullInsight = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await ai.models.generateContentStream({
          model: "gemini-2.5-flash-lite", // Using 2.5 Flash as per project standard
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature: 0.1, // Lower temperature for more consistent JSON
            maxOutputTokens: 200,
            responseMimeType: "application/json",
          },
        });

        for await (const chunk of response) {
          const text = chunk.text ?? "";
          if (text) {
            fullInsight += text;
            const data = `data: ${JSON.stringify({ token: text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // ── 5. Persist insight to cache (fire-and-forget) ──────────────────
        if (fullInsight.trim()) {
          // Extract and parse the JSON before saving
          let structuredInsight: any = null;
          try {
            const firstBrace = fullInsight.indexOf("{");
            const lastBrace = fullInsight.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace !== -1) {
              const jsonStr = fullInsight.substring(firstBrace, lastBrace + 1);
              structuredInsight = JSON.parse(jsonStr);
            }
          } catch (e) {
            console.error("[candidate-insight parse error]", e);
          }

          if (structuredInsight) {
            void supabase
              .from("search_result_items")
              .update({
                ai_insight: structuredInsight,
                insight_generated_at: new Date().toISOString(),
              })
              .eq("search_id", search_id)
              .eq("person_id", person_id);
          }
        }
      } catch (err) {
        console.error("[candidate-insight SSE error]", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Generation failed" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
