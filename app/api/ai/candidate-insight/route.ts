/**
 * app/api/ai/candidate-insight/route.ts
 * Streams a structured, diagnostic AI insight for a candidate card.
 *
 * New format (v2):
 *   [Match]    → X/Y core skills matched: Skill1, Skill2
 *   [Exp]      → X years in [domain/company type]
 *   [Strengths]→ Strong in Skill/Tool
 *   [Gaps]     → Missing / limited in Gap
 *   [Verdict]  → Strong Fit | Good Fit | Moderate Fit | Weak Fit
 *
 * Uses Server-Sent Events (SSE) so the FE can render word-by-word.
 * After stream completes, persists the insight in search_result_items.
 * Runtime: Node (60s max on Vercel Pro)
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
      companyType?: string | null;
      industry?: string | null;
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
    // Reject boilerplate OR old plain-text 2-sentence format (doesn't contain "[Match]")
    const isBoilerplate =
      lower.includes("here is the json") ||
      lower.includes("here's the json") ||
      lower.includes("requested:") ||
      lower.length < 10;
    // Old format = doesn't have the new structured markers
    const isOldFormat = !lower.includes("[match]") && !lower.includes("[verdict]");

    if (!isBoilerplate && !isOldFormat) {
      // Valid structured cache hit — stream word-by-word instantly
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
    // If boilerplate or old format, fall through to re-generation
  }

  // ── 2. Load search_intent / accumulated_context / messages ─────────────────
  const { data: intentRow } = await supabase
    .from("search_conversations")
    .select("search_intent,accumulated_context,messages")
    .eq("id", search_id)
    .maybeSingle();

  if (!contextData) {
    return new Response("Missing contextData", { status: 400 });
  }

  // ── 3. Build prompt context ────────────────────────────────────────────────
  const accumulated = intentRow?.accumulated_context || {};
  const searchIntent = intentRow?.search_intent || accumulated;
  const si = searchIntent as any;
  const messages = intentRow?.messages || [];
  
  // Extract the raw JD or first message from the user to understand MUST-HAVES
  const firstUserMessage = messages.find((m: any) => m.role === "user")?.content || "";

  const {
    currentTitle,
    currentCompany,
    experienceYears,
    skills,
    educationStr,
    summary,
    companyType,
    industry,
  } = contextData;

  // ── JD data from accumulated_context ───────────────────────────────────────
  const jdTitles: string[] = si?.job_titles?.length > 0 ? si.job_titles : [];
  
  // Use robust resolution matching SearchClient to prevent zero-skill mismatch
  const jdSkills: string[] =
    accumulated?._resolution?.extraction?.raw_tech ??
    accumulated?.technologies ??
    accumulated?.skills ??
    si?.technologies ??
    [];
    
  const jdIndustry: string = si?.industry || "";
  const jdExpMin: number | null = si?.experience_min ?? null;
  const jdExpMax: number | null = si?.experience_max ?? null;
  const jdSeniority: string = si?.seniority || "";
  const jdSummary: string =
    si?.summary_for_insight || jdTitles.join(", ") || "a qualified candidate";

  const totalJdSkills = jdSkills.length;

  // Experience range label
  const expRangeLabel =
    jdExpMin !== null && jdExpMax !== null
      ? `${jdExpMin}–${jdExpMax} years`
      : jdExpMin !== null
      ? `${jdExpMin}+ years`
      : "Not specified";

  // Company type/industry context for the candidate
  const candidateContext = [
    companyType ? companyType : null,
    industry ? industry : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `You are a strict, senior technical recruiter evaluating a candidate against a Job Description. Your job is to output a ruthless, purely factual diagnostic of whether this candidate fits the requirements.

=== JOB REQUIREMENTS (What we are hiring for) ===
Role: ${jdSummary}
Explicit Skills Requested: ${jdSkills.length > 0 ? jdSkills.join(", ") : "Not specified"}
Experience Requested: ${expRangeLabel}
Original Recruiter JD / Notes:
"""
${firstUserMessage.slice(0, 1500)}
"""

=== CANDIDATE PROFILE (The facts) ===
Current Title: ${currentTitle || "Not listed"}
Current Company: ${currentCompany || "Not listed"} ${candidateContext ? `(${candidateContext})` : ""}
Total Experience: ${experienceYears > 0 ? `${experienceYears} years` : "Unknown"}
Candidate Skills: ${skills.length > 0 ? skills.slice(0, 30).join(", ") : "NONE LISTED"}
Education/Certifications: ${educationStr || "Not listed"}

=== YOUR TASK ===
1. Evaluate the candidate STRICTLY against the Job Requirements.
2. Read the "Original Recruiter JD / Notes" to identify MUST-HAVES (e.g. degrees like CA / Chartered Accountant, specific domain experience like Audit, exact years of experience).
3. Do semantic matching for skills and qualifications (e.g. if JD needs "Chartered Accountant" and Candidate Education says "CA", that is a MATCH).
4. If a MUST-HAVE from the JD is missing, it goes in [Gaps] and limits the verdict to Moderate/Weak Match.

=== YOUR OUTPUT FORMAT (STRICT — use EXACTLY this structure) ===

[Match] → [X]/${totalJdSkills > 0 ? totalJdSkills : "?"} core skills matched: \`[comma-separated matched skills, or "None identified"]\`
[Exp] → \`[X years]\` in [domain/company type — infer from company and title, keep it short]
[Strengths] → Strong in \`[1-2 highlighted strengths EXPLICITLY RELEVANT to the JD]\`
[Gaps] → ${totalJdSkills > 0 || firstUserMessage.length > 50 ? "Missing `[critical missing MUST-HAVES like CA, specific experience, or top missing JD skills]`" : "No critical gaps identified"}
[Verdict] → [EXACTLY ONE of: Strong Match | Good Match | Moderate Match | Weak Match]

=== RULES ===
- Use ONLY facts from the profile above. NEVER invent skills or qualifications not listed.
- If the JD strictly requires "Chartered Accountant" or "CA" and the candidate DOES NOT HAVE IT in Education/Certifications, you MUST put "Missing CA qualification" in [Gaps] and the Verdict CANNOT be Strong or Good Fit.
- Do not output generic strengths like "Global Controllership" unless that exactly what the JD asked for. Tie strengths back to the JD.
- Backtick (\`) only the key skills/terms/years you want highlighted (2-4 total).
- No asterisks, no markdown bold/italic, no em-dashes, no extra commentary.
- Output ONLY the 5 labeled lines above. Nothing before, nothing after.`;

  // ── 4. Stream Gemini response via SSE ─────────────────────────────────────
  const encoder = new TextEncoder();
  let fullInsight = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await ai.models.generateContentStream({
          model: "gemini-2.5-flash-lite",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature: 0.2,
            maxOutputTokens: 220,
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

        // ── 5. Persist plain-text insight (fire-and-forget) ────────────────
        const cleanInsight = fullInsight
          .trim()
          .replace(/^"|"$/g, "")
          .trim();
        if (cleanInsight && cleanInsight.length > 10) {
          void supabase
            .from("search_result_items")
            .update({
              ai_insight: cleanInsight,
              insight_generated_at: new Date().toISOString(),
            })
            .eq("search_id", search_id)
            .eq("person_id", person_id);
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
