import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; 

async function main() {
  // Try to use Bipul's ID with the ANON key (to simulate a client request)
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  // Note: To truly test RLS, we need a JWT. 
  // But I'll just check if RLS is enabled on the table first.
  const { data, error } = await supabase.from("search_conversations").select("count");
  
  if (error) {
    console.log("RLS Active or Error:", error.message);
  } else {
    console.log("Accessible rows without auth:", data);
  }
}

main().catch(console.error);
