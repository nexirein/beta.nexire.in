# How to Build People Filters

The LinkedIn People Search API allows filtering results using **text**, **range**, and **boolean** filters. Below is a guide on how to construct each type of filter with examples.

### Text Filter

A **text filter** is used to filter based on specific text values. Each **text filter** must contain **filter_type**, **type** and list of **value**.

#### Valid Types:
- `in`: To include values.
- `not in`: To exclude values. Excluding values might not be supported for every filter.

#### Example:

```json
{
  "filter_type": "CURRENT_TITLE",
  "type": "in",
  "value": ["Founder"]
}
```

### Boolean Filter

A **boolean filter** is used to filter based on true/false values. It doesn't contain any **type** or **value**

#### Example:

```json
{
  "filter_type": "RECENTLY_CHANGED_JOBS"
}
```
:::tip

Filters often require specific values. Only use values that are defined for each filter.

:::

### Filters for Person Search

| Filter Type                     | Description                                      | Properties                          | Values/Sub-filters               |
|---------------------------------|--------------------------------------------------|-------------------------------------|----------------------------------|
| `CURRENT_COMPANY`               | Specifies the current company of the person.    | `types: [in, not in]` | List of strings <br/><br/> **Identifier Types (in order of preference):** <br/>1. **Profile URL (Most Accurate)**: `"https://linkedin.com/company/tryretool"` <br/>2. **Domain**: `"retool.com"` <br/>3. **Name (Least preferred)**: `"retool"`                           |
| `CURRENT_TITLE`                 | Specifies the current title of the person.      |  `types: [in, not in]` |List of strings <br/><br/>  Title Enumerations: [**Static title values**](/examples/people-search/linkedin_titles.json) or use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) <br/><br/>  `fuzzy_match` attribute is available for this this filter type to get wider search resutls. [**Example**](/docs/2024-11-01/discover/people-apis/people-search-api#17-fuzzy-title-matching) |         |
| `PAST_TITLE`                    | Specifies the past titles held by the person.   | `types: [in, not in]` | List of strings <br/><br/>  Title Enumerations: [**Static title values**](/examples/people-search/linkedin_titles.json) or use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) <br/><br/>  `fuzzy_match` attribute is available for this this filter type to get wider search resutls. [**Example**](/docs/2024-11-01/discover/people-apis/people-search-api#17-fuzzy-title-matching) |
| `COMPANY_HEADQUARTERS`          | Specifies the headquarters of the person's company. | `types: [in, not in]`                | Use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) to get valid values.<br/>Full list: [**region_values**](https://crustdata-docs-region-json.s3.us-east-2.amazonaws.com/updated_regions.json)                           |
| `COMPANY_HEADCOUNT`             | Specifies the size of the company based on the number of employees. | `types: [in]`                      | `"Self-employed"`, `"1-10"`, `"11-50"`, `"51-200"`, `"201-500"`, `"501-1,000"`, `"1,001-5,000"`, `"5,001-10,000"`, `"10,001+"` |
| `REGION`                        | Specifies the geographical region of the person. | `types: [in, not in]`               | Use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) to get valid values.<br/>Full list: [**region_values**](/examples/people-search/static-region-filter-values.json)                           |
| `INDUSTRY`                      | Specifies the industry of the person's company.  | `types: [in, not in]`                      | Use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) to get valid values.<br/>Full list: [**industry_values**](/examples/people-search/static-linkedin-industries.json)  |
| `PROFILE_LANGUAGE`              | Specifies the language of the person's profile.  | `types: [in]`                      | `"Arabic"`, `"English"`, `"Spanish"`, `"Portuguese"`, `"Chinese"`, `"French"`, `"Italian"`, `"Russian"`, `"German"`, `"Dutch"`, `"Turkish"`, `"Tagalog"`, `"Polish"`, `"Korean"`, `"Japanese"`, `"Malay"`, `"Norwegian"`, `"Danish"`, `"Romanian"`, `"Swedish"`, `"Bahasa Indonesia"`, `"Czech"` |
| `SENIORITY_LEVEL`               | Specifies the seniority level of the person.     | `types: [in, not in]`                | `"Owner / Partner"`, `"CXO"`, `"Vice President"`, `"Director"`, `"Experienced Manager"`, `"Entry Level Manager"`, `"Strategic"`, `"Senior"`, `"Entry Level"`, `"In Training"` |
| `YEARS_AT_CURRENT_COMPANY`      | Specifies the number of years the person has been at their current company. | `types: [in]`                      | `"Less than 1 year"`, `"1 to 2 years"`, `"3 to 5 years"`, `"6 to 10 years"`, `"More than 10 years"` |
| `YEARS_IN_CURRENT_POSITION`      | Specifies the number of years the person has been in their current position. | `types: [in]`                      | `"Less than 1 year"`, `"1 to 2 years"`, `"3 to 5 years"`, `"6 to 10 years"`, `"More than 10 years"` |
| `YEARS_OF_EXPERIENCE`           | Specifies the total years of experience the person has. | `types: [in]`                      | `"Less than 1 year"`, `"1 to 2 years"`, `"3 to 5 years"`, `"6 to 10 years"`, `"More than 10 years"` |
| `FIRST_NAME`                    | Specifies the first name of the person.          | `types: [in]` | List of strings (max length 1)                            |
| `LAST_NAME`                     | Specifies the last name of the person.           | `types: [in]` | List of strings (max length 1)                              |
| `FUNCTION`                      | Specifies the function or role of the person.    | `types: [in, not in]`               | `"Accounting"`, `"Administrative"`, `"Arts and Design"`, `"Business Development"`, `"Community and Social Services"`, `"Consulting"`, `"Education"`, `"Engineering"`, `"Entrepreneurship"`, `"Finance"`, `"Healthcare Services"`, `"Human Resources"`, `"Information Technology"`, `"Legal"`, `"Marketing"`, `"Media and Communication"`, `"Military and Protective Services"`, `"Operations"`, `"Product Management"`, `"Program and Project Management"`, `"Purchasing"`, `"Quality Assurance"`, `"Real Estate"`, `"Research"`, `"Sales"`, `"Customer Success and Support"` |
| `PAST_COMPANY`                  | Specifies the past companies the person has worked for. | `types: [in, not in]` | List of strings <br/><br/> **Identifier Types (in order of preference):** <br/>1. **Profile URL (Most Accurate)**: `"https://linkedin.com/company/tryretool"` <br/>2. **Domain**: `"retool.com"` <br/>3. **Name (Least preferred)**: `"retool"`                           |
| `COMPANY_TYPE`                  | Specifies the type of company the person works for. | `types: [in]`                      | `"Public Company"`, `"Privately Held"`, `"Non Profit"`, `"Educational Institution"`, `"Partnership"`, `"Self Employed"`, `"Self Owned"`, `"Government Agency"` |
| `POSTED_ON_LINKEDIN`            | Specifies if the person has posted on LinkedIn in last 30 days.  | N/A                                 | N/A                              |
| `RECENTLY_CHANGED_JOBS`         | Specifies if the person has changed jobs in last 90 days. | N/A                                 | N/A                              |
| `IN_THE_NEWS`                   | Specifies if the person has been mentioned in the news. | N/A                                 | N/A                              |
| `KEYWORD`                       | Filters based on specific keywords related to the company. | `types: [in]`                        | List of strings (max length 1)  |
| `SCHOOL`                        | Specifies if school person has gone to. | `types: [in]`                        | List of strings (max length 1) <br/><br/> **School Enumerations:** [**Static school values**](/examples/people-search/institutes.json) or use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) to get valid values.<br/><br/>