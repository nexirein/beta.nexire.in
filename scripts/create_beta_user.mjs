import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const email = "bipul@nexire.in";
  const password = "password123";
  const credits = 60; // 20 searches x 3 credits

  console.log(`Setting up Beta User: ${email}`);

  // 1. Create or ensure user exists in auth.users
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  let user = usersData?.users.find((u) => u.email === email);

  if (!user) {
    console.log("Creating new user in auth.users...");
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw createError;
    user = createData.user;
  } else {
    console.log("User already exists in auth.users. Updating password...");
    await supabase.auth.admin.updateUserById(user.id, { password });
  }

  // 2. Ensure they have an Org
  console.log("Checking for organization...");
  let orgId;
  const { data: orgData } = await supabase.from("orgs").select("id").eq("name", "Beta Invite Org").limit(1).single();

  if (orgData) {
    orgId = orgData.id;
    console.log(`Creating/Updating org credits to ${credits}...`);
    await supabase.from("orgs").update({ credits_balance: credits }).eq("id", orgId);
  } else {
    console.log(`Creating new org and assigning ${credits} credits...`);
    const { data: newOrg, error: orgError } = await supabase
      .from("orgs")
      .insert({ name: "Beta Invite Org", plan: "free", credits_balance: credits, credits_monthly: credits })
      .select("id")
      .single();
    if (orgError) throw orgError;
    orgId = newOrg.id;
  }

  // 3. Ensure profile is linked to org
  console.log("Ensuring user profile is linked to org...");
  const { data: profileData } = await supabase.from("profiles").select("id").eq("id", user.id).single();

  if (profileData) {
    await supabase.from("profiles").update({ org_id: orgId }).eq("id", user.id);
  } else {
    await supabase.from("profiles").insert({
      id: user.id,
      org_id: orgId,
      full_name: "Beta Tester",
      member_role: "owner"
    });
  }

  console.log("\\n=== SUCCESS ===");
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Credits:  ${credits} (equivalent to 20 searches)`);
  console.log("You can now build and deploy the application.");
}

main().catch((err) => {
  console.error("Error setting up beta user:", err);
});
