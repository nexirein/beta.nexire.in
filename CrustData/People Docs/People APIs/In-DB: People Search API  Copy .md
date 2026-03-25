# In-DB: People Search API 

### [ 🚀 Try Now ](/api#tag/people-apis/POST/screener/persondb/search)

Search and filter people based on various professional criteria.

## Endpoint

```
POST /screener/persondb/search
```

## Data Dictionary

[Explore the complete data dictionary for this endpoint here](/docs/2024-11-01/dictionary/people-discovery)

### Response Fields Highlight

Each profile in the response includes structured location information in the `location_details` object:

```json
{
  "person_id": 123,
  "name": "Jane Smith",
  "region": "San Francisco Bay Area",
  "location_details": {
    "city": "San Francisco",
    "state": "California",
    "country": "United States",
    "continent": "North America"
  },
  // ... other fields
}
```

The `location_details` object provides easy access to parsed location components. Only non-null fields are included, so if location data is incomplete, some fields may be missing.

## Request Parameters

| **Payload Keys** | **Description**                                                                                      | **Required** |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| `filters`     | An object containing the filter conditions. See the Building Complex Filters section below for details.                                                          | Yes         |
| `sorts`       | An array of sort criteria to order results. See the Sorting Results section below for details.        | No          |
| `cursor`      | Pagination cursor from previous response. Used for fetching the next page of results.                 | No          |
| `limit`       | The number of results to return in a single request. Default value is `20`. Maximum is `1,000`.      | No          |
| `post_processing` | Extra filtering rules applied to the search query. See Post-processing options below.             | No          |
| `preview` | [**Access controlled**] <br/>Provides basic profile details lookup. Default is `false` | No          |

## Credit Usage

- **People Discovery**: 3 credit per 100 results returned
- **Preview Mode**: 0 credits when `preview=true` is used
- **No Results, No Charges**: You are never charged credits when our APIs return no results. Credits are only deducted when data is successfully returned from your API requests.

## Finding Valid Filter Values with Autocomplete

Use the **[PersonDB Autocomplete API](/docs/2024-11-01/discover/auxiliary-apis/persondb-autocomplete)** to find exact field values for your search filters. This dedicated autocomplete endpoint helps you discover what values exist in our database.

### 🔍 When to Use PersonDB Autocomplete API

**Use Case 1: Discover Valid Field Values**
- Get possible values for any field returned by the PersonDB search endpoint
- Convert partial or fuzzy text into matching value stored in our data for a field

**Use Case 2: Build Dynamic Search Interfaces**  
- Power autocomplete dropdowns and search suggestions in your UI
- Create responsive search experiences with accurate field matching

### Quick Example: Finding Region Values

#### Step 1: Get region suggestions
```bash
curl -X POST 'https://api.crustdata.com/screener/persondb/autocomplete' \
--header 'Authorization: Token $authToken' \
--header 'Content-Type: application/json' \
--data '{
    "field": "region",
    "query": "san franci",
    "limit": 5
}'
```

#### Step 2: Use exact value in your search
```bash
curl -X POST 'https://api.crustdata.com/screener/persondb/search' \
--header 'Authorization: Token $authToken' \
--header 'Content-Type: application/json' \
--data '{
    "filters": {
        "filter_type": "region",
        "type": "=",
        "value": "San Francisco"
    }
}'
```

**💡 Tip**: The autocomplete API works with **any field** from the [data dictionary](/docs/2024-11-01/dictionary/people-discovery)

## Filter Operators

### Filter Structure

Each filter condition requires three components:
- `filter_type`: The field name to filter on (e.g., `"current_employers.title"`, `"region"`, `"years_of_experience_raw"`)
- `type`: The operator to use (e.g., `"="`, `"in"`, `"(.)"`)
- `value`: The value(s) to match

**Complete filter example:**
```json
{
    "filter_type": "current_employers.title",
    "type": "=",
    "value": "CEO"
}
```

**Field name formats:**
- **Top-level fields**: Use the field name directly (e.g., `"region"`, `"headline"`, `"years_of_experience_raw"`)
- **Nested fields**: Use dot notation (e.g., `"current_employers.title"`, `"education_background.institute_name"`)
- **Array fields**: Access nested properties within arrays (e.g., `"all_employers.name"`, `"past_employers.company_hq_location"`)

See the [Data Dictionary](/docs/2024-11-01/dictionary/people-discovery) for a complete list of available fields and their formats.

### Matching Operators
| **Operator** | **Description** | **Example** | **Field Types** |
| ------------ | --------------- | ----------- | --------------- |
| `=` | Exact match | `{"filter_type": "current_employers.title", "type": "=", "value": "CEO"}` | All |
| `!=` | Not equal to | `{"filter_type": "current_employers.title", "type": "!=", "value": "Intern"}` | All |
| `in` | Matches any value in list | `{"filter_type": "current_employers.title", "type": "in", "value": ["CEO", "CTO", "CFO"]}` | All |
| `not_in` | Doesn't match any value in list | `{"filter_type": "current_employers.title", "type": "not_in", "value": ["Intern", "Junior"]}` | All |

:::note Case Sensitivity
The `=` operator performs **case-insensitive** matching for text fields (e.g., searching for "CEO" will match "ceo", "Ceo", or "CEO"). 

The `IN` operator performs **exact, case-sensitive** matching. When using `IN`, ensure your values match the exact casing in the data.
:::

:::tip Getting Exact Values for Filters
For best results with `=` and `in` operators, use the [PersonDB Autocomplete API](/docs/2024-11-01/discover/auxiliary-apis/persondb-autocomplete) to get exact field values. This is especially useful for fields like:
- `region` - Get exact location names
- `current_employers.name` - Get exact company names  
- `education_background.institute_name` - Get exact institution names
- `current_employers.title` - Get standardized job titles
- And many other text fields

**Example workflow:**
1. Call autocomplete API: `POST /screener/persondb/autocomplete` with `{"field": "region", "query": "san francisco"}`
2. Get exact value: `"San Francisco Bay Area"`
3. Use in filter: `{"column": "region", "type": "=", "value": "San Francisco Bay Area"}`
:::

### Comparison Operators
| **Operator** | **Description** | **Example** | **Field Types** |
| ------------ | --------------- | ----------- | --------------- |
| `>` | Greater than | `{"filter_type": "years_of_experience_raw", "type": ">", "value": 5}` | Number, Date |
| `<` | Less than | `{"filter_type": "num_of_connections", "type": "<", "value": 100}` | Number, Date |
| `=>` | Greater than or equal | `{"filter_type": "years_of_experience_raw", "type": "=>", "value": 10}` | Number, Date |
| `=<` | Less than or equal | `{"filter_type": "years_of_experience_raw", "type": "=<", "value": 50}` | Number, Date |

### Text Search Operators
| **Operator** | **Description** | **Example** | **Field Types** |
| ------------ | --------------- | ----------- | --------------- |
| `(.)` | Text search with fuzzy matching (allows typos). | `{"filter_type": "headline", "type": "(.)", "value": "engineer"}` | Text |
| `[.]` | Substring matching (no typos allowed). **Note**: This is NOT exact string equality - it matches any value containing the search term as a substring. | `{"filter_type": "current_employers.title", "type": "[.]", "value": "Software Engineer"}` | Text |

### Geographic Operators
| **Operator** | **Description** | **Example** | **Field Types** |
| ------------ | --------------- | ----------- | --------------- |
| `geo_distance` | Find records within a radius of a location | `{"column": "region", "type": "geo_distance", "value": {"location": "San Francisco", "distance": 50, "unit": "km"}}` | Location (region) |

:::tip Text Search Operators Best Practices
**Understanding the difference between `(.)` and `[.]`:**

- **`(.)` Fuzzy matching**: 
  - Allows typos and word edits (fuzzy matching)
  - Doesn't strictly respect word order
  - Multi-word searches: Each word is searched independently (all must be present but in any order)
  - Example: "Software Engineer" may match "Engineer Software" or "Sr Software Engineer"
  
- **`[.]` Substring matching**: 
  - **Performs substring matching, not exact string equality**
  - Matches any value that contains the search term as a substring
  - No typos allowed, requires exact tokens
  - Example: Searching for "Cline" will match "Cline", "Clinebot", "Cline Design", "McCline & Associates", etc.
  - **Important**: This behavior can lead to inflated result counts when used with non-unique company names
  
- **Region/state filtering**:
  - Use `[.]` for state-level `region` filters to avoid fuzzy matches.
  - `(.)` can expand to similar-looking names across countries (e.g., searching for `"Illinois"` or `"Indiana"` with `(.)` can return profiles from `"India"`).
  - Example: `{"filter_type": "region", "type": "[.]", "value": "Illinois"}` returns profiles in Illinois, whereas `{"filter_type": "region", "type": "(.)", "value": "Illinois"}` may include unintended matches.

**When to use which:**
- Use `(.)` for flexible searching when you want to find variations and don't mind typos
- Use `[.]` for substring matching when you need exact tokens but want to match partial strings
- **For company filtering**: Avoid using `[.]` with company names - use `company_linkedin_profile_url` instead for precise matching (see Company Filtering Best Practices below)
- Prefer `(.)` over `IN` or `=` unless you have exact values from the [PersonDB Autocomplete API](/docs/2024-11-01/discover/auxiliary-apis/persondb-autocomplete)
:::

:::info Usage Notes
- **Text fields**: Prefer the fuzzy operator `(.)` for partial matches with automatic typo handling. Use exact match (`=`) or `IN` only when you have exact values from the [PersonDB Autocomplete API](/docs/2024-11-01/discover/auxiliary-apis/persondb-autocomplete)
- **Numeric fields**: All operators work with numeric values like `years_of_experience_raw`, `num_of_connections`
- **Date fields**: Comparison operators work with ISO date strings like `"2024-01-01"`. Note that date fields will only appear in the response if they exist in the data
- **Boolean fields**: Use `=` with `true` or `false` values. Examples include `recently_changed_jobs` and `current_employers.business_email_verified`
:::

## Company Filtering Best Practices

### Understanding Company Name Matching Behavior

When filtering by company using the **company name** field (e.g., `current_employers.name`, `past_employers.name`, `all_employers.name`), it's important to understand how different operators work:

:::warning Important: `[.]` Operator Performs Substring Matching
The `[.]` operator (often called "strict match") **does NOT perform exact string equality** on company names. Instead, it performs a **substring match**.

**This means:**
- Searching for `"Cline"` with `[.]` will match **any company** whose name contains "Cline" as a substring
- This can include multiple distinct companies: "Cline Design", "Clinebot", "Cline HQ", "McCline & Associates", etc.
- This leads to **inflated result counts** and **unintended matches** when the company name is not unique

**Example of the problem:**
```json
{
  "column": "current_employers.name",
  "type": "[.]",
  "value": "Cline"
}
```
This will match profiles from ALL companies with "Cline" in their name, not just the specific company you intend.
:::

### Recommended: Use LinkedIn Profile URL for Precise Company Filtering

For **high-precision company filtering**, use the `company_linkedin_profile_url` field instead of the company name. This ensures you're matching the exact company you intend.

**Available company identifier fields (in order of precision):**
1. **`company_linkedin_profile_url`** (Most Precise) - Example: `"https://www.linkedin.com/company/clinebot"`
2. **`linkedin_id`** (Precise) - Example: `"123456"`
3. **`company_website_domain`** (Moderately Precise) - Example: `"cline.com"`
4. **`name`** (Least Precise) - Example: `"Cline"` (substring matching issues)

### How to Get LinkedIn Company URLs

LinkedIn company URLs follow this format: `https://www.linkedin.com/company/{company-slug}`

**Methods to obtain the correct URL:**
1. **Use the [Company Identification API](/docs/2024-11-01/discover/company-apis/company-identification-api)** - Provide a company website or name to get its LinkedIn URL and ID
2. **Manual lookup** - Search for the company on LinkedIn and copy the URL from the company page

### Example: High-Precision Company Filtering

Here's a complete example showing how to filter for people at a specific company using LinkedIn profile URL combined with other filters:

```bash
curl --location 'https://api.crustdata.com/screener/persondb/search' \
  --header 'Authorization: Token $auth' \
  --header 'Content-Type: application/json' \
  --data '{
  "filters": {
    "op": "and",
    "conditions": [
      {
        "op": "or",
        "conditions": [
          {
            "column": "all_employers.company_linkedin_profile_url",
            "type": "=",
            "value": "https://www.linkedin.com/company/clinebot"
          }
        ]
      },
      {
        "column": "current_employers.function_category",
        "type": "=",
        "value": "Engineering"
      }
    ]
  },
  "limit": 100
}'
```

**What this query does:**
- Finds people who have **ever worked** at the specific company (using the OR across `all_employers`)
- AND who are **currently in Engineering** roles
- Uses the exact LinkedIn company URL to avoid matching unintended companies

## Location Filtering

### How It Works

When you filter by location fields, the API automatically searches across both:
1. **Main location field** - The complete location string (e.g., "San Francisco Bay Area")
2. **Address components field** - Individual location hierarchy components (city, state, country)

This dual-search approach ensures you can find matches regardless of how locations are formatted in the data.

### Supported Location Fields

The following fields support automatic address component searching:
- `region` → automatically searches both `region` and `region_address_components`
- `current_employers.company_hq_location` → automatically includes address components
- `past_employers.company_hq_location` → automatically includes address components
- `all_employers.company_hq_location` → automatically includes address components

### Example

When you search for "California", the API automatically searches for matches in both the full location string and address components:
```json
{
  "column": "region",
  "type": "(.)",
  "value": "California"
}
```

This will match profiles with:
- Full location: "San Francisco Bay Area, California, United States"
- Address components containing: "California"

**Note:** This automatic expansion applies to ALL filter operators (=, !=, in, not_in, (.), [.]), not just fuzzy search. You don't need to explicitly filter on the address_components fields - the API handles this automatically for better matching.

## Geographic Radius Filtering (geo_distance)

The `geo_distance` filter allows you to find people within a specific radius of a location. This is useful for finding candidates in proximity to an office, city, or point of interest.

:::info New Feature
This feature was released on January 12, 2026. See the [changelog entry](/changelog/2026-01-12-persondb-geo-radius-search) for detailed information about geographic radius filtering and structured location data.
:::

### How It Works

1. **Specify a location** by name (e.g., "San Francisco", "New York", "London")
2. **Set a radius** distance and unit (kilometers, miles, meters, feet)
3. The API automatically geocodes the location and finds all people within that radius

**Technical details:** The system uses our location database to convert location names to latitude/longitude coordinates, then Elasticsearch performs a native geo_distance query to find all people within the specified radius. For more technical information, see the [Technical Details section in the changelog](/changelog/2026-01-12-persondb-geo-radius-search#technical-details).

### Supported Fields

The `geo_distance` operator currently works with:
- `region` - Person's current location

### Filter Structure

```json
{
  "column": "region",
  "type": "geo_distance",
  "value": {
    "location": "San Francisco",
    "distance": 50,
    "unit": "km"
  }
}
```

**Parameters:**
- `location` (string, required): The center point location name (e.g., "San Francisco", "New York", "London")
- `distance` (number, required): The radius distance (must be positive)
- `unit` (string, optional): The distance unit. Default: `"km"`
  - Valid units: `"km"` (kilometers), `"mi"` or `"miles"`, `"m"` or `"meters"`, `"ft"` or `"feet"`

### Examples

For more comprehensive examples, see [Example 11: Geographic radius filtering](#11-geographic-radius-filtering) below.

#### Find people within 25 miles of San Francisco

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "region",
        "type": "geo_distance",
        "value": {
            "location": "San Francisco",
            "distance": 25,
            "unit": "mi"
        }
    },
    "limit": 100
}' \
--compressed
```

#### Find software engineers within 50km of London

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "region",
                "type": "geo_distance",
                "value": {
                    "location": "London",
                    "distance": 50,
                    "unit": "km"
                }
            },
            {
                "column": "current_employers.title",
                "type": "(.)",
                "value": "Software Engineer"
            }
        ]
    },
    "limit": 100
}' \
--compressed
```

#### Find CTOs near New York City with specific experience

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "region",
                "type": "geo_distance",
                "value": {
                    "location": "New York",
                    "distance": 30,
                    "unit": "miles"
                }
            },
            {
                "column": "current_employers.title",
                "type": "=",
                "value": "Chief Technology Officer"
            },
            {
                "column": "years_of_experience_raw",
                "type": "=>",
                "value": 10
            }
        ]
    },
    "limit": 50
}' \
--compressed
```

### Important Notes

:::info Location Lookup
- Location names are automatically geocoded using our location database
- If a location is not found or has invalid coordinates, the API will return an error
- Use common location names (cities, regions) for best results
- Examples of valid locations: "San Francisco", "London", "New York", "Singapore", "Berlin"
:::

:::tip Best Practices
- Start with larger radii (50+ km/miles) and refine based on results
- Combine geo_distance with other filters for more precise targeting
- Use kilometers for international searches, miles for US-focused searches
- If you need multiple locations, use separate queries or combine with OR conditions
:::

## Post-processing Options

Additional filtering options that are applied to your search query:

| **Key** | **Type** | **Description** | **Example** |
| ------- | -------- | --------------- | ----------- |
| `exclude_profiles` | array | List of LinkedIn profile URLs to exclude from results. <br/> <br/>  **Maximum: 50,000 profiles per request** <br/> **Request size limit: 10MB total payload** <br/> <br/>  **Note: Profile URLs must be in the format `https://www.linkedin.com/in/{slug}` for post-processing to work correctly.** | `["https://www.linkedin.com/in/john-doe"]` |
| `exclude_names` | array | List of names to exclude from results | `["Test User", "Demo Account"]` |

:::warning Exclusion Limits
- **Maximum exclusions**: 50,000 profile URLs per request
- **Payload size**: Total request size must be under 10MB
- **Performance**: Response time increases with exclusion list size. For optimal performance, keep exclusions under 10,000 profiles.
- **URL format**: Profile URLs must start with "https://www.linkedin.com" or "https://linkedin.com" (missing www or https may not give expected results)
:::

:::tip Managing Large Exclusion Lists
If you need to exclude more than 50,000 profiles or maintain persistent exclusion state across multiple searches, consider implementing your own filtering logic on the client side after receiving the API response.
:::

:::tip Response Format Migration
**Migrating from Realtime to In-DB API?** See our [**API Migration Guide**](/docs/2024-11-01/discover/people-apis/people-api-migration-guide) to transform In-DB response structure to Realtime format.
:::

## Building Complex Filters

### Basic Filter Structure

Each filter condition requires three components:
- `column`: The field to filter on (e.g., "current_employers.title")
- `type`: The operator to use (e.g., "=", "in", "(.)")
- `value`: The value(s) to match

```json
{
    "column": "current_employers.title",
    "type": "=",
    "value": "Software Engineer"
}
```

### Combining Multiple Conditions

Use `op` with "and" or "or" to combine multiple filter conditions:

```json
{
    "op": "and",
    "conditions": [
        {
            "column": "region",
            "type": "=",
            "value": "San Francisco Bay Area"
        },
        {
            "column": "years_of_experience_raw",
            "type": ">",
            "value": 5
        }
    ]
}
```

### Nested Conditions

You can nest AND/OR conditions for complex logic:

```json
{
    "op": "and",
    "conditions": [
        {
            "column": "current_employers.company_industries",
            "type": "in",
            "value": ["Technology", "Software"]
        },
        {
            "op": "or",
            "conditions": [
                {
                    "column": "current_employers.title",
                    "type": "(.)"  ,
                    "value": "engineer"
                },
                {
                    "column": "current_employers.title",
                    "type": "(.)"  ,
                    "value": "developer"
                }
            ]
        }
    ]
}
```

:::warning Important: AND Operator with Nested Fields
When using AND with nested array fields (like honors, employers, education), ALL conditions must match within the SAME array object.

**Example:** 
- `current_employers.title = "Software Engineer" AND current_employers.name = "Capital One"` 
  - ✅ Matches if a SINGLE employment object has both title="Software Engineer" AND company name="Capital One"
  - ❌ Does NOT match if "Software Engineer" is at one company and "Capital One" is a different employment entry

**For matching across different objects, use OR:**
- `current_employers.title = "Software Engineer" OR current_employers.name = "Capital One"`
  - ✅ Matches if ANY employment has title="Software Engineer" OR ANY employment has company name="Capital One"
:::

### Querying Multiple Employers with AND Conditions

<details id="querying-multiple-employers-with-and-conditions">
<summary><strong>Click to expand: How to query for people who worked at multiple companies</strong></summary>

When querying for people who have worked at multiple specific companies (across different employment records), you need to use a **nested AND structure** where each employer condition is wrapped in its own AND group.

:::danger Common Mistake
**❌ INCORRECT - This returns 0 results:**
```json
{
  "op": "and",
  "conditions": [
    {
      "column": "all_employers.name",
      "type": "[.]",
      "value": "Hyperscan"
    },
    {
      "column": "all_employers.name",
      "type": "[.]",
      "value": "Antler"
    }
  ]
}
```
This fails because it's trying to find a SINGLE employment record with both "Hyperscan" AND "Antler" as the company name, which is impossible.
:::

:::tip ✅ CORRECT Syntax
**Each employer must be in its own nested AND condition:**
```json
{
  "op": "and",
  "conditions": [
    {
      "op": "and",
      "conditions": [
        {
          "column": "all_employers.name",
          "type": "[.]",
          "value": "Hyperscan"
        }
      ]
    },
    {
      "op": "and",
      "conditions": [
        {
          "column": "all_employers.name",
          "type": "[.]",
          "value": "Antler"
        }
      ]
    }
  ]
}
```
This correctly finds people who have "Hyperscan" in ONE employment record AND "Antler" in ANOTHER employment record.
:::

#### Why is the nested structure required?

When you filter on array fields like `all_employers`, the API evaluates each array element independently. The nested structure ensures that:
1. Each inner AND group is evaluated against separate array elements
2. The outer AND combines the results, finding people who match ALL the employer criteria across their employment history
3. Without nesting, the API tries to match all conditions within a single array element, which fails for multiple distinct employer names

#### Complete Example: People who worked at both Hyperscan and Antler

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Token $token' \
  --data '{
  "filters": {
    "op": "and",
    "conditions": [
      {
        "op": "and",
        "conditions": [
          {
            "column": "all_employers.name",
            "type": "[.]",
            "value": "Hyperscan"
          }
        ]
      },
      {
        "op": "and",
        "conditions": [
          {
            "column": "all_employers.name",
            "type": "[.]",
            "value": "Antler"
          }
        ]
      }
    ]
  },
  "limit": 100
}'
```

#### Adding additional filters with multiple employers

You can combine multiple employer queries with other filters at the same level:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Token $token' \
  --data '{
  "filters": {
    "op": "and",
    "conditions": [
      {
        "op": "and",
        "conditions": [
          {
            "column": "all_employers.name",
            "type": "[.]",
            "value": "Hyperscan"
          }
        ]
      },
      {
        "op": "and",
        "conditions": [
          {
            "column": "all_employers.name",
            "type": "[.]",
            "value": "Antler"
          },
          {
            "column": "first_name",
            "type": "=",
            "value": "Roberts"
          }
        ]
      }
    ]
  },
  "limit": 100
}'
```

This query finds people who:
- Have worked at "Hyperscan" (in any employment record)
- AND have worked at "Antler" (in a different employment record), and the person's first name is "Roberts"

:::info Key Takeaway
When querying for multiple distinct values in array fields (like different company names in `all_employers`), always use nested AND conditions to ensure each value is matched against separate array elements.
:::

</details>

## Sorting Results

Control the order of search results using the `sorts` parameter. You can sort by multiple fields and specify ascending or descending order for each.

### Sort Structure

Each sort criterion requires two components:
- `column`: The field name to sort by (must be one of the sortable fields listed below)
- `order`: Either `"asc"` (ascending) or `"desc"` (descending)

**Complete sort example:**
```json
{
    "column": "years_of_experience_raw",
    "order": "desc"
}
```

### Sortable Fields

For optimal performance, sorting is restricted to the following curated fields:

**Core Person Metrics:**
- `person_id` - Unique person identifier
- `years_of_experience_raw` - Total years of work experience (numeric)
- `num_of_connections` - LinkedIn connection count
- `name` - Person's full name
- `recently_changed_jobs` - Boolean indicating recent job change

**Current Employer Fields:**
- `current_employers.years_at_company_raw` - Years at current company (numeric)
- `current_employers.start_date` - Start date at current company
- `current_employers.company_headcount_latest` - Current company's employee count

**Location Fields:**
- `region` - Person's current location
- `location_city` - City component of person's location
- `location_state` - State/province component
- `location_country` - Country component

:::tip Choosing Between fields
- Use `years_of_experience_raw` and `years_at_company_raw` for numeric sorting (these are the actual numeric values)
- Fields ending in `_raw` provide precise numeric values for calculations and sorting
:::

### Sort Behavior

- **Default Sort**: If no `sorts` parameter is provided, results are sorted by `person_id` in ascending order for stable pagination
- **Multiple Sort Criteria**: You can specify multiple sort fields. Results are sorted by the first criterion, then ties are broken by subsequent criteria
- **Tiebreaker**: `person_id` is automatically added as a final tiebreaker to ensure consistent pagination

:::warning Performance Considerations
- Sorting on numeric fields (`years_of_experience_raw`, `num_of_connections`) is fastest
- Sorting on nested fields (`current_employers.*`) may be slightly slower than top-level fields
- For best performance, limit the number of sort criteria to 2-3 fields
:::

## Example Requests

<details>
<summary>1. Basic filter examples</summary>

### 1. Basic filter examples

Find people by exact title match:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H "Accept: application/json, text/plain, */*" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.title",
        "type": "=",
        "value": "Chief Executive Officer"
    },
    "limit": 100
}' \
--compressed
```

Find people whose headline contains "founder" (text search with fuzzy matching):

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H "Accept: application/json, text/plain, */*" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "headline",
        "type": "(.)",
        "value": "founder"
    },
    "limit": 100
}' \
--compressed
```

Find people with more than 10 years of experience:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H "Accept: application/json, text/plain, */*" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "years_of_experience_raw",
        "type": ">",
        "value": 10
    },
    "limit": 100
}' \
--compressed
```
</details>

<details>
<summary>2. Filter with comparison operators</summary>

### 2. Filter with comparison operators

Find people with significant LinkedIn connections:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H "Accept: application/json, text/plain, */*" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "num_of_connections",
                "type": ">",
                "value": 500
            },
            {
                "column": "recently_changed_jobs",
                "type": "=",
                "value": true
            }
        ]
    },
    "limit": 50
}' \
--compressed
```
</details>

<details>
<summary>3. Filter with NOT operators</summary>

### 3. Filter with NOT operators

Find professionals excluding certain companies and titles:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H "Accept: application/json, text/plain, */*" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "current_employers.name",
                "type": "not_in",
                "value": ["Google", "Meta", "Amazon"]
            },
            {
                "column": "current_employers.title",
                "type": "!=",
                "value": "Intern"
            },
            {
                "column": "region",
                "type": "=",
                "value": "San Francisco Bay Area"
            }
        ]
    },
    "limit": 100
}' \
--compressed
```
</details>

<details>
<summary>4. Complex nested filter example</summary>

### 4. Complex nested filter example

Find senior professionals with specific criteria:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "op": "or",
                "conditions": [
                    {
                        "column": "current_employers.title",
                        "type": "(.)"  ,
                        "value": "VP"
                    },
                    {
                        "column": "current_employers.title",
                        "type": "(.)"  ,
                        "value": "Director"
                    },
                    {
                        "column": "current_employers.seniority_level",
                        "type": "=",
                        "value": "CXO"
                    }
                ]
            },
            {
                "column": "years_of_experience_raw",
                "type": "=>",
                "value": 10
            },
            {
                "column": "current_employers.company_headcount_latest",
                "type": "<",
                "value": 1000
            }
        ]
    },
    "limit": 50
}' \
--compressed
```
</details>

<details>
<summary>5. Filter by date ranges</summary>

### 5. Filter by date ranges

Find people who started their current position recently:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "current_employers.start_date",
                "type": "=>",
                "value": "2023-01-01"
            },
            {
                "column": "current_employers.company_type",
                "type": "=",
                "value": "Public Company"
            },
            {
                "column": "years_of_experience_raw",
                "type": "=<",
                "value": 15
            }
        ]
    },
    "limit": 50
}' \
--compressed
```
</details>

<details>
<summary>6. Filter by education and skills</summary>

### 6. Filter by education and skills

Find alumni with specific skills:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "education_background.institute_name",
                "type": "(.)"  ,
                "value": "Stanford"
            },
            {
                "column": "education_background.degree_name",
                "type": "!=",
                "value": "Bachelor"
            },
            {
                "column": "skills",
                "type": "(.)"  ,
                "value": "machine learning"
            }
        ]
    },
    "limit": 100
}' \
--compressed
```
</details>

<details>
<summary>7. Filter by certifications and honors</summary>

### 7. Filter by certifications and honors

Find certified professionals with recognition:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "certifications.name",
                "type": "(.)"  ,
                "value": "AWS"
            },
            {
                "column": "certifications.issued_date",
                "type": "=>",
                "value": "2022-01-01"
            },
            {
                "column": "honors.title",
                "type": "(.)"  ,
                "value": "award"
            }
        ]
    },
    "limit": 50
}' \
--compressed
```
</details>

<details>
<summary>8. Filter across all employment history</summary>

### 8. Filter across all employment history

Find people with experience at specific companies (past or present):

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "all_employers.name",
                "type": "in",
                "value": ["Google", "Facebook", "Apple", "Amazon"]
            },
            {
                "column": "all_employers.years_at_company_raw",
                "type": "=>",
                "value": 2
            },
            {
                "column": "current_employers.company_headcount_range",
                "type": "!=",
                "value": "10,001+"
            }
        ]
    },
    "limit": 50
}' \
--compressed
```
</details>

<details>
<summary>9. Find people at a company by LinkedIn URL</summary>

### 9. Find people at a company by LinkedIn URL

Find all people currently working at a company using its LinkedIn profile URL:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.company_linkedin_profile_url",
        "type": "=",
        "value": "https://www.linkedin.com/company/tesla-motors"
    },
    "limit": 100
}' \
--compressed
```

Alternatively, you can use the LinkedIn ID:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.linkedin_id",
        "type": "=",
        "value": "1441"
    },
    "limit": 100
}' \
--compressed
```

Note: The LinkedIn ID is the numeric identifier from the company's LinkedIn URL. For example, if the LinkedIn URL is `https://www.linkedin.com/company/1441/`, the LinkedIn ID is `1441`.

**How to get the LinkedIn ID or URL:** You can use the free [Company Identification API](/docs/2024-11-01/discover/company-apis/company-identification-api) to get a company's `linkedin_id` and `linkedin_url` by providing its website domain:
- Example input: `query_company_website`: `"tesla.com"` or `query_company_linkedin_url`: `"https://www.linkedin.com/company/tesla-motors"`
- Example output: `linkedin_id`: `"15564"` (Tesla's LinkedIn ID), `linkedin_url`: `"https://www.linkedin.com/company/tesla-motors"`

You can also filter by past employers or all employers:

```bash
# Find people who previously worked at a company using LinkedIn URL
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "past_employers.company_linkedin_profile_url",
        "type": "=",
        "value": "https://www.linkedin.com/company/tesla-motors"
    },
    "limit": 100
}' \
--compressed
```

```bash
# Find people who previously worked at a company using LinkedIn ID
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "past_employers.linkedin_id",
        "type": "=",
        "value": "1441"
    },
    "limit": 100
}' \
--compressed
```
</details>

<details>
<summary>10. Find people at a company by domain</summary>

### 10. Find people at a company by domain

Find all people currently working at companies with a specific website domain.

**Example values:**
- `company_website_domain`: `"tesla.com"`, `"apple.com"`, `"google.com"`, `"microsoft.com"`

You can obtain a company's website domain from their LinkedIn ID using the free [Company Identification API](/docs/2024-11-01/discover/company-apis/company-identification-api):

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.company_website_domain",
        "type": "=",
        "value": "tesla.com"
    },
    "limit": 100
}' \
--compressed
```

Find people at multiple companies by their domains:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.company_website_domain",
        "type": "in",
        "value": ["tesla.com", "spacex.com", "neuralink.com"]
    },
    "limit": 100
}' \
--compressed
```

You can also combine domain search with other filters:

```bash
# Find senior executives at a company by domain
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "current_employers.company_website_domain",
                "type": "=",
                "value": "apple.com"
            },
            {
                "column": "current_employers.seniority_level",
                "type": "in",
                "value": ["CXO", "Vice President", "Director"]
            }
        ]
    },
    "limit": 100
}' \
--compressed
```

</details>

<details>
<summary>11. Geographic radius filtering</summary>

### 11. Geographic radius filtering

Find people within a specific distance from a location:

```bash
# Find people within 25 miles of San Francisco
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "region",
        "type": "geo_distance",
        "value": {
            "location": "San Francisco",
            "distance": 25,
            "unit": "mi"
        }
    },
    "limit": 100
}' \
--compressed
```

Find software engineers within 50km of London:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "region",
                "type": "geo_distance",
                "value": {
                    "location": "London",
                    "distance": 50,
                    "unit": "km"
                }
            },
            {
                "column": "current_employers.title",
                "type": "(.)",
                "value": "Software Engineer"
            }
        ]
    },
    "limit": 100
}' \
--compressed
```

Find senior executives near New York with experience requirements:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "region",
                "type": "geo_distance",
                "value": {
                    "location": "New York",
                    "distance": 30,
                    "unit": "miles"
                }
            },
            {
                "column": "current_employers.seniority_level",
                "type": "in",
                "value": ["CXO", "Vice President", "Director"]
            },
            {
                "column": "years_of_experience_raw",
                "type": "=>",
                "value": 10
            }
        ]
    },
    "limit": 50
}' \
--compressed
```

Find people within 100km of Berlin working in tech companies:

```bash
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "region",
                "type": "geo_distance",
                "value": {
                    "location": "Berlin",
                    "distance": 100,
                    "unit": "km"
                }
            },
            {
                "column": "current_employers.company_industries",
                "type": "in",
                "value": ["Technology", "Software Development", "Information Technology"]
            }
        ]
    },
    "limit": 100
}' \
--compressed
```
</details>

<details>
<summary>12. Using post-processing to exclude specific profiles and names</summary>

### 12. Using post-processing to exclude specific profiles and names

Find senior executives excluding specific people:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.seniority_level",
        "type": "in",
        "value": ["CXO", "Vice President", "Director"]
    },
    "limit": 100,
    "post_processing": {
        "exclude_profiles": [
            "https://linkedin.com/in/john-doe",
            "https://linkedin.com/in/jane-smith"
        ],
        "exclude_names": [
            "Test User",
            "Demo Account"
        ]
    }
}' \
--compressed
```
</details>

<details>
<summary>13. Excluding senior executives with not_in</summary>

### 13. Excluding Senior Executives with `not_in`

To find individual contributors and exclude anyone who has held executive positions:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
  -H 'Authorization: Token $auth_token' \
  -H 'Content-Type: application/json' \
  --data '{
    "filter": {
      "op": "and",
      "conditions": [
        {
          "column": "all_employers.seniority_level",
          "type": "not_in",
          "value": ["Owner / Partner", "CXO", "Vice President", "Director"]
        },
        {
          "column": "all_employers.title",
          "type": "not_in",
          "value": ["CEO", "President", "Chairman", "Founder", "Co-Founder"]
        }
      ]
    },
    "limit": 100
  }' \
--compressed
```

This will exclude anyone who:
- Currently has or previously had a seniority level of VP or above AND
- Ever held a title like CEO, President, Chairman, Founder, or Co-Founder

:::info How `not_in` Works with Employment History
When using `not_in` on employment history fields (like `all_employers.title` or `all_employers.name`), the filter excludes profiles where the person has **ever** held that title or worked at that company at any point in their career.
:::
</details>

<details>
<summary>14. Excluding specific companies with not_in</summary>

### 14. Excluding Specific Companies with `not_in`

To find people who have never worked at certain competitors:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
  -H 'Authorization: Token $auth_token' \
  -H 'Content-Type: application/json' \
  --data '{
    "filter": {
      "op": "and",
      "conditions": [
        {
          "column": "all_employers.name",
          "type": "not_in",
          "value": ["Google", "Meta"]
        }
      ]
    },
    "limit": 100
  }' \
--compressed
```

This excludes anyone who currently works at Google/Meta OR has ever worked at Google/Meta in the past.

**Note:** Use exact company names as they appear in LinkedIn profiles for best results.
</details>

<details>
<summary>15. Sorting results by experience and connections</summary>

### 15. Sorting Results by Experience and Connections

Find CTOs with the most experience and connections:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.title",
        "type": "=",
        "value": "Chief Technology Officer"
    },
    "sorts": [
        {
            "column": "years_of_experience_raw",
            "order": "desc"
        },
        {
            "column": "num_of_connections",
            "order": "desc"
        }
    ],
    "limit": 50
}' \
--compressed
```

Find early career software engineers sorted by company size:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "current_employers.title",
                "type": "(.)",
                "value": "Software Engineer"
            },
            {
                "column": "years_of_experience_raw",
                "type": "=<",
                "value": 3
            }
        ]
    },
    "sorts": [
        {
            "column": "current_employers.company_headcount_latest",
            "order": "desc"
        }
    ],
    "limit": 100
}' \
--compressed
```

Find long-tenured employees at specific company:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.name",
        "type": "=",
        "value": "Microsoft"
    },
    "sorts": [
        {
            "column": "current_employers.years_at_company_raw",
            "order": "desc"
        }
    ],
    "limit": 100
}' \
--compressed
```

:::tip Sorting Best Practices
- **Combine sorting with filtering** for targeted results
- **Use `_raw` fields** for numeric sorting (e.g., `years_of_experience_raw`, `years_at_company_raw`)
- **Multiple sort criteria** help break ties - order by primary criterion first, then secondary
- **Sorting is consistent** across paginated results - the cursor maintains sort order
:::

**Additional sorting examples:**

Sort by years of experience (most experienced first):
```json
{
    "filters": {
        "column": "current_employers.title",
        "type": "in",
        "value": ["CEO", "CTO"]
    },
    "sorts": [
        {
            "column": "years_of_experience_raw",
            "order": "desc"
        }
    ],
    "limit": 50
}
```

Sort by multiple criteria (connections, then experience):
```json
{
    "filters": {
        "column": "region",
        "type": "(.)",
        "value": "San Francisco"
    },
    "sorts": [
        {
            "column": "num_of_connections",
            "order": "desc"
        },
        {
            "column": "years_of_experience_raw",
            "order": "desc"
        }
    ],
    "limit": 100
}
```

Sort by company tenure (longest tenure first):
```json
{
    "filters": {
        "column": "current_employers.name",
        "type": "=",
        "value": "Google"
    },
    "sorts": [
        {
            "column": "current_employers.years_at_company_raw",
            "order": "desc"
        }
    ],
    "limit": 50
}
```

</details>

<details>
<summary>16. Filter by verified business email</summary>

### 16. Filter by Verified Business Email

Find people who have a verified business email at their current employer. This is useful when you need high-quality contact data for outreach.

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "column": "current_employers.business_email_verified",
        "type": "=",
        "value": true
    },
    "limit": 100
}' \
--compressed
```

Combine with other filters to find verified contacts with specific criteria:

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "current_employers.title",
                "type": "in",
                "value": ["CEO", "CTO", "Founder", "Co-Founder"]
            },
            {
                "column": "location_country",
                "type": "=",
                "value": "United States"
            },
            {
                "column": "current_employers.business_email_verified",
                "type": "=",
                "value": true
            }
        ]
    },
    "limit": 100
}' \
--compressed
```

:::tip Available verified email fields
- `current_employers.business_email_verified` - Filter for verified emails at current jobs
- `past_employers.business_email_verified` - Filter for verified emails at past jobs  
- `all_employers.business_email_verified` - Filter for verified emails across all employment history
:::

</details>

<details>
<summary>17. People who recently joined or left a specific company</summary>

### 17. People Who Recently Joined or Left a Specific Company

#### People who recently joined a company

Find people who recently joined a company by filtering on `current_employers` for the company and a recent `start_date`.

**Find people who joined OpenAI after November 2025:**

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "current_employers.company_linkedin_profile_url",
                "type": "=",
                "value": "https://www.linkedin.com/company/openai"
            },
            {
                "column": "current_employers.start_date",
                "type": ">",
                "value": "2025-11-07"
            }
        ]
    },
    "limit": 25
}' \
--compressed
```

**What this query does:**
- Finds people who are **currently at** OpenAI (using `current_employers`)
- With a **start date** after a specific date (indicating they joined recently)
- Results include new hires, internal transfers, and acquisitions (e.g., employees joining through company acquisitions)

:::tip Filtering Non-Employees in "Recently Joined" Queries
Similar to the "recently left" query, results may include non-employees (e.g., "Investor"). You can use the same title filtering techniques described below — either `not_in` to exclude noisy titles or a nested `or` with `(.)` to include only real employee titles — but applied to `current_employers.title` instead of `past_employers.title`.
:::

---

#### People who recently left a company

Find people who recently left a company by combining `past_employers` filters for the company, end date, and a `!=` on `current_employers` to confirm they're no longer there.

**Basic query — find people who left OpenAI after November 2025:**

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "past_employers.company_linkedin_profile_url",
                "type": "=",
                "value": "https://www.linkedin.com/company/openai"
            },
            {
                "column": "past_employers.end_date",
                "type": ">",
                "value": "2025-11-07"
            },
            {
                "column": "current_employers.company_linkedin_profile_url",
                "type": "!=",
                "value": "https://www.linkedin.com/company/openai"
            }
        ]
    },
    "limit": 25
}' \
--compressed
```

:::tip Filtering by Past Employer Title
The basic query above may return people who listed the company on their LinkedIn profile in non-employee capacities (e.g., "Investor", "Community Member", "Forum Member"). To filter these out, you can either **exclude** noisy titles with `not_in` or **include** only real employee titles with a nested `or` block using fuzzy `(.)` matching.
:::

**Refined query — exclude non-employee titles using `not_in`:**

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "past_employers.company_linkedin_profile_url",
                "type": "=",
                "value": "https://www.linkedin.com/company/openai"
            },
            {
                "column": "past_employers.end_date",
                "type": ">",
                "value": "2025-11-07"
            },
            {
                "column": "current_employers.company_linkedin_profile_url",
                "type": "!=",
                "value": "https://www.linkedin.com/company/openai"
            },
            {
                "column": "past_employers.title",
                "type": "not_in",
                "value": ["Investor", "Angel Investor", "Forum Member", "Community Member"]
            }
        ]
    },
    "limit": 25
}' \
--compressed
```

**Refined query — include only real employee titles using nested `or` with fuzzy matching:**

```bash
curl 'https://api.crustdata.com/screener/persondb/search' \
-H "Authorization: Token $auth_token" \
-H 'Content-Type: application/json' \
--data-raw '{
    "filters": {
        "op": "and",
        "conditions": [
            {
                "column": "past_employers.company_linkedin_profile_url",
                "type": "=",
                "value": "https://www.linkedin.com/company/openai"
            },
            {
                "column": "past_employers.end_date",
                "type": ">",
                "value": "2025-11-07"
            },
            {
                "column": "current_employers.company_linkedin_profile_url",
                "type": "!=",
                "value": "https://www.linkedin.com/company/openai"
            },
            {
                "op": "or",
                "conditions": [
                    {"column": "past_employers.title", "type": "(.)", "value": "Engineer"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Staff"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Intern"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Director"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Manager"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Head"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Recruiting"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Operator"},
                    {"column": "past_employers.title", "type": "(.)", "value": "Researcher"}
                ]
            }
        ]
    },
    "limit": 25
}' \
--compressed
```

:::warning Fuzzy Match Does Not Support OR in Value String
The `(.)` operator does **not** support `OR` syntax within the value string (e.g., `"Engineer OR Staff"` will return 0 results). Instead, use a **nested `or` block** with separate conditions for each keyword, as shown above.
:::

**What these queries do:**
- Find people who have OpenAI as a **past employer** (not current)
- With an **end date** after a specific date (indicating they left recently)
- Who are **not currently** at OpenAI (confirming they truly left)
- The refined versions filter the title to include only actual employees, excluding investors, community members, forum participants, etc.

**When to use which approach:**
- **`not_in` (exclusion)**: Better when noisy titles are a small, known set and real employee titles vary widely
- **Nested `or` with `(.)`  (inclusion)**: Better when you want to target specific role types (e.g., only engineering and research roles)

</details>

## Example Response
<details id="1-response-when-profiles-are-in-database">
<summary>1. CEO's in companies located in New York</summary>

[View example response](/examples/people-search/persondb-ceo.json)
</details>

<details id="2-response-preview">
<summary>2. Response with `preview=true`</summary>

[View example response](//examples/people-search/persondb-preview.json)
</details>

## Pagination

This API uses cursor-based pagination for efficient data retrieval:
- `cursor`: Pagination cursor from previous response (optional)
- `limit`: Results per page (default: 20, max: 1,000)

The response includes:
- `next_cursor`: Cursor for fetching the next page
- `total_count`: Total number of results matching your filters

### How Cursor Pagination Works

1. **First Request**: Don't include a cursor
2. **Subsequent Requests**: Use the `next_cursor` from the previous response
3. **End of Results**: When no more results exist, the next request returns an empty `profiles` array

:::info Important
- The cursor is tied to your specific query (filters + sorts). Using a cursor with different query parameters will return an error.
- Cursors should be treated as opaque strings and not modified.
:::

<details>
<summary>Paginating through results</summary>

```bash
# First page (people 1-100)
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
--data-raw '{
    "filters": { ... },
    "limit": 100
}'
# Response: { "profiles": [...], "next_cursor": "eJx1jjEOwjAMRe...", "total_count": 250 }

# Second page (people 101-200)
curl 'https://api.crustdata.com/screener/persondb/search/' \
-H "Authorization: Token $auth_token" \
--data-raw '{
    "filters": { ... },
    "limit": 100,
    "cursor": "eJx1jjEOwjAMRe..."
}'
# Response: { "profiles": [...], "next_cursor": "eJx2kLEOwjAMRe...", "total_count": 250 }

# Eventually, when no more results:
# Response: { "profiles": [], "total_count": 250 }
```
</details>

**Best Practices:**
- Use consistent filters across all pagination requests
- Check if `profiles` array is empty to determine end of results
- Store the cursor if you need to resume pagination later

## Best Practices

1. **Use specific filters** to reduce result set size and improve performance
2. **Combine multiple criteria** for more targeted searches
3. **Use pagination** for large result sets
4. **Cache results** when appropriate to reduce API calls

## Common Use Cases

1. **Executive Search**: Filter by `seniority_level` and `current_title`
2. **Industry Experts**: Combine `industry`, `years_of_experience`, and `skills`
3. **Alumni Networks**: Use `school` filter with company or location filters
4. **Job Function Analysis**: Filter by `function` and `company_type`
5. **Geographic Talent Pool**: Use `region` with experience or skill filters
6. **Local Recruitment**: Use `geo_distance` to find candidates within a radius of your office (see Example 11)
7. **Regional Market Analysis**: Combine `geo_distance` with industry filters to map talent density
8. **Excluding Senior Roles**: Use `not_in` with `all_employers.seniority_level` and `all_employers.title` (see Example 13)
9. **Competitor Analysis**: Use `not_in` with `all_employers.name` to exclude specific companies (see Example 14)
10. **Verified Contact Outreach**: Use `current_employers.business_email_verified` to find people with verified business emails (see Example 16)
11. **Recent Hires & Departures**: Find people who recently joined or left a specific company, with title filtering to exclude non-employees like investors or community members (see Example 17)

## Rate Limits and Performance

- **Rate limit**: 60 requests per minute (RPM)
- **Maximum profiles per response**: 1,000 profiles per request
- **Maximum exclusions**: 50,000 profiles in `post_processing.exclude_profiles`
- **Request payload limit**: 10MB total request size
- **Performance tip**: Use specific filters to improve response time. Exclusion lists over 10,000 profiles may increase response time significantly.