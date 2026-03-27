import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verify() {
  const emails = [
    "sarah.jenkins@nexire.test",
    "david.miller@nexire.test",
    "elena.rodriguez@nexire.test",
    "james.chen@nexire.test",
    "amara.okafor@nexire.test"
  ];

  console.log("Checking users...");
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) throw authError;

  for (const email of emails) {
    const user = users.find(u => u.email === email);
    if (user) {
      console.log(`[PASS] User exists: ${email}`);
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (profile?.org_id) {
        const { data: org } = await supabase.from("orgs").select("name, credits_balance").eq("id", profile.org_id).single();
        console.log(`       Org: ${org?.name}, Credits: ${org?.credits_balance}`);
        const { data: proj } = await supabase.from("projects").select("count").eq("org_id", profile.org_id);
        console.log(`       Projects: ${proj?.[0]?.count || 0}`);
      } else {
        console.log(`[FAIL] No profile/org for ${email}`);
      }
    } else {
      console.log(`[FAIL] User MISSING: ${email}`);
    }
  }
}

verify().catch(console.error);
