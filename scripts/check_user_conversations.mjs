import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const emails = ["chanchal@truckinzy.com", "rk@truckinzy.com"];
  
  for (const email of emails) {
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const user = usersData?.users.find(u => u.email === email);
    
    if (user) {
      console.log(`\nChecking conversations for ${email} (${user.id}):`);
      const { data: convs } = await supabase.from("search_conversations").select("*").eq("user_id", user.id);
      console.log(`Found ${convs?.length || 0} conversations.`);
      if (convs?.length > 0) {
        convs.forEach(c => {
          console.log(` - ID: ${c.id}, Project: ${c.project_id}, Title: ${c.title}, Status: ${c.status}`);
        });
      }
    }
  }
}

main().catch(console.error);
