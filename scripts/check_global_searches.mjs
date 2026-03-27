import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: allSearches } = await supabase.from("searches").select("*").order("created_at", { ascending: false }).limit(10);
  console.log("Last 10 Global Searches:", allSearches);
}

main().catch(console.error);
