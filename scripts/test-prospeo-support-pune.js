const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

const PROSPEO_BASE = "https://api.prospeo.io";

async function prospeoSearchPeople(filters, page = 1) {
  const key = process.env.PROSPEO_API_KEY;
  if (!key) throw new Error("PROSPEO_API_KEY not set");

  const res = await fetch(`${PROSPEO_BASE}/search-person`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-KEY": key,
    },
    body: JSON.stringify({ filters, page }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const obj = typeof data === "object" && data !== null ? data : null;
    const error_code = obj && typeof obj.error_code === "string" ? obj.error_code : `HTTP_${res.status}`;
    const message = obj && typeof obj.message === "string" ? obj.message : String(data);
    const filter_error = obj && typeof obj.filter_error === "string" ? obj.filter_error : undefined;
    return { error: true, error_code, message, filter_error, raw: obj ?? data };
  }

  return data;
}

function summarize(name, response) {
  if (!response || typeof response !== "object") {
    console.log(`${name}: Unexpected response`, response);
    return;
  }
  if (response.error) {
    console.log(`${name}: ERROR ${response.error_code}`);
    if (response.filter_error) console.log(`  filter_error: ${response.filter_error}`);
    if (response.message) console.log(`  message: ${response.message}`);
    console.log("  raw:", JSON.stringify(response.raw, null, 2));
    return;
  }

  const total = response.pagination?.total_count;
  const pages = response.pagination?.total_page;
  console.log(`${name}: total_count=${total} total_page=${pages}`);
}

async function main() {
  const titles = [
    "technical support specialist",
    "senior technical support specialist",
    "technical support specialist ii",
    "it technical support specialist",
    "customer support engineer",
    "senior customer support engineer",
    "sr. customer support engineer",
    "customer support engineering",
    "Product Support T1",
    "Technical Support Specialist",
    "Customer Support Engineer",
    "Help Desk Analyst",
    "Support Analyst",
  ];

  const filtersFromUi = {
    person_job_title: { include: titles, match_only_exact_job_titles: false },
    person_location_search: { include: ["Pune, India", "Pune Division, India"] },
    company_industry: {
      include: [
        "Transportation, Logistics, Supply Chain and Storage",
        "Truck and Railroad Transportation",
      ],
    },
    // Simulate a simple skill signal like SQL being mapped into keywords
    company_keywords: {
      include: ["SQL"],
      include_all: false,
      include_company_description: true,
      include_company_description_seo: true,
    },
  };

  const resp = await prospeoSearchPeople(filtersFromUi, 1);
  summarize("Support Pune + Logistics + SQL", resp);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

