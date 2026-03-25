import * as dotenv from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log("Emptying the prospeo_embeddings table...");
  const { error } = await supabase.from("prospeo_embeddings").delete().neq('id', 0); // Deletes everything

  if (error) {
    console.error("Failed to empty table:", error);
  } else {
    console.log("Successfully deleted all previous embeddings.");
  }
}

main().catch(console.error);
