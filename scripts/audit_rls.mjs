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
        tablename = 'search_conversations';
  `;

  // Note: RPC call or direct SQL might not work if permissions are restrictive
  // but let's try via a simple fetch of the schema or a direct query if possible.
  // Actually, I'll just use the execute_sql equivalent in a script.
  
  const { data, error } = await supabase.rpc('execute_sql_internal', { sql_query: query });
  
  if (error) {
    // If RPC doesn't exist, I'll try to list the metadata via standard API if possible
    console.error("Error fetching policies:", error.message);
    console.log("Falling back to table metadata analysis...");
  } else {
    console.log("Policies:", JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
