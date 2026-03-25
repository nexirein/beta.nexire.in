# API Rate Limits

Crustdata APIs implement rate limiting using a **leaky bucket algorithm** to ensure fair usage and system stability. This approach requires you to spread your API requests evenly over time rather than sending them in bursts.

:::warning Important: Request Distribution
**Batching does not work with our rate limiting system.** Even if you send 100 requests at once when your rate limit is 1000 RPM (well under the limit), you will still encounter `429 Too Many Requests` errors. The leaky bucket algorithm enforces a steady processing rate, not just a total count per minute. You must distribute requests evenly throughout the entire minute to avoid rate limiting.
:::

## Default Rate Limits

The following table shows the default rate limits for each API endpoint in requests per minute (RPM):

| **Endpoint** | **Rate Limit (RPM)** |
|-------------|---------------------|
| `/data_lab/headcount_timeseries` | 30 |
| `/data_lab/headcount_by_facet_timeseries` | 30 |
| `/data_lab/funding_milestone_timeseries` | 30 |
| `/data_lab/decision_makers` | 30 |
| `/screener/company_profile` | 30 |
| `/screener/identify` | 30 |
| `/screener/page_info` | 30 |
| `/screener/lookup_column_value` | 30 |
| `/screener/search_company_profile` | 30 |
| `/screener/all_column_info` | 30 |
| `/screener/user_search_history` | 30 |
| `/screener/query_by_hash` | 30 |
| `/screener/screen` | 30 |
| `/screener/company` | 30 |
| `/screener/person/search` | 15 |
| `/screener/persondb/search` | 60 |
| `/screener/persondb/autocomplete` | 60 |
| `/screener/company/search` | 15 |
| `/screener/person/enrich` | 15 |
| `/screener/linkedin_posts` | 15 |
| `/data_lab/job_openings_by_facet_timeseries` | 30 |
| `/data_lab/job_listings/Table` | 15 |
| `/screener/web-search` | 10 |
| `/screener/web-fetch` | 10 |

:::info Custom Rate Limits
Custom rate limits are available on demand for higher volume use cases. Contact our team at [gtm@crustdata.com](mailto:gtm@crustdata.com) to discuss your requirements.
:::

## How It Works

The leaky bucket algorithm processes requests at a constant rate (the "leak rate"):

- Requests are processed at a steady rate throughout the minute
- If you send requests faster than the leak rate, they will be rejected with a `429 Too Many Requests` response
- You must space out your requests over the entire minute to stay within limits
- The system does not simply count total requests per minute - it enforces continuous distribution

## Best Practices

To avoid rate limiting and ensure smooth API integration:

1. **Distribute requests evenly**: Instead of sending 60 requests at once, send 1 request per second over 60 seconds
2. **Implement retry logic**: Handle 429 responses with exponential backoff to gracefully manage rate limit errors
3. **Monitor rate limit errors**: Check the Request Logs section in your [Dashboard](https://app.crustdata.com/screenerv2/developers) to review any rate limit errors
4. **Plan request scheduling**: Design your integration to spread requests over time rather than batching them

## Monitoring Rate Limits

You can monitor your rate limit usage and errors through:

- **Request Logs**: View detailed logs in the [Dashboard](https://app.crustdata.com/screenerv2/developers) under the Request Logs section
- **API Responses**: Watch for `429 Too Many Requests` status codes in your API responses
- **Error Messages**: Rate limit errors will include information about the rate limit violation

---

Need higher rate limits for your use case? Contact our team at [gtm@crustdata.com](mailto:gtm@crustdata.com) to discuss custom rate limit options.