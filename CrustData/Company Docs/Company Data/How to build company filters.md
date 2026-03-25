# How to Build Company Filters

The LinkedIn Company Search API allows filtering results using **text**, **range**, and **boolean** filters. Below is a guide on how to construct each type of filter with examples.

### Text Filter

A **text filter** is used to filter based on specific text values. Each **text filter** must contain **filter_type**, **type** and list of **value**.

#### Valid Types:
- `in`: To include values.
- `not in`: To exclude values. Excluding values might not be supported for every filter.

#### Example:

```json
{
  "filter_type": "COMPANY_HEADCOUNT",
  "type": "in",
  "value": ["10,001+", "1,001-5,000"]
}
```

### Range Filter

A **range filter** is used to filter based on a range of values. Each filter must contain **filter_type**, **type** and **value**. Few range filters might contain a **sub_filter**. Ensure that you correctly pass **sub_filter** if required.

#### sub_filter
The **sub_filter** is an optional field that provides additional context for the range filter. For example, with the `DEPARTMENT_HEADCOUNT` filter, the **sub_filter** specifies which department the filter applies to. Ensure that you correctly pass **sub_filter** if required.

#### Valid Types:
- `between`: To specify a range of values, indicating that the value must fall within the defined minimum and maximum limits.

#### Example:

```json
{
  "filter_type": "ANNUAL_REVENUE",
  "type": "between",
  "value": {"min": 1, "max": 500},
  "sub_filter": "USD"
}
```

### Boolean Filter

A **boolean filter** is used to filter based on true/false values. It doesn't contain any **type** or **value**

#### Example:

```json
{
  "filter_type": "IN_THE_NEWS"
}
```
:::tip

Filters often require specific values. Only use values that are defined for each filter.

:::

### Filters for Company Search

| Filter Type                     | Description                                      | Properties                          | Values/Sub-filters               |
|---------------------------------|--------------------------------------------------|-------------------------------------|----------------------------------|
| `COMPANY_HEADCOUNT`             | Specifies the size of the company based on the number of employees. | `types: [in]`             |  `"1-10"`, `"11-50"`, `"51-200"`, `"201-500"`, `"501-1,000"`, `"1,001-5,000"`, `"5,001-10,000"`, `"10,001+"` |
| `REGION`                        | Specifies the geographical region of the company. | `types: [in, not in]`             | Use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) to get valid values.<br/>Full list: [**region_values**](/examples/people-search/static-region-filter-values.json)                           |
| `INDUSTRY`                      | Specifies the industry of the company.   | `types: [in, not in]`             | Use [**Filters Autocomplete API**](/docs/2024-11-01/discover/auxiliary-apis/filters-autocomplete) to get valid values.<br/>Full list: [**industry_values**](/examples/people-search/static-linkedin-industries.json)                            |
| `NUM_OF_FOLLOWERS`              | Specifies the number of followers a company has. | `types: [in]`             | `"1-50"`, `"51-100"`, `"101-1000"`, `"1001-5000"`, `"5001+"` |
| `FORTUNE`                       | Specifies the Fortune ranking of the company. | `types: [in]`             | `"Fortune 50"`, `"Fortune 51-100"`, `"Fortune 101-250"`, `"Fortune 251-500"` |
| `ACCOUNT_ACTIVITIES`           | Specifies recent account activities, such as leadership changes or funding events. | `types: [in]`              | `"Senior leadership changes in last 3 months"`, `"Funding events in past 12 months"` |
| `JOB_OPPORTUNITIES`            | Specifies job opportunities available at the company. | `types: [in]`           | `"Hiring on Linkedin"` |
| `COMPANY_HEADCOUNT_GROWTH`     | Specifies the growth of the company's headcount. | `allowed_without_sub_filter`, `types: [between]` | N/A                              |
| `ANNUAL_REVENUE` | Specifies the company’s annual revenue **in millions**. | `types: ["between"]` | **Min & Max values are expressed in millions.** <br/> Example: ```{"filter_type":"ANNUAL_REVENUE","type":"between","value":{"min":1000,"max":10000},"sub_filter":"USD"}``` <br/><br/>Choose the currency for `sub_filter` from: `"USD"`, `"AED"`, `"AUD"`, `"BRL"`, `"CAD"`, `"CNY"`, `"DKK"`, `"EUR"`, `"GBP"`, `"HKD"`, `"IDR"`, `"ILS"`, `"INR"`, `"JPY"`, `"NOK"`, `"NZD"`, `"RUB"`, `"SEK"`, `"SGD"`, `"THB"`, `"TRY"`, `"TWD"` |
| `DEPARTMENT_HEADCOUNT`          | Specifies the headcount of specific departments within the company. |  `types: [between]`             | `"Accounting"`, `"Administrative"`, `"Arts and Design"`, `"Business Development"`, `"Community and Social Services"`, `"Consulting"`, `"Education"`, `"Engineering"`, `"Entrepreneurship"`, `"Finance"`, `"Healthcare Services"`, `"Human Resources"`, `"Information Technology"`, `"Legal"`, `"Marketing"`, `"Media and Communication"`, `"Military and Protective Services"`, `"Operations"`, `"Product Management"`, `"Program and Project Management"`, `"Purchasing"`, `"Quality Assurance"`, `"Real Estate"`, `"Research"`, `"Sales"`, `"Customer Success and Support"` |
| `DEPARTMENT_HEADCOUNT_GROWTH`   | Specifies the growth of headcount in specific departments. |   `types: [between]`       | `"Accounting"`, `"Administrative"`, `"Arts and Design"`, `"Business Development"`, `"Community and Social Services"`, `"Consulting"`, `"Education"`, `"Engineering"`, `"Entrepreneurship"`, `"Finance"`, `"Healthcare Services"`, `"Human Resources"`, `"Information Technology"`, `"Legal"`, `"Marketing"`, `"Media and Communication"`, `"Military and Protective Services"`, `"Operations"`, `"Product Management"`, `"Program and Project Management"`, `"Purchasing"`, `"Quality Assurance"`, `"Real Estate"`, `"Research"`, `"Sales"`, `"Customer Success and Support"`                            |
| `KEYWORD`                       | Filters based on specific keywords related to the company. | `types: [in]`                        | List of strings (max length 1)  |