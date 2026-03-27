import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const searchId = "fa282741-b417-4c60-9521-7e2c2ecd6ddb";
  
  // 1. Check specific search ownership
  const { data: search } = await supabase.from("search_conversations").select("*").eq("id", searchId).maybeSingle();
  console.log("Search Ownership:", search ? { id: search.id, user_id: search.user_id, title: search.title } : "Not found");

  // 2. Find Bipul and Chanchal IDs
  const { data: usersData } = await supabase.auth.admin.listUsers();
  const bipul = usersData?.users.find(u => u.email === "bipul@truckinzy.com");
  const chanchal = usersData?.users.find(u => u.email === "chanchal@truckinzy.com");

  console.log("Bipul ID:", bipul?.id || "Not found");
  console.log("Chanchal ID:", chanchal?.id || "Not found");
  
  // 3. List some other searches for Chanchal to see if they are mixed
  if (chanchal) {
    const { data: chanchalConvs } = await supabase.from("search_conversations").select("*").eq("user_id", chanchal.id).limit(10);
    console.log(`\nLast 10 searches for Chanchal (${chanchal.id}):`);
    chanchalConvs?.forEach(c => console.log(` - ${c.title} (${c.id})`));
  }
}

main().catch(console.error);
