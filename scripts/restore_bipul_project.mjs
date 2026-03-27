import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const bipulId = "7742d412-1867-40c7-a990-5c570ec9c47f";
  const bipulProjectId = "a22d20de-ebf0-468c-8306-f94fd4640302";
  
  console.log(`Re-linking Bipul's searches to his project ${bipulProjectId}...`);

  const { data, error } = await supabase
    .from("search_conversations")
    .update({ project_id: bipulProjectId })
    .eq("user_id", bipulId);

  if (error) {
    console.error("Update Error:", error);
  } else {
    console.log("Successfully restored Bipul's history to his own project.");
  }
}

main().catch(console.error);
