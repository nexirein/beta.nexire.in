import * as dotenv from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: users, error: uErr } = await supabase.auth.admin.listUsers();
  if (uErr) console.error("Users error:", uErr);
  else {
    console.log("Latest Auth Users:");
    users.users.slice(0, 5).forEach(u => console.log(u.id.substring(0, 8), u.email, u.created_at));
  }

  const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, org_id, full_name, created_at").order("created_at", { ascending: false }).limit(5);
  if (pErr) console.error("Profiles err", pErr);
  else {
    console.log("\nLatest Profiles:");
    profiles.forEach(p => console.log(p.id.substring(0, 8), p.full_name, p.created_at));
  }
}

main().catch(console.error);
