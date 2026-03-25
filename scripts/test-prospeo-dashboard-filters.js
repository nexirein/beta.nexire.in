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
    "fleet manager",
    "national fleet manager",
    "regional fleet manager",
    "assistant fleet manager",
    "logistics manager",
    "senior logistics manager",
    "assistant logistics manager",
    "warehouse logistics manager",
    "transportation manager",
    "senior transportation manager",
    "Fleet Manager",
    "Logistics Manager",
    "Transportation Manager",
    "Fleet Operations Manager",
  ];

  const base = {
    person_job_title: { include: jobTitles },
    person_location_search: { include: ["Delhi, India", "Gurgaon Division, India"] },
    company_industry: {
      include: [
        "Transportation, Logistics, Supply Chain and Storage",
        "Truck and Railroad Transportation",
      ],
    },
    person_year_of_experience: { min: 5 },
  };

  const exact = {
    ...base,
    person_job_title: { ...base.person_job_title, match_only_exact_job_titles: true },
  };

  const contains = {
    ...base,
    person_job_title: { ...base.person_job_title, match_only_exact_job_titles: false },
  };

  const withNewDelhi = {
    ...contains,
    person_location_search: {
      include: ["Delhi, India", "New Delhi, India", "Gurgaon Division, India"],
    },
  };

  const restrictedLikeNexire = {
    ...contains,
    person_seniority: { include: ["Manager", "Senior"] },
    person_department: { include: ["Operations"] },
    company_keywords: {
      include: ["SAP"],
      include_all: false,
      include_company_description: true,
      include_company_description_seo: true,
    },
  };

  // Product Manager India / SaaS sanity checks
  const pmJobTitles = [
    "senior product manager / product owner",
    "product manager",
    "senior product manager",
    "associate product manager",
    "technical product manager",
    "senior associate product manager",
    "associate product manager ii",
    "sr. associate product manager",
    "senior product manager - technical",
    "senior product manager - tech",
    "Product Manager",
    "Associate Product Manager",
    "Senior Product Manager",
    "Product Owner",
    "Technical Product Manager",
  ];

  const pmBase = {
    person_job_title: { include: pmJobTitles, match_only_exact_job_titles: false },
    person_location_search: { include: ["India"] },
  };

  const pmWithSeniorityAndIndustry = {
    ...pmBase,
    person_seniority: { include: ["Entry", "Senior"] },
    company_industry: {
      include: ["Computer Software", "Software Development", "Internet", "Information Technology & Services", "SaaS"],
    },
  };

  const pmTitlesOnlyIndia = {
    person_job_title: { include: pmJobTitles, match_only_exact_job_titles: false },
    person_location_search: { include: ["India"] },
  };

  const tests = [
    ["A) exact job titles", exact],
    ["B) contains job titles", contains],
    ["C) contains + New Delhi", withNewDelhi],
    ["D) contains + seniority+dept+SAP", restrictedLikeNexire],
    ["E) PM India (titles+India only)", pmTitlesOnlyIndia],
    ["F) PM India (titles+India+seniority+SaaS-ish industries)", pmWithSeniorityAndIndustry],
  ];

  for (const [name, filters] of tests) {
    const resp = await prospeoSearchPeople(filters, 1);
    summarize(name, resp);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
