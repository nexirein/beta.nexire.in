import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const bipulId = "7742d412-1867-40c7-a990-5c570ec9c47f";
  const chanchalId = "a904b54a-3694-450f-b0ba-de1c9f6899c7";
  
  // Find all searches currently owned by Chanchal
  const { data: convs } = await supabase.from("search_conversations").select("*").eq("user_id", chanchalId);
  
  if (!convs) return;

  for (const c of convs) {
    const title = (c.title || "").toLowerCase();
    // Titles that look like Bipul's based on his message and typical dev roles
    if (title.includes("backend") || title.includes("vadodara") || title.includes("developer")) {
      console.log(`Moving "${c.title}" back to Bipul...`);
      await supabase.from("search_conversations").update({ user_id: bipulId }).eq("id", c.id);
    }
  }
  
  console.log("Selective re-assignment complete.");
}

main().catch(console.error);
