# Company Identification API

### [ 🚀 Try Now ](/api#tag/company-apis/POST/screener/identify/)

Given a company's name, website, LinkedIn profile, Crunchbase profile, or company ID, you can identify the company in Crustdata's database with company identification API.

## Endpoint

```
POST /screener/identify
```

## Data Dictionary

[Explore the data dictionary for this endpoint here](/docs/2024-11-01/dictionary/company-identification)

## Request Parameters

| Payload Keys                    | Description                         | Required | Default |
| ---------------------------- | ----------------------------------- | -------- | ------- |
| `query_company_name`         | Name of the company                 | No       | -       |
| `query_company_website`      | Website of the company              | No       | -       |
| `query_company_linkedin_url` | LinkedIn profile URL of the company | No       | -       |
| `query_company_crunchbase_url` | Crunchbase profile URL of the company | No       | -       |
| `query_company_id`           | Company ID in Crustdata's database  | No       | -       |
| `exact_match`                | Controls how `query_company_name` is matched. **`true`**: case-insensitive exact string match — spaces and punctuation must match the stored name. **`false`** (default): fuzzy/trigram match that tolerates minor variations but may return similar companies. See the [exact_match behavior](#6-exact-match-behavior-with-company-name) example below.   | No       | false   |
| `count`                      | Maximum number of results (1-25)    | No       | 10      |
:::info
You can pass one of the five parameters to identify a company.

Note: 
- `query_company_crunchbase_url` :
This parameter accepts both versions of the Crunchbase URL, i.e., vanity url and UUID url. For example:
  1. `https://www.crunchbase.com/organization/retool`
  2. `https://crunchbase.com/organization/78d1acfa-b69f-1b14-2daf-c8af53089997`

- `query_company_linkedin_url` :
This parameter accepts both versions of the LinkedIn URL, i.e., vanity url and URL with LinkedIn ID. For example:
  1. `https://www.linkedin.com/company/tryretool`
  2. `https://www.linkedin.com/company/11869260`

:::
## Credit Usage

- No credits are consumed for this API endpoint

## Example Requests

<details id="1-identify-by-website-domain">
<summary>1. Identify a company by website domain</summary>

### 1. Identify a company by website domain
```bash
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Accept: application/json, text/plain, */*' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_website": "serverobotics.com", "count": 1}'
```
</details>

<details id="2-identify-by-linkedin-url">
<summary>2. Identify a company by LinkedIn URL</summary>

### 2. Identify a company by LinkedIn URL
```bash
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Accept: application/json, text/plain, */*' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_linkedin_url": "https://www.linkedin.com/company/serve-robotics", "count": 1}'
```
</details>

<details id="3-identify-by-crunchbase-url">
<summary>3. Identify a company by Crunchbase URL</summary>

### 3. Identify a company by Crunchbase URL
```bash
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Accept: application/json, text/plain, */*' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_crunchbase_url": "https://www.crunchbase.com/organization/crustdata", "count": 1}'
```
</details>

<details id="4-identify-by-company-name">
<summary>4. Identify a company by name</summary>

### 4. Identify a company by name
```bash
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Accept: application/json, text/plain, */*' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_name": "Serve Robotics", "count": 1}'
```
</details>

<details id="5-identify-by-company-id">
<summary>5. Identify a company by company ID</summary>

### 5. Identify a company by company ID
```bash
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Accept: application/json, text/plain, */*' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_id": "5702", "count": 1}'
```
</details>

<details id="6-exact-match-behavior-with-company-name">
<summary>6. exact_match behavior with company_name</summary>

### 6. exact_match behavior with company_name

`exact_match=true` performs a **case-insensitive exact string match** against the stored company name. Every character — including spaces and punctuation — must match. `exact_match=false` uses fuzzy (trigram) matching and tolerates minor variations, but may return similar companies.

#### The key gotcha: spacing and formatting in stored names

The stored name is sourced from LinkedIn and may not match the "common" way a company is written. For example, "Tomo Credit" is stored as `"TomoCredit"` (no space):

```bash
# Returns "Not found" — stored name is "TomoCredit", not "Tomo Credit"
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_name": "Tomo Credit", "exact_match": true, "count": 1}'
# Response: {"error": "Not found", "details": null}

# Works — matches stored name exactly (case-insensitive)
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_name": "TomoCredit", "exact_match": true, "count": 1}'
# Response: [{"company_id": 634576, "company_name": "TomoCredit", ...}]
```

#### exact_match=false can return similar-but-wrong companies

Fuzzy matching is lenient but can pull in neighboring companies:

```bash
# "Stripe" with exact_match=false returns "Stripe", "Stripes", "Stripe OLT", etc.
curl 'https://api.crustdata.com/screener/identify/' \
--header 'Authorization: Token $api_token' \
--header 'Content-Type: application/json' \
--data '{"query_company_name": "Stripe", "exact_match": false, "count": 5}'
```

#### Recommended fallback strategy

1. Try `exact_match=true` first.
2. If the response is `"Not found"`, retry with `exact_match=false`.
3. Always verify the returned `company_name` (or `linkedin_profile_url`) matches the company you intended before using the result.

</details>

## Example Responses

<details id="1-response">
<summary>Response</summary>

### Response
The API returns an array of matching companies, with the best match first. Use `is_full_domain_match` to identify exact domain matches.

```json
[
    {
        "company_id": 681759,
        "company_name": "Salesforce",
        "linkedin_profile_name": "Salesforce",
        "company_slug": "salesforce",
        "is_full_domain_match": true,
        "total_rows": 1,
        "company_website_domain": "salesforce.com",
        "company_website": "http://www.salesforce.com",
        "linkedin_profile_url": "https://www.linkedin.com/company/salesforce",
        "linkedin_profile_id": "3185",
        "linkedin_headcount": 87249,
        "employee_count_range": "10001+",
        "estimated_revenue_lower_bound_usd": 1000000000,
        "estimated_revenue_upper_bound_usd": 1000000000000,
        "hq_country": "USA",
        "headquarters": "San Francisco, California, United States",
        "linkedin_industries": [
            "Computer Software",
            "Internet",
            "Software Development"
        ],
        "acquisition_status": "acquired",
        "linkedin_logo_url": "https://media.licdn.com/dms/image/v2/C560BAQHZ9xYomLW7zg/company-logo_200_200/company-logo_200_200/0/1630658255326/salesforce_logo?e=1754524800&v=beta&t=Ed5Djqrnss_y6ki9zphXUp2RehvZX4zdkZh80-EVGb4",
        "crunchbase_profile_url": "https://crunchbase.com/organization/radian6",
        "crunchbase_total_investment_usd": 9000000
    }
]
```
</details>