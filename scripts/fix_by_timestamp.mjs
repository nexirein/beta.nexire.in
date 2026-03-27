import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const bipulId = "7742d412-1867-40c7-a990-5c570ec9c47f";
  const chanchalId = "a904b54a-3694-450f-b0ba-de1c9f6899c7";
  const chanchalProvisionedAt = "2026-03-25T08:34:09Z";
  
  const { data: convs } = await supabase.from("search_conversations").select("*").eq("user_id", chanchalId);
  
  if (!convs) return;

  for (const c of convs) {
    if (new Date(c.created_at) < new Date(chanchalProvisionedAt)) {
      console.log(`Moving historical search "${c.title}" (ID: ${c.id}, Created: ${c.created_at}) back to Bipul...`);
      await supabase.from("search_conversations").update({ user_id: bipulId }).eq("id", c.id);
    }
  }
  
  console.log("Cleanup complete based on timestamps.");
}

main().catch(console.error);
