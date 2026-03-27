import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: convs } = await supabase.from("search_conversations").select("*").order("created_at", { ascending: false }).limit(20);
  console.log("Last 20 search_conversations:");
  if (convs?.length > 0) {
    convs.forEach(c => {
      console.log(` - ID: ${c.id}, User: ${c.user_id}, Project: ${c.project_id}, Title: ${c.title}, Created: ${c.created_at}`);
    });
  } else {
    console.log("No conversations found.");
  }
}

main().catch(console.error);
