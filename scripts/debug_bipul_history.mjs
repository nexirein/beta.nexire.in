import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const bipulId = "7742d412-1867-40c7-a990-5c570ec9c47f";
  
  const { data: convs } = await supabase.from("search_conversations").select("*").eq("user_id", bipulId);
  
  console.log(`Bipul's Total Searches: ${convs?.length || 0}`);
  if (convs) {
    convs.forEach(c => {
      console.log(` - Title: ${c.title}, ID: ${c.id}, Project: ${c.project_id}, Status: ${c.status}, Created: ${c.created_at}`);
    });
  }

  // Also check projects Bipul can see
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", bipulId).single();
  if (profile) {
    const { data: projects } = await supabase.from("projects").select("*").eq("org_id", profile.org_id);
    console.log(`\nProjects in Bipul's Org (${profile.org_id}):`);
    projects?.forEach(p => console.log(` - ${p.title} (${p.id})`));
  }
}

main().catch(console.error);
