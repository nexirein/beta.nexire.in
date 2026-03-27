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

async function setupUser(email, password, fullName, credits = 30, orgOverride = null) {
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
      user_metadata: {
        full_name: fullName,
        org_name: orgName
      }
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
  const orgName = orgOverride || "Truckinzy Recruitment Beta";
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

  // 4. Ensure at least one project exists (so they land on search immediately)
  console.log("Ensuring at least one project exists...");
  const { data: projects } = await supabase.from("projects").select("id").eq("org_id", orgId).limit(1);
  if (!projects || projects.length === 0) {
    console.log("Creating 'First Project'...");
    await supabase.from("projects").insert({
      org_id: orgId,
      title: "First Project",
      status: "active"
    });
  }

  console.log(`SUCCESS: ${email} is ready.`);
}

async function main() {
  const users = [
    { 
      email: "sarah.jenkins@nexire.test", 
      password: "NexireTest2026!", 
      name: "Sarah Jenkins", 
      org: "Nexus Tech Solutions Beta" 
    },
    { 
      email: "david.miller@nexire.test", 
      password: "NexireTest2026!", 
      name: "David Miller", 
      org: "Apex Financial Group Beta" 
    },
    { 
      email: "elena.rodriguez@nexire.test", 
      password: "NexireTest2026!", 
      name: "Elena Rodriguez", 
      org: "Horizon Healthcare Beta" 
    },
    { 
      email: "james.chen@nexire.test", 
      password: "NexireTest2026!", 
      name: "James Chen", 
      org: "Peak Retail Ventures Beta" 
    },
    { 
      email: "amara.okafor@nexire.test", 
      password: "NexireTest2026!", 
      name: "Amara Okafor", 
      org: "Steel Core Manufacturing Beta" 
    }
  ];

  for (const u of users) {
    await setupUser(u.email, u.password, u.name, 15, u.org);
  }

  console.log("\n=== ALL USERS PROVISIONED ===");
}

main().catch((err) => {
  console.error("Error setting up beta user:", err);
});
