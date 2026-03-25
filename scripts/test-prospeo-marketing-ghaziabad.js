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
    return { error: true, error_code, message, filter_error };
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
    return;
  }
  const total = response.pagination?.total_count;
  const pages = response.pagination?.total_page;
  console.log(`${name}: total_count=${total} total_page=${pages}`);
}

async function main() {
  const jobTitles = [
    "marketing executive",
    "digital marketing executive",
    "sales marketing executive",
    "senior marketing executive",
    "business development executive",
    "senior business development executive",
    "sr. business development executive",
    "international business development executive",
    "sales and marketing specialist",
    "marketing specialist",
    "Marketing Executive",
    "Business Development Executive",
    "Marketing Specialist",
    "Sales Executive",
    "Account Executive",
  ];

  const base = {
    person_job_title: { include: jobTitles },
    person_location_search: { include: ["Ghaziabad, India", "Ghaziabad Tehsil, India"] },
    company_industry: {
      include: [
        "Transportation, Logistics, Supply Chain and Storage",
        "Truck and Railroad Transportation",
      ],
    },
    person_year_of_experience: { min: 2 },
  };

  const exact = {
    ...base,
    person_job_title: { ...base.person_job_title, match_only_exact_job_titles: true },
  };

  const contains = {
    ...base,
    person_job_title: { ...base.person_job_title, match_only_exact_job_titles: false },
  };

  for (const [name, filters] of [
    ["A) exact", exact],
    ["B) contains", contains],
  ]) {
    const resp = await prospeoSearchPeople(filters, 1);
    summarize(name, resp);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

