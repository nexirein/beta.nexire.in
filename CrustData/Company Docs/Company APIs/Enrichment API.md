# Company Enrichment API

### [ 🚀 Try Now ](/api#tag/company-apis/GET/screener/company)

This endpoint enriches company data by retrieving detailed information about one or multiple companies using either their domain, name, or ID.

## Endpoint

```
GET /screener/company
```
## Data Dictionary 

[Explore the data dictionary for this endpoint here](/docs/2024-11-01/dictionary/company-enrichment)

## Request Parameters

| Field                  | Type    | Example                                                     | Description                                                                                                                                                    |
| ---------------------- | ------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company_domain`       | string  | `company_domain=crustdata.com,google.com`                     | The domain(s) of the company(ies) you want to retrieve data for. Accepts comma-separated list of up to 25 domains.                                             |
| `company_name`         | string  | `company_name="Acme, Inc.","Widget Co"`                     | The name(s) of the company(ies) you want to retrieve data for. Accepts comma-separated list of up to 25 names. Use double quotes if names contain commas.      |
| `company_linkedin_url` | string  | `company_linkedin_url=` `https://linkedin.com/company/hubspot` | The LinkedIn URL(s) of the company(ies). Accepts comma-separated list of up to 25 URLs.                                                                        |
| `company_id`           | integer | `company_id=12345,67890`                                    | The unique ID(s) of the company(ies) you want to retrieve data for. Accepts comma-separated list of up to 25 IDs.                                              |
| `fields`               | string  | `fields=headcount,funding_and_investment`         | Specifies which fields to include in the response. If not provided, returns basic company info and firmographics only. [See all fields](/docs/2024-11-01/dictionary/company-enrichment) |
| `enrich_realtime`      | boolean | `enrich_realtime=true`                                      | When True and the requested company is not present in Crustdata's database, the company is enriched within 10 minutes of the request. Default: False           |
| `exact_match`          | boolean | `exact_match=true`                                          | Controls how `company_name` (and `company_domain`) are matched. **`true`**: case-insensitive exact string match — every character including spaces must match the stored name. **`false`** (default): fuzzy/trigram match that tolerates minor variations but may return similar company names. See the [exact_match behavior](#7-exact-match-behavior-with-company-name) example below.                                  |

:::tip
The `fields` parameter allows you to customize the response by specifying exactly which fields you want to retrieve. This can help reduce payload size and improve performance.

-   **Default behavior**: Without the `fields` parameter, only basic company information and select firmographics are returned
-   **With fields parameter**: Returns only the explicitly requested fields
-   **Nested Fields:** You can specify nested fields up to the levels defined in the response structure (see [available fields here](/docs/2024-11-01/dictionary/company-enrichment)). Fields nested beyond the allowed levels or within lists (arrays) cannot be individually accessed.
-   **User Permissions:** Access to certain fields may be restricted based on your user permissions. If you request fields you do not have access to, the API will return an error indicating unauthorized access.

:::

### Important: Fields Parameter Usage {#important-fields-parameter-usage}

#### Default Response Behavior

Without the `fields` parameter, the API returns only:
- Basic company information (company_id, company_name, domains, LinkedIn info, etc.)
- Select firmographics fields (headquarters, year_founded, revenue estimates, etc.)
- **NO nested objects** (headcount, web_traffic, funding, glassdoor, etc.)

#### Getting Additional Data

To retrieve nested data objects like headcount, web_traffic, or funding information, you MUST explicitly include them in the `fields` parameter:
- Example: `fields=headcount,web_traffic,funding_and_investment`
- This returns ONLY the specified fields

### Replicating Previous Default Behavior

To get the same fields that were returned by default before this update, use this request:

```bash
curl 'https://api.crustdata.com/screener/company?company_domain=example.com&fields=headcount,competitors,funding_and_investment,g2,gartner,glassdoor,job_openings,linkedin_followers,news_articles,producthunt,seo,taxonomy,web_traffic,founders.founders_locations,founders.founders_education_institute,founders.founders_degree_name,founders.founders_previous_companies,founders.founders_previous_titles' \
--header 'Authorization: Token $authToken'
```

**Additional fields available:** The above excludes `decision_makers`, `founders.profiles` (detailed profiles), and `cxos` which were not in the previous default. To include these as well:

```bash
curl 'https://api.crustdata.com/screener/company?company_domain=example.com&fields=headcount,competitors,funding_and_investment,g2,gartner,glassdoor,job_openings,linkedin_followers,news_articles,producthunt,seo,taxonomy,web_traffic,decision_makers,founders,cxos' \
--header 'Authorization: Token $authToken'
```

## Credit Usage

- **Database Enrichment**: 1 credit per company
- **Real-Time Enrichment** (`enrich_realtime=True`): 5 credits per company (4+1)
- **No Results, No Charges**: You are never charged credits when our APIs return no results. Credits are only deducted when data is successfully returned from your API requests.

## Example Requests

<details id="1-enrich-by-linkedin-profile-url">
<summary>1. Enrich by LinkedIn profile URL</summary>

### 1. Enrich by LinkedIn profile URL
```curl 
curl 'https://api.crustdata.com/screener/company?company_linkedin_url=https://www.linkedin.com/company/mintlify' \
--header 'Authorization: Token $authToken'
```
</details>

<details id="2-enrich-by-domain-with-fields-and-exact-match">
<summary>2. Enrich by Domain w/ Fields & Exact Match</summary>

### 2. Enrich by Domain w/ Fields & Exact Match
```curl
curl 'https://api.crustdata.com/screener/company?fields=headcount,founders.profiles,funding_and_investment&exact_match=true&company_domain=retool.com,mintlify.com' \
--header 'Authorization: Token $authToken'
```

Key features:
- `fields=headcount,founders.profiles,funding_and_investment` - Returns only specified fields
- `exact_match=true` - Matches domains exactly, not as substrings
</details>

<details id="3-enrich-by-domain-with-real-time-enrichment">
<summary>3. Enrich by Domain w/ Real-Time Enrichment</summary>

### 3. Enrich by Domain w/ Real-Time Enrichment
- Setting `enrich_realtime=true` retrieves data within 10 minutes for companies not in our database.

```curl
curl 'https://api.crustdata.com/screener/company?company_domain=browser-use.com&fields=headcount,founders.profiles,funding_and_investment&enrich_realtime=true' \
--header 'Authorization: Token $authToken'
```
</details>

<details id="4-enrich-with-gartner-data">
<summary>4. Enrich with Gartner Data</summary>

### 4. Enrich with Gartner Data
- Get Gartner data for a company by including `fields=gartner` in your request
- You can also request specific Gartner fields like `gartner.slug` or `gartner.products`

```curl
curl 'https://api.crustdata.com/screener/company?exact_match=true&company_domain=builder.io&fields=gartner' \
--header 'Authorization: Token $authToken'
```

Key features:
- `fields=gartner` - Returns all Gartner data
- `fields=gartner.slug,gartner.products` - Returns only specific Gartner fields
- Available fields: `gartner.slug`, `gartner.company_name`, `gartner.company_website_url`, `gartner.description`, `gartner.year_founded`, `gartner.head_office_city`, `gartner.head_office_country`, `gartner.num_employees_min`, `gartner.num_employees_max`, `gartner.products`, `gartner.reviews`

Response sample: [View example response](/examples/company-enrichment/company-enrichment-gartner-response.json)
</details>

<details id="5-enrich-with-producthunt-data">
<summary>5. Enrich with ProductHunt Data</summary>

### 5. Enrich with ProductHunt Data
- Get ProductHunt data for a company by including `fields=producthunt` in your request
- Includes company profile, ratings, reviews, launch history, and maker information

```curl
curl 'https://api.crustdata.com/screener/company?exact_match=true&company_domain=builder.io&fields=producthunt' \
--header 'Authorization: Token $authToken'
```

Key features:
- `fields=producthunt` - Returns all ProductHunt data
- Includes: company profile, product ratings, reviews, launch history, maker information, social media links, and categories

Response sample: [View example response](/examples/company-enrichment/company-enrichment-producthunt-response.json)
</details>

<details id="6-enrich-with-full-profile-data">
<summary>6. Enrich with Full Profile Data (All Fields)</summary>

### 6. Enrich with Full Profile Data (All Fields)
- Get complete company data including all available fields like founders profiles, CXOs, decision makers, and more
- This request returns all available data fields for comprehensive company intelligence

```curl
curl 'https://api.crustdata.com/screener/company?company_domain=ziphq.com&fields=headcount,founders,cxos,decision_makers,funding_and_investment,web_traffic,glassdoor,g2,linkedin_followers,job_openings,seo,news_articles,producthunt,gartner,competitors,taxonomy,all_office_addresses,estimated_revenue_timeseries,markets' \
--header 'Authorization: Token $authToken'
```

Key features:
- Returns all major data categories including people profiles
- `founders` - All founder data: locations, education, previous companies, and full LinkedIn profiles
- `cxos` - C-level executive profiles with complete background
- `decision_makers` - Key personnel with employment and education history
- `estimated_revenue_timeseries` - Historical revenue estimate data points
- `markets` - Market listings (e.g., NASDAQ, NYSE, PRIVATE)
- Includes growth metrics, social data, and competitive intelligence

<details>
<summary>View example response with all fields</summary>

Response sample: [View full example response](/examples/company-enrichment/response_ziphq.json)

</details>
</details>

<details id="7-exact-match-behavior-with-company-name">
<summary>7. exact_match behavior with company_name</summary>

### 7. exact_match behavior with company_name

`exact_match=true` performs a **case-insensitive exact string match** against the stored company name. This means every character — including spaces and punctuation — must match exactly. `exact_match=false` uses fuzzy (trigram) matching and tolerates minor variations, but may return neighboring companies.

#### The key gotcha: spacing and formatting in stored names

The stored name is sourced from LinkedIn and may not match the "common" way a company is written. For example, the company commonly known as "Tomo Credit" is stored as `"TomoCredit"` (no space):

```bash
# Returns empty — stored name is "TomoCredit", not "Tomo Credit"
curl 'https://api.crustdata.com/screener/company?company_name=Tomo%20Credit&exact_match=true&fields=company_id,company_name,linkedin_profile_url' \
--header 'Authorization: Token $authToken'
# Response: []

# Works — matches stored name exactly (case-insensitive)
curl 'https://api.crustdata.com/screener/company?company_name=TomoCredit&exact_match=true&fields=company_id,company_name,linkedin_profile_url' \
--header 'Authorization: Token $authToken'
# Response: [{"company_id": 634576, "company_name": "TomoCredit", ...}]
```

#### exact_match=false can return similar-but-wrong companies

Fuzzy matching is lenient, which helps with spacing issues, but can pull in neighboring companies:

```bash
# "Stripe" with exact_match=false may return both "Stripe" and "Stripes"
curl 'https://api.crustdata.com/screener/company?company_name=Stripe&exact_match=false&fields=company_id,company_name' \
--header 'Authorization: Token $authToken'
# Response: [{"company_name": "Stripe", ...}, {"company_name": "Stripes", ...}]
```

#### Recommended fallback strategy when matching by name

1. Try `exact_match=true` first.
2. If the response is empty, retry with `exact_match=false`.
3. Always verify the returned `company_name` (or `linkedin_profile_url`) matches the company you intended before consuming the result.

```bash
# Step 1: try exact
curl 'https://api.crustdata.com/screener/company?company_name=Tomo%20Credit&exact_match=true&fields=company_id,company_name,linkedin_profile_url' \
--header 'Authorization: Token $authToken'

# Step 2: if empty, fall back to fuzzy and verify company_name in response
curl 'https://api.crustdata.com/screener/company?company_name=Tomo%20Credit&exact_match=false&fields=company_id,company_name,linkedin_profile_url' \
--header 'Authorization: Token $authToken'
# Returns: [{"company_name": "TomoCredit", "linkedin_profile_url": "https://www.linkedin.com/company/tomocredit", ...}]
# Verify "TomoCredit" is the company you want before using this record.
```

</details>

## Example Responses

<details id="1-response-and-enrichment-status">
<summary>Response</summary>

### Response

The response provides a comprehensive profile of the company, including firmographic details, social media links, headcount data, and growth metrics.

- Response sample with default fields : [View example response](/examples/company-enrichment/company-enrichment-response.json)
- Response sample with all the fields : [View example response](/examples/company-enrichment/response_ziphq.json)

### Response with Enrichment Status

When requesting data for a company not in our database, the enrichment process begins:

- Standard enrichment: Up to 24 hours
- Real time enrichment (`enrich_realtime=True`): Up to 10 minutes

The API response includes a status field with the following possible values:

- `enriching`: Company is being processed, poll later for full company info
  When a company is still being enriched, you might see a **202 Accepted** status code along with a response like this:

```json
[
  {
    "status": "enriching",
    "message": "The following companies will be enriched in the next 24 hours",
    "companies": [
      {
        "identifier": "https://www.linkedin.com/company/123456",
        "type": "linkedin_url"
      }
    ]
  }
]
```
- `not_found`: Enrichment failed (e.g., no website or employees found)

When a company cannot be found (e.g., it has no valid data or website), you may see a response like this:

```json
[
  {
    "status": "not_found",
    "message": "The requested company was not found and no data is available",
    "companies": [
      {
        "identifier": "https://www.linkedin.com/company/123456",
        "type": "linkedin_url"
      }
    ]
  }
]
```
</details>