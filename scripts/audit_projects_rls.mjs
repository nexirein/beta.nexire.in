import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const query = `
    SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
    FROM
        pg_policies
    WHERE
        tablename = 'projects';
  `;

  // Use the RPC if available, or just log the intent
  const { data, error } = await supabase.rpc('execute_sql_internal', { sql_query: query });
  
  if (error) {
    console.error("Error fetching policies:", error.message);
  } else {
    console.log("Projects Policies:", JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
