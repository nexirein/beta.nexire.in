import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const oldProjectId = "a22d20de-ebf0-468c-8306-f94fd4640302";
  const newProjectId = "307ffc8b-2add-42a5-a4af-48f217b09463";
  
  const { data: oldProj } = await supabase.from("projects").select("*").eq("id", oldProjectId).maybeSingle();
  console.log("Old Project Data:", oldProj);

  if (oldProj || true) { // Even if the project row is gone, the searches might exist
    const { data: convs, error: updateError } = await supabase
      .from("search_conversations")
      .update({ project_id: newProjectId })
      .eq("project_id", oldProjectId);
    
    if (updateError) {
      console.error("Update Error:", updateError);
    } else {
      console.log(`Successfully moved searches to new project.`);
    }
  }
}

main().catch(console.error);
