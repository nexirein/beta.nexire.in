import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: usersData } = await supabase.auth.admin.listUsers();
  console.log("All Auth Users:");
  usersData?.users.forEach(u => console.log(` - ${u.email} (${u.id})`));
}

main().catch(console.error);
