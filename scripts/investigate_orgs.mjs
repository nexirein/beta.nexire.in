import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function investigate() {
  const { data: orgs } = await supabase
    .from("orgs")
    .select("id, name, credits_balance")
    .eq("name", "My Organisation");

  for (const org of orgs || []) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, title")
      .eq("org_id", org.id);
    
    const { count: profileCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);

    console.log(`Org: ${org.id} | Name: ${org.name} | Credits: ${org.credits_balance} | Profiles: ${profileCount}`);
    projects?.forEach(p => console.log(`   Project: ${p.title} (${p.id})`));
  }
}

investigate();
