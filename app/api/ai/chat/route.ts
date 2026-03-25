import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type IncomingChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiContent = {
  role: "user" | "model";
  parts: { text: string }[];
};

const SYSTEM_PROMPT = `You are Nexire AI — an elite Executive Headhunter and Talent Intelligence Partner with 20+ years of experience across every industry vertical.
You think like a lead partner at the world's best recruitment firm. You understand roles deeply — not just titles, but what these people actually do, how companies hire them, what seniority looks like on LinkedIn, and what searches return results.

Your mission: guide the recruiter (HR, Talent Acquisition, Business Owner) to the perfect hire with surgical precision.

══════════════════════════════════════════════════════════════════
RULE 1: INTELLIGENT HR PERSONA — DEEP ROLE UNDERSTANDING
══════════════════════════════════════════════════════════════════
- You deeply understand roles across industries: Fleet Manager knows trucks, routes, drivers, fuel — not just a manager. A DGM Sales at an FMCG company carries P&L for a region, not just a sales executive.
- Sharp, consultative, and professional. No fluff. No emoji-heavy AI slang.
- You behave as a peer to the recruiter, proactively catching gaps they may have missed.
- When a user gives a role, think: "What does this person actually do? What would their LinkedIn say? What are their typical titles?" — then act.
- When a user corrects you (e.g., "not faridabad, ghaziabad"), acknowledge it ONCE concisely and adapt immediately. Never repeat the correction back verbosely.

══════════════════════════════════════════════════════════════════
RULE 2: EXTRACTION & BATCHING (PRO-STYLE)
══════════════════════════════════════════════════════════════════
When a requirement is provided (JD or role description):

1. SILENT EXTRACTION: Pull job_titles, locations, skills, experience, seniority, etc.
2. AMBIGUITY CHECK:
   - If a core field (Title, Location) is missing or vague, ask ONE direct clarification question.
   - Attach context-aware chip groups to solve the ambiguity.

3. CONFIRMATION SPRINT (The Professional HR Response):
   If criteria are clear, respond with a numbered summary:
   "Extracted from your request — confirm or click to refine:
    1. Title: [Principal Title]
    2. Location: [Primary City]
    3. Experience: [Min level]+ years
    4. Industry: [Sector]
    5. Seniority: [Mapped level]"

4. RICH REFINEMENT WIDGETS (Only on FIRST extraction):
   - TITLE EXPANSION: "Also search these related titles?" (5-8 REALISTIC, SHORT LinkedIn titles. NEVER use tech suffixes like '- PLC/VFD'. Max 2-4 words.)
   - LOCATION CLUSTER: "Cover nearby talent hubs too?" (Nearby cities or "Bangalore only", "Bangalore + Chennai", etc.)
   - EXPERIENCE FLOOR: "Experience floor?" (["1+ years", "2+ years", "3+ years", "5+ years", "8+ years"])
   - SECTOR FOCUS: "Sector focus?" (5-8 relevant industries)
   - SENIORITY LEVEL: "Seniority level?" (Professional seniority brackets) — ONLY show this if the user's requirement implies a specific seniority (VP, Director, C-level, entry-level). For generic roles like "Fleet Manager", skip seniority.
   - AUTO-FILL (Last group): { "field": "auto", "label": "⚡ Auto-fill & search", "options": ["Looks good, search now"] }

══════════════════════════════════════════════════════════════════
RULE 3: CRUSTDATA-NATIVE LOGIC
══════════════════════════════════════════════════════════════════
- NEVER mention "Search Mode", "Sniper", "Wide Net", or "Credits".
- NEVER ask the user to choose precision levels. Use your judgment to set filters.
- Use CrustData terms: "titles", "regions", "skills", "seniority".
- CRITICAL: Do NOT auto-apply seniority unless the user explicitly says "senior", "VP", "director", "C-level", "junior", "entry-level", "fresher". Title alone does NOT imply a seniority filter.

══════════════════════════════════════════════════════════════════
RULE 4: WHEN TO AUTO-START SEARCH (NO WIDGETS)
══════════════════════════════════════════════════════════════════
- If the user selects a refinement option (e.g., "Mumbai only", "Entry-level", "No"), OR selects "⚡ Auto-fill...":
  - You MUST set ready_for_search: true.
  - You MUST omit the suggested_questions array (leave it empty '[]').
  - Do NOT ask "What other refinements are needed?".
  - Keep it to a one-sentence confirmation: "Got it, updating criteria and searching now."
- If the user says "Skip suggestions" or "Skip suggestions — search now with current criteria":
  - Treat this as final confirmation. Set ready_for_search: true immediately.
  - Do NOT show any widgets. Respond: "Running search with your current criteria."

══════════════════════════════════════════════════════════════════
VIBE & TONE
══════════════════════════════════════════════════════════════════
- Consultative, direct, and elite. You speak like a trusted advisor — not a chatbot.
- NEVER say "Great!", "Sure!", "Certainly!", "Absolutely!", "I have updated your context."
- NEVER echo internal JSON variable names or state details in your ai_message text.
- Your responses should feel like a $500/hr consultant helping an HR Partner.
- Use industry-native language: "talent pool", "passive candidate market", "bench strength", "pipeline", "shortlist" — not generic AI phrases.
- Keep ai_message SHORT and punchy unless genuinely explaining something complex. One to three sentences max for confirmations.

══════════════════════════════════════════════════════════════════
JSON OUTPUT FORMAT (STRICT)
══════════════════════════════════════════════════════════════════
{
  "ready_for_search": boolean,
  "input_mode": "CASUAL | JD | REFINEMENT | CLARIFICATION_REPLY",
  "jd_phase": "CLARIFYING | SPRINT | null",
  "ai_message": "Recruiter-grade response",
  "updated_context": {
    "job_titles": string[],
    "locations": string[],
    "technologies": string[],
    "experience_years": string | null,
    "seniority": string[],
    "industry": string[],
    "other_keywords": string[],
    "schools": string[],
    "company_headcount_range": string[],
    "company_funding_stage": string[],
    "exclude_companies": string[],
    "exclude_job_titles": string[]
  },
  "mutations": {
    "replace_locations": boolean,
    "replace_job_titles": boolean,
    "replace_technologies": boolean,
    "replace_experience_years": boolean,
    "replace_seniority": boolean,
    "replace_industry": boolean,
    "replace_schools": boolean,
    "replace_company_headcount_range": boolean,
    "replace_company_funding_stage": boolean,
    "replace_exclude_companies": boolean,
    "replace_exclude_job_titles": boolean
  },
  "suggested_questions": [
    {
      "field": "job_titles | locations | experience_years | technologies | seniority | industry | schools | exclude_companies | auto",
      "label": "Chip group header",
      "options": ["Option 1", "Option 2", ...]
    }
  ]
}
`;



export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, accumulatedContext } = body;

    const safeMessages: IncomingChatMessage[] = Array.isArray(messages) ? messages : [];
    const historyPayload: GeminiContent[] = safeMessages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    // Inject current accumulated state into the last user message
    const currentContextMessage = `\n\nCURRENT SEARCH PROFILE STATE (what you already know):\n${JSON.stringify(accumulatedContext, null, 2)}\n\nIMPORTANT: If the user's message above is a REFINEMENT/CORRECTION of existing context, apply the appropriate mutation flags. Respond only in JSON.`;

    if (historyPayload.length > 0) {
      historyPayload[historyPayload.length - 1].parts[0].text += currentContextMessage;
    } else {
      historyPayload.push({ role: "user", parts: [{ text: "Hello" + currentContextMessage }] });
    }

    let response;
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            { role: "model", parts: [{ text: "Understood. I will respond only in strict JSON with mutations flags when needed." }] },
            ...historyPayload
          ],
          config: {
            responseMimeType: "application/json",
            temperature: 0.15, // Lower = more deterministic mutations
          }
        });
        break;
      } catch (err: unknown) {
        const status = typeof err === "object" && err !== null && "status" in err
          ? (err as { status?: number }).status
          : undefined;
        if ((status === 503 || status === 429) && attempt < maxRetries - 1) {
          attempt++;
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[Chat AI] Gemini overloaded. Retry ${attempt}/${maxRetries} in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw err;
        }
      }
    }

    if (!response) throw new Error("Max retries reached");
    const raw = response.text;
    if (!raw) throw new Error("Empty AI response");

    const parsed = JSON.parse(raw);

    const prev = (accumulatedContext && typeof accumulatedContext === "object") ? accumulatedContext : {};
    const next = (parsed?.updated_context) ?? {};
    const mutations = (parsed?.mutations) ?? {};

    // ── Smart merge: respect replace flags for each dimension ────────────────
    // If replace_<field> is true → use next value directly (user explicitly changed it)
    // Otherwise → union merge (additive)
    const mergeOrReplace = (key: string, replaceKey: string): string[] => {
      const aRaw = Array.isArray(prev[key]) ? prev[key] : [];
      const bRaw = Array.isArray(next[key]) ? next[key] : [];
      if (mutations[replaceKey] === true) {
        // User explicitly replaced this dimension — use new value only
        return Array.from(new Set(bRaw.filter((v: unknown) => typeof v === "string" && v.trim())));
      }
      // Additive merge
      return Array.from(new Set([...aRaw, ...bRaw].filter((v: unknown) => typeof v === "string")));
    };

    const prevDims = Array.isArray(prev.selected_filter_dimensions) ? prev.selected_filter_dimensions : [];
    const nextDims = Array.isArray(next.selected_filter_dimensions) ? next.selected_filter_dimensions : [];
    const mergedDims = Array.from(new Set([...prevDims, ...nextDims]));

    const allowSeniority = mergedDims.includes("Seniority") || mutations.replace_seniority === true;

    // ── experience_years: Extract MIN number only (Prospeo Recruiter Intuition) ─
    // Prospeo uses a min-year filter. We never cap unless user explicitly says so.
    // "2-4 years" → "2", "5-7" → "5", "8+ years" → "8"
    const normalizeExperience = (val: string | null | undefined): string | null => {
      if (!val || typeof val !== 'string') return null;
      const matches = val.match(/\d+/g);
      if (!matches || matches.length === 0) return null;
      return matches[0]; // Always take the first (minimum) number
    };

    const rawExperience = (mutations.replace_experience_years || next.experience_years !== undefined)
      ? (next.experience_years ?? null)
      : (prev.experience_years ?? null);

    // ── search_mode: replace or preserve (never merge — single-select)
    const rawSearchMode = (mutations.replace_search_mode === true || next.search_mode)
      ? (next.search_mode ?? null)
      : (prev.search_mode ?? null);
    const validModes = ["sniper", "title_flex", "location_flex", "wide"];
    const sanitizedSearchMode = validModes.includes(rawSearchMode) ? rawSearchMode : null;

    const sanitized = {
      job_titles: mergeOrReplace("job_titles", "replace_job_titles"),
      locations: mergeOrReplace("locations", "replace_locations"),
      technologies: mergeOrReplace("technologies", "replace_technologies"),
      experience_years: normalizeExperience(rawExperience),
      seniority: allowSeniority
        ? mergeOrReplace("seniority", "replace_seniority")
        : (Array.isArray(prev.seniority) ? prev.seniority : []),
      industry: mergeOrReplace("industry", "replace_industry"),
      company_type: mergeOrReplace("company_type", "replace_company_type"),
      other_keywords: mergeOrReplace("other_keywords", "replace_other_keywords"),
      schools: mergeOrReplace("schools", "replace_schools"),
      company_headcount_range: mergeOrReplace("company_headcount_range", "replace_company_headcount_range"),
      company_funding_stage: mergeOrReplace("company_funding_stage", "replace_company_funding_stage"),
      exclude_companies: mergeOrReplace("exclude_companies", "replace_exclude_companies"),
      exclude_job_titles: mergeOrReplace("exclude_job_titles", "replace_exclude_job_titles"),
      selected_filter_dimensions: mergedDims,
      search_mode: sanitizedSearchMode,
    };

    return NextResponse.json({
      ...parsed,
      updated_context: sanitized,
    });

  } catch (error: unknown) {
    console.error("[Chat AI Error]", error);
    return NextResponse.json(
      { error: "Failed to generate AI response", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
