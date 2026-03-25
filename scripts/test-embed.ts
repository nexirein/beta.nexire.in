import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-1.5:batchEmbedContents?key=${apiKey}`;

  // Let's try "models/text-embedding-004" with a different url endpoint or "models/text-embedding-004" 
  // Let's try gemini-embedding-001 or text-embedding-004
  const tryModel = async (endpointModel: string, internalModel: string) => {
    const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${endpointModel}:batchEmbedContents?key=${apiKey}`;
    const payload = {
      requests: [
        { model: `models/${internalModel}`, content: { parts: [{ text: "hello" }] }, outputDimensionality: 768 },
      ]
    };
    const res = await fetch(fetchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log(`Response for ${endpointModel}:`);
    if (data.embeddings) console.log("Success! Length:", data.embeddings[0].values.length);
    else console.log(data.error?.message);
  }

  await tryModel("text-embedding-004", "text-embedding-004");
  await tryModel("gemini-embedding-001", "gemini-embedding-001");
}

main().catch(console.error);
