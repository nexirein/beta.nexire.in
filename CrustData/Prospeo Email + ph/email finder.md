
⚠️ Email Finder
[Deprecated] Email Finder API
This endpoint is deprecated and will be fully removed on the 1st of March. A new endpoint is available for finding emails. You can easily migrate to our new endpoint and achieve the same exact behavior by following our quick migration guide below.

Perks of migrating
By using our new Enrich Person endpoint, you will get for the same price:

Almost instant response time
Complete profile of the lead for free (complete company data, job title, seniority…)
Much better match rate
Possibility to also enrich the mobile in one request
Possibility to enrich 50 emails at once (by using our Bulk Enrich Person endpoint)
Much stabler response status with simpler error codes
Much higher rate limit (up to 100+ per second depending on your plan)
The new API has been created to help all of our partners, small and large, to much more efficiently query and access Prospeo’s data.

Migrate now from /email-finder to /enrich-person
Migration is required before the 1st of March.

We estimate the migration time from /email-finder to /enrich-person to be between 5 and 15 minutes of dev time.

Below is the request you used to perform:

POST "https://api.prospeo.io/email-finder"
X-KEY: "your_api_key"
Content-Type: "application/json"
 
{
   "first_name": "John",
   "last_name": "Doe",
   "company": "intercom.com"
}
In order to get the same results (and 50+ free datapoints), you would now perform:

POST "https://api.prospeo.io/enrich-person"
X-KEY: "your_api_key"
Content-Type: "application/json"
 
{
    "only_verified_email": true,
    "data": {
        "full_name": "John Doe",
        "company_website": "intercom.com"
    }
}
The response will look like this.

Using the only_verified_email guarantees we only return a response (and debit a credit) when a VERIFIED email was found.

Please review the Enrich Person endpoint for one-by-one enrichment, or the Bulk Enrich Person endpoint for faster, batch-by-batch enrichment.

