import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const oldUserId = "7742d412-1867-40c7-a990-5c570ec9c47f";
  const newChanchalId = "a904b54a-3694-450f-b0ba-de1c9f6899c7";
  const newProjectId = "307ffc8b-2add-42a5-a4af-48f217b09463";
  
  console.log(`Re-assigning searches from ${oldUserId} to ${newChanchalId}...`);

  const { data, error } = await supabase
    .from("search_conversations")
    .update({ user_id: newChanchalId, project_id: newProjectId })
    .eq("user_id", oldUserId);

  if (error) {
    console.error("Update Error:", error);
  } else {
    console.log("Successfully re-assigned history to Chanchal.");
  }
}

main().catch(console.error);
