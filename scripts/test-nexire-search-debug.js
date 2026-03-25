const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

async function main() {
  const url = "http://localhost:3000/api/search";

  const filters = {
    person_job_title: {
      include: [
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
      ],
      match_only_exact_job_titles: false,
    },
    person_location_search: { include: ["Delhi, India", "Gurgaon Division, India"] },
    company_industry: {
      include: [
        "Transportation, Logistics, Supply Chain and Storage",
        "Truck and Railroad Transportation",
      ],
    },
    person_year_of_experience: { min: 5 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "", pre_built_filters: filters, page: 1, debug: true }),
  });

  const data = await res.json().catch(() => null);
  console.log("status:", res.status);
  console.log(JSON.stringify(data?.debug ?? data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

