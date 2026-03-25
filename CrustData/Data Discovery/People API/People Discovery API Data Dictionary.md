# People Discovery API Data Dictionary

This dictionary describes the data returned by the People Discovery API (`/screener/persondb/search` endpoint). This API enables you to search across millions of professional profiles with advanced filtering capabilities.

## Response Structure

The API returns a JSON object with the following structure:

```json
{
  "profiles": [
    // Array of person objects
  ],
  "next_cursor": "string", // For pagination
  "total_count": 9462,
}
```

## Person Object Structure

Each person object in the `profiles` array contains the following fields:

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **person_id** | number | Unique identifier for the person | `969` |
| **name** | string | Full name of the person | `"Jane Smith"` |
| **first_name** | string | First name | `"Jane"` |
| **last_name** | string | Last name | `"Smith"` |
| **linkedin_profile_url** | string | LinkedIn profile URL | `"https://www.linkedin.com/in/ACoAABLXvswB8M5uj4-GKj_LUdJEarR9lC5ohFo"` |
| **flagship_profile_url** | string | LinkedIn flagship profile URL | `"https://www.linkedin.com/in/janesmith"` |
| **region** | string | Current location/region | `"San Francisco Bay Area"` |
| **region_address_components** | array of strings | Address hierarchy components (city, state, country) | `["San Francisco Bay Area", "California", "United States"]` |
| **headline** | string | LinkedIn headline/bio | `"VP of Engineering at TechCorp"` |
| **summary** | string | Profile summary/about section | `"Experienced leader in..."` |
| **emails** | array of strings | Email addresses (if available) | `["jane@techcorp.com"]` |
| **twitter_handle** | string | Twitter/X username (if available) | `"janesmith"` |
| **profile_picture_url** | string | URL to profile picture | `"https://media.licdn.com/dms/image/v2/D5603AQH..."` |
| **profile_picture_permalink** | string | Permanent URL to profile picture | `"https://crustdata-media.s3.us-east-2.amazonaws.com/person/..."` |
| **num_of_connections** | integer | Number of LinkedIn connections | `4644` |
| **open_to_cards** | array | Open To Cards information | `[]` |
| **recently_changed_jobs** | boolean | Indicator if recently changed jobs | `false` |
| **years_of_experience** | string | Experience level category | `"More than 10 years"` |
| **years_of_experience_raw** | number | Raw years of experience value | `12` |
| **skills** | array of strings | List of professional skills | `["Python", "Machine Learning", "Leadership"]` |
| **languages** | array of strings | Languages spoken | `["English (Native or bilingual proficiency)", "Telugu (Native or bilingual proficiency)"]` |
| **profile_language** | string | Language of LinkedIn profile | `"English (Native or bilingual proficiency)"` |
| **current_employers** | array of objects | Current employment details | See [Current Employer Object](#current-employer-object) |
| **past_employers** | array of objects | Past employment details | See [Past Employer Object](#past-employer-object) |
| **all_employers** | array of objects | All employment history | Combined current and past employers |
| **education_background** | array of objects | Educational background | See [Education Object](#education-object) |
| **certifications** | array of objects | Professional certifications | See [Certification Object](#certification-object) |
| **honors** | array of objects | Honors and awards | See [Honor Object](#honor-object) |
| **last_updated** | string | Last update timestamp (ISO format) | `"2025-10-16T14:36:48"` |
| **updated_at** | string | Record update timestamp (ISO format) | `"2025-11-04T14:44:01"` |
| **location_details** | object | Detailed location information | See [Location Details Object](#location-details-object) |

## Location Details Object

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **city** | string | City name | `"New York"` |
| **state** | string | State/province name | `"New York"` |
| **country** | string | Country name | `"United States"` |
| **continent** | string | Continent name | `"North America"` |

## Current Employer Object

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **name** | string | Company name | `"PlugXR"` |
| **linkedin_id** | string | Company LinkedIn ID | `"14455520"` |
| **company_id** | number | Internal company ID | `8998` |
| **company_linkedin_id** | string | Company LinkedIn ID (duplicate of linkedin_id) | `"14455520"` |
| **company_website_domain** | string | Company website domain | `"plugxr.com"` |
| **position_id** | string | Position identifier | `"1391672653"` |
| **title** | string | Job title | `"Founder & CEO"` |
| **description** | string | Job description | `"Leading engineering teams..."` |
| **location** | string | Job location | `"Hyderabad, Telangana, India"` |
| **start_date** | string | Position start date (ISO format) | `"2017-02-01T00:00:00"` |
| **end_date** | string | Position end date (null for current) | `null` |
| **employer_is_default** | boolean | Whether this is the default/primary employer | `true` |
| **seniority_level** | string | Seniority level at company | `"CXO"` |
| **function_category** | string | Job function category | `""` |
| **years_at_company** | string | Years at company (categorical) | `"6 to 10 years"` |
| **years_at_company_raw** | number | Years at current company | `8` |
| **company_headquarters_country** | string | Company HQ country (ISO 3-alpha format) | `"USA"` |
| **company_hq_location** | string | Company headquarters location | `"San Jose, California, United States"` |
| **company_hq_location_address_components** | array of strings | HQ address hierarchy components | `["San Jose", "Santa Clara County", "California", "United States"]` |
| **company_headcount_range** | string | Employee count range | `"11-50"` |
| **company_headcount_latest** | number | Latest headcount number | `41` |
| **company_industries** | array of strings | Company industries | `["Software Development", "Technology, Information and Internet", "Technology, Information and Media"]` |
| **company_linkedin_industry** | string | Primary LinkedIn industry | `"Software Development"` |
| **company_type** | string | Type of company | `"Privately Held"` |
| **company_website** | string | Full company website URL | `"https://www.plugxr.com/"` |
| **company_linkedin_profile_url** | string | Company LinkedIn profile URL | `"https://www.linkedin.com/company/plugxr"` |
| **business_email_verified** | boolean | Whether business email is verified. **Filterable**: use `{"column": "current_employers.business_email_verified", "type": "=", "value": true}` to find profiles with verified emails | `true` |

## Past Employer Object

Objects within the `past_employers` array field of the Person Object. Similar structure to Current Employer Object, but represents previous employment.

## Education Object

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **degree_name** | string | Name of degree earned | `"Master of Science"` |
| **field_of_study** | string | Field or major of study | `"Computer Science"` |
| **institute_name** | string | Educational institution name | `"Stanford University"` |
| **institute_linkedin_id** | string | Institution LinkedIn ID | `"18104"` |
| **institute_linkedin_url** | string | Institution LinkedIn URL | `"https://linkedin.com/school/stanford-university"` |
| **institute_logo_url** | string | Institution logo URL | `"https://media.licdn.com/..."` |
| **start_date** | string | Education start date (ISO format) | `"2008-09-01T00:00:00+00:00"` |
| **end_date** | string | Education end date (ISO format) | `"2010-06-01T00:00:00+00:00"` |
| **activities_and_societies** | string | Extracurricular activities | `"Computer Science Society, Debate Team"` |

## Certification Object

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **name** | string | Certification name | `"AWS Solutions Architect"` |
| **issued_date** | string | Issue date (ISO format) | `"2023-05-15T00:00:00+00:00"` |
| **expiration_date** | string | Expiration date (ISO format) | `"2026-05-15T00:00:00+00:00"` |
| **url** | string | Certification URL/link | `"https://aws.amazon.com/..."` |
| **issuer_organization** | string | Issuing organization | `"Amazon Web Services"` |
| **issuer_organization_linkedin_id** | string | Issuer LinkedIn ID | `"2382910"` |
| **certification_id** | string | Certification identifier | `"AWS-SAA-C03-123456"` |

## Honor Object

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **title** | string | Honor/award title | `"Employee of the Year"` |
| **issued_date** | string | Date issued (ISO format) | `"2023-12-01T00:00:00+00:00"` |
| **description** | string | Honor description | `"Recognized for outstanding leadership..."` |
| **issuer** | string | Issuing organization | `"TechCorp Inc."` |
| **media_urls** | array of strings | Associated media URLs | `["https://example.com/award-photo.jpg"]` |
| **associated_organization_linkedin_id** | string | Organization LinkedIn ID | `"123456"` |
| **associated_organization** | string | Associated organization name | `"TechCorp Inc."` |

## Pagination Response

| **Field** | **Type** | **Description** | **Example** |
|-----------|----------|----------------|-------------|
| **profiles** | array | Array of person objects | See above |
| **next_cursor** | string | Cursor for next page (null if last page) | `"eJx1jjEOwjAMRe..."` |
| **total_count** | number | Total number of results matching filters | `1155003` |

## Filter Field Types

When building filters, fields support different data types:

| **Data Type** | **Supported Operators** | **Example Fields** |
|---------------|------------------------|-------------------|
| **String** | `=`, `!=`, `in`, `not_in`, `(.)` | `name`, `title`, `company_name` |
| **Number** | `=`, `!=`, `>`, `<`, `=>`, `=<`, `in`, `not_in` | `years_of_experience_raw`, `num_of_connections` |
| **Date** | `=`, `!=`, `>`, `<`, `=>`, `=<` | `start_date`, `end_date`, `issued_date` |
| **Boolean** | `=`, `!=` | `recently_changed_jobs` |
| **Array** | `=`, `!=`, `in`, `not_in`, `(.)` | `skills`, `languages`, `company_industries` |

For detailed filtering examples and usage, refer to the [People Discovery API documentation](/docs/2024-11-01/discover/people-apis/people-discovery-api-in-db).