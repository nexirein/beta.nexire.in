import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const bipulId = "7742d412-1867-40c7-a990-5c570ec9c47f";
  
  const { data: convs } = await supabase.from("search_conversations").select("*").eq("user_id", bipulId).limit(5);
  console.log(`Checking Bipul's history (${bipulId}):`);
  convs?.forEach(c => console.log(` - ${c.title} (${c.id})`));
}

main().catch(console.error);
