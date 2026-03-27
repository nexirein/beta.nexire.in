import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanup() {
  console.log("--- Starting Organization Cleanup ---");

  // 1. Find all orgs named "My Organisation"
  const { data: orgs, error: fetchError } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("name", "My Organisation");

  if (fetchError) throw fetchError;
  console.log(`Found ${orgs?.length || 0} organizations named 'My Organisation'.`);

  let deletedCount = 0;

  for (const org of orgs) {
    // 2. Check for linked profiles
    const { count: profileCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);

    // 3. Check for linked projects (just in case)
    const { count: projectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);

    if (profileCount === 0) {
      console.log(`Deleting orphaned org (unowned): ${org.id} | Name: ${org.name}`);
      
      // Delete projects first to be safe (if not cascaded)
      const { error: projDeleteError } = await supabase
        .from("projects")
        .delete()
        .eq("org_id", org.id);
      
      if (projDeleteError) console.error(`Project delete error: ${projDeleteError.message}`);

      const { error: deleteError } = await supabase
        .from("orgs")
        .delete()
        .eq("id", org.id);
      
      if (deleteError) {
        console.error(`Failed to delete org ${org.id}: ${deleteError.message}`);
      } else {
        deletedCount++;
      }
    } else {
      console.log(`Skipping active org (has ${profileCount} profiles): ${org.id}`);
    }
  }

  console.log(`\nCOMPLETED: Deleted ${deletedCount} orphaned organizations.`);
}

cleanup().catch(err => {
  console.error("Cleanup failed:", err);
});
