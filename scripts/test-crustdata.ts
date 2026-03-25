import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { CrustDataClient } from "../lib/crustdata/client";

dotenv.config({ path: ".env.local" });

const CRUSTDATA_API_KEY = process.env.CRUSTDATA_API_KEY;

if (!CRUSTDATA_API_KEY) {
  console.error("❌ CRUSTDATA_API_KEY not found in .env.local");
  process.exit(1);
}

async function testSearch() {
  const client = new CrustDataClient(CRUSTDATA_API_KEY!);

  console.log("🚀 Testing CrustData PersonDB Search...");
  
  // Example filter: Software Engineer in Mumbai
  const testFilters = {
    op: "and",
    conditions: [
      {
        column: "current_employers.title",
        type: "(.)",
        value: "Software Engineer"
      },
      {
        column: "region",
        type: "geo_distance",
        value: {
          location: "Mumbai, Maharashtra, India",
          distance: 30,
          unit: "mi"
        }
      }
    ]
  };
  
  const searchRequest = {
    filters: testFilters,
    limit: 20,
    preview: false // Disabled as requested to see real consumption
  };

  const crustdata = require("../lib/crustdata/client");

  try {
    const initialCredits = await crustdata.crustdataGetCredits();
    console.log(`\n💳 Initial Credits: ${initialCredits ?? "Unknown"}`);

    console.log("📡 Sending Filter Tree:", JSON.stringify(testFilters, null, 2));
    const startTime = Date.now();
    // Use the low-level search function to test the full request object
    const results = await crustdata.crustdataSearchPeople(searchRequest);
    const duration = Date.now() - startTime;

    if (results.error) {
       console.error("\n❌ Search API Error:", results.error);
    } else {
       console.log(`\n✅ Success! (Took ${duration}ms)`);
       console.log(`📊 Total Matches: ${results.total_count}`);
       console.log(`🔍 Fetched Results: ${results.profiles?.length || 0}`);
       console.log(`📌 First Profile: ${results.profiles?.[0]?.full_name || "N/A"}`);
       console.log(`🔗 URL: ${results.profiles?.[0]?.linkedin_profile_url || "N/A"}`);
    }
    
    const finalCredits = await crustdata.crustdataGetCredits();
    console.log(`\n💳 Final Credits: ${finalCredits ?? "Unknown"}`);
    if (initialCredits !== null && finalCredits !== null) {
      console.log(`📉 Credits Consumed: ${initialCredits - finalCredits}`);
    }

  } catch (error: any) {
    console.error("\n❌ Script Execution Failed:", error.message);
  }
}

testSearch();
