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

async function setupUser(email, password, fullName, credits = 30) {
  console.log(`\n--- Setting up Beta User: ${email} ---`);

  // 1. Create or ensure user exists in auth.users
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
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
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (updateError) throw updateError;
  }

  // 2. Ensure they have an Org
  console.log("Checking for organization...");
  let orgId;
  const orgName = "Truckinzy Recruitment Beta";
  const { data: orgData } = await supabase.from("orgs").select("id").eq("name", orgName).limit(1).maybeSingle();

  if (orgData) {
    orgId = orgData.id;
    console.log(`Updating org credits to ${credits}...`);
    await supabase.from("orgs").update({ credits_balance: credits }).eq("id", orgId);
  } else {
    console.log(`Creating new org and assigning ${credits} credits...`);
    const { data: newOrg, error: orgError } = await supabase
      .from("orgs")
      .insert({ name: orgName, plan: "free", credits_balance: credits, credits_monthly: credits })
      .select("id")
      .single();
    if (orgError) throw orgError;
    orgId = newOrg.id;
  }

  // 3. Ensure profile is linked to org
  console.log("Ensuring user profile is linked to org...");
  const { data: profileData } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();

  if (profileData) {
    await supabase.from("profiles").update({ org_id: orgId, full_name: fullName }).eq("id", user.id);
  } else {
    await supabase.from("profiles").insert({
      id: user.id,
      org_id: orgId,
      full_name: fullName,
      member_role: "owner"
    });
  }

  console.log(`SUCCESS: ${email} is ready.`);
}

async function main() {
  const users = [
    { email: "chanchal@truckinzy.com", password: "password123", name: "Chanchal" },
    { email: "rk@truckinzy.com", password: "password123", name: "Rachit" }
  ];

  for (const u of users) {
    await setupUser(u.email, u.password, u.name);
  }

  console.log("\n=== ALL USERS PROVISIONED ===");
}

main().catch((err) => {
  console.error("Error setting up beta user:", err);
});
