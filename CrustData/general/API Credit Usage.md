# API Credit Usage

This comprehensive pricing table shows the credit cost for all Crustdata API endpoints. Credits are deducted based on the data returned or specific features used.

:::info No Results, No Charges
You are never charged credits when our APIs return no results. Credits are only deducted when data is successfully returned from your API requests.
:::

## Company APIs

| **Endpoint** | **Endpoint Path** | **Credit Cost** | **Notes** |
|-------------|------------------|-----------------|-----------|
| **Company Enrichment (in-DB)** | `screener/company` | 1 credit per company | Standard enrichment from database |
| **Company Enrichment (Realtime)** | `screener/company` | 5 credits per company | Realtime enrichment with `enrich_realtime=true` |
| **Company Search (in-DB)** | `screener/companydb/search` | 1 credit per 100 results | New enhanced database discovery |
| **Company Search (Realtime)** | `screener/company/search` | 1 credit per company | Returns 25 companies per page by default |
| **Company Identification** | `screener/identify` | **Free** | No credits consumed |
| **Company LinkedIn Posts (Default)** | `screener/linkedin_posts` | 1 credit per post | Basic post data |
| **Company LinkedIn Posts (with reactors)** | `screener/linkedin_posts` | 5 credits per post | When `fields=reactors` |
| **Company LinkedIn Posts (with comments)** | `screener/linkedin_posts` | 5 credits per post | When `fields=comments` |
| **Company LinkedIn Posts (reactors + comments)** | `screener/linkedin_posts` | 10 credits per post | When `fields=reactors,comments` |

## People APIs

| **Endpoint** | **Endpoint Path** | **Credit Cost** | **Notes** |
|-------------|------------------|-----------------|-----------|
| **People Enrichment (Database)** | `screener/person/enrich` | 3 credits per profile | Database enrichment |
| **People Enrichment (Realtime)** | `screener/person/enrich` | 5 credits per profile | Realtime enrichment with `enrich_realtime=true` |
| **People Enrichment (Email)** | `screener/person/enrich` | 2 credits per profile | When requesting business email |
| **People Search (Realtime)** | `screener/persondb/search` | 3 credits per 100 results | Database discovery |
| **People Search (Realtime Preview)** | `screener/person/search` | 5 credits per request | When `preview=true` |
| **People LinkedIn Posts (Default)** | `screener/linkedin_posts` | 1 credit per post | Basic post data |
| **People LinkedIn Posts (with reactors)** | `screener/linkedin_posts` | 5 credits per post | When `fields=reactors` |
| **People LinkedIn Posts (with comments)** | `screener/linkedin_posts` | 5 credits per post | When `fields=comments` |
| **People LinkedIn Posts (reactors + comments)** | `screener/linkedin_posts` | 10 credits per post | When `fields=reactors,comments` |

## LinkedIn Posts Keyword Search

| **Request Type** | **Endpoint Path** | **Credit Cost** | **Notes** |
|-----------------|------------------|-----------------|-----------|
| **Default requests** | `screener/linkedin_posts/keyword_search` | 1 credit per post | Basic keyword search |
| **With reactors** | `screener/linkedin_posts/keyword_search` | 5 credits per post | When `fields="reactors"` |
| **With comments** | `screener/linkedin_posts/keyword_search` | 5 credits per post | When `fields="comments"` |
| **With reactors + comments** | `screener/linkedin_posts/keyword_search` | 10 credits per post | When `fields="reactors,comments"` |
| **Exact keyword match** | `screener/linkedin_posts/keyword_search` | 3 credits per post | When `exact_keyword_match=true` |

## Dataset APIs

| **Dataset** | **Endpoint Path** | **Credit Cost** | **Notes** |
|------------|------------------|-----------------|-----------|
| **Job Listings (Standard)** | `data_lab/job_listings/Table` | 1 credit per company | Each company returned |
| **Job Listings (Realtime sync)** | `data_lab/job_listings/Table` | 5 credits per request | When `sync_from_source=true` |
| **Job Listings (Background task)** | `data_lab/job_listings/Table` | 5 credits per request | When `background_task=true` |
| **Funding Milestones** | `data_lab/funding_milestone_timeseries/Table` | 1 credit per row | Each row returned |
| **G2 Reviews** | `data_lab/g2_profile_metric/Table` | 1 credit per company | Each company returned |
| **Glassdoor Reviews** | `data_lab/glassdoor_profile_metric/Table` | 1 credit per company | Each company returned |
| **Gartner Data** | `data_lab/gartner_review/search` | 1 credit per company | Each company returned |
| **ProductHunt Data** | `data_lab/producthunt/Table` | 1 credit per company | Each company returned |
| **Investor Portfolio** | `data_lab/investor_portfolio/Table` | 1 credit per portfolio company | Each portfolio company returned |

## Auxiliary APIs

| **Endpoint** | **Endpoint Path** | **Credit Cost** | **Notes** |
|-------------|------------------|-----------------|-----------|
| **Company Autocomplete** | `screener/companydb/autocomplete` | **Free** | No credits consumed |
| **People Autocomplete** | `screener/persondb/autocomplete` | **Free** | No credits consumed |
| **Filters Autocomplete** | `screener/filters/autocomplete` | **Free** | No credits consumed |
| **Remaining Credits** | `screener/credits/remaining` | **Free** | Check your credit balance |

---

## Need More Credits?

To purchase additional credits or upgrade your plan, visit the [Crustdata Dashboard](https://app.crustdata.com/screenerv2) or contact our team at [gtm@crustdata.com](mailto:gtm@crustdata.com).

You can check your remaining credits using the [Remaining Credits API endpoint](/docs/2024-11-01/discover/auxiliary-apis/remaining-credits) or in your dashboard.