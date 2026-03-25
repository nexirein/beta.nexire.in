import * as dotenv from "dotenv";
import { resolve } from "path";

// Load before any imports
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { extractFiltersFromText } = await import("../lib/ai/extractor");
  const { resolveTerms } = await import("../lib/ai/vector-resolver");

  const queries = [
    "Looking for a Senior React Developer who has worked in the Software industry for at least 5 years.",
    "Need a marketing manager from a B2B SaaS startup with experience in SEO and Google Ads.",
    "Seeking an executive in the healthcare or medical field with a background in hospital administration.",
    "Hire a backend engineer with Python, Django, and PostgreSQL experience in the finance sector."
  ];

  console.log("🚀 Testing Gemini AI Pipeline (Extraction -> DB Matching)");
  console.log("========================================================\n");

  for (const query of queries) {
    console.log(`\n\n🔎 QUERY: "${query}"`);
    console.log("--------------------------------------------------");

    try {
      // Step 1: LLM Extraction
      console.log("Step 1: Extracting raw terms with Gemini 2.5 Flash...");
      const startExtract = Date.now();
      const extracted = await extractFiltersFromText(query);
      console.log(`  Extracted in ${Date.now() - startExtract}ms:`);
      console.log(`  - Raw Tech: ${extracted.raw_tech?.join(", ") || "None"}`);
      console.log(`  - Raw Industry: ${extracted.raw_industry?.join(", ") || "None"}`);
      console.log(`  - Seniority: ${extracted.person_seniority?.join(", ") || "None"}`);

      // Step 2: Vector DB Resolution
      console.log("\nStep 2: Resolving terms against Prospeo database enums...");

      if (extracted.raw_tech?.length > 0) {
        const techMatch = await resolveTerms(extracted.raw_tech, "technology", { topK: 1 });
        console.log("  [Tech Results]:");
        techMatch.resolved.forEach((r: any) => {
          console.log(`    "${r.query}" => "${r.match}" (Score: ${r.score.toFixed(3)}${r.confident ? ' ✅' : ' ❌'})`);
        });
        if (techMatch.unresolved.length > 0) {
          console.log(`    Unresolved: ${techMatch.unresolved.join(", ")}`);
        }
      }

      if (extracted.raw_industry?.length > 0) {
        const indMatch = await resolveTerms(extracted.raw_industry, "industry", { topK: 1 });
        console.log("  [Industry Results]:");
        indMatch.resolved.forEach((r: any) => {
          console.log(`    "${r.query}" => "${r.match}" (Score: ${r.score.toFixed(3)}${r.confident ? ' ✅' : ' ❌'})`);
        });
        if (indMatch.unresolved.length > 0) {
          console.log(`    Unresolved: ${indMatch.unresolved.join(", ")}`);
        }
      }

      // Step 3: Prospeo Search Suggestions API (Titles & Locations)
      const { prospeoSearchSuggestions } = await import("../lib/prospeo/client");

      console.log("\nStep 3: Resolving Job Titles & Locations against Prospeo API...");

      if (extracted.raw_job_titles?.length > 0) {
        console.log("  [Job Title Results]:");
        for (const title of extracted.raw_job_titles) {
          const res = await prospeoSearchSuggestions("job_title_search", title);
          if (res.suggestions && res.suggestions.length > 0) {
            console.log(`    "${title}" => [ ${res.suggestions.slice(0, 3).map((s: any) => `"${s}"`).join(", ")} ...]`);
          } else {
            console.log(`    "${title}" => No suggestions found. Raw Response:`, res);
          }
        }
      }

      if (extracted.raw_location) {
        console.log("  [Location Results]:");
        const res = await prospeoSearchSuggestions("location_search", extracted.raw_location);
        if (res.suggestions && res.suggestions.length > 0) {
          console.log(`    "${extracted.raw_location}" => [ ${res.suggestions.slice(0, 3).map((s: any) => `"${s}"`).join(", ")} ...]`);
        } else {
          console.log(`    "${extracted.raw_location}" => No suggestions found. Raw Response:`, res);
        }
      }

    } catch (err) {
      console.error(`Error processing query: ${err}`);
    }
  }
}

main().catch(console.error);
