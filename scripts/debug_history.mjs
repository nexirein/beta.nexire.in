import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const orgName = "Truckinzy Recruitment Beta";
  
  const { data: orgData } = await supabase.from("orgs").select("*").eq("name", orgName).single();
  console.log("Org Data:", orgData);

  if (orgData) {
    const { data: projectsData } = await supabase.from("projects").select("*").eq("org_id", orgData.id);
    console.log("Projects in Org:", projectsData);

    if (projectsData?.length > 0) {
      for (const p of projectsData) {
        const { data: searchesData } = await supabase.from("searches").select("*").eq("project_id", p.id);
        console.log(`Searches for Project ${p.title} (${p.id}):`, searchesData?.length || 0);
      }
    }
  }
}

main().catch(console.error);
