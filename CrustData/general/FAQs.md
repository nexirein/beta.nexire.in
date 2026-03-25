# Frequently Asked Questions about Crustdata APIs, Data Quality, and Platform Features

## General

### Why do I see duplicate companies or people in the data?

What looks like a duplicate are actually two different canonical entities. We use a unique identifier for each entity to distinguish them.

**Companies:** We use the LinkedIn ID as the unique identifier. Each company entity with a different LinkedIn ID is treated as a separate company—even if the name or website appears the same.

**People:** We use the LinkedIn URL as the unique identifier. Each person entity with a different LinkedIn URL is treated as a separate person—even if they share the same name.

**In short:** same name ≠ same entity. Different unique identifier = different record.

If that is not the case or you see multiple records with same identifier then please reach out to us with the example over Slack/email, our dev team would love to investigate this.

---

## Company-DB Search API

### What is the frequency of data update?

Here is the frequency of update per data point:

| Data Point | Update Frequency |
|---|---|
| Headcount details | 30 days |
| Funding data | 30 days or new fundraise (whichever is earlier) |
| Job listings | 30 days |

### How to find tech stack of a company?

**Option 1: Search by LinkedIn description**

```bash
curl --location 'https://api.crustdata.com/screener/companydb/search' \
  --header 'Authorization: Token $token' \
  --header 'Content-Type: application/json' \
  --data '{
    "filters": {
      "filter_type": "linkedin_company_description",
      "type": "(.)",
      "value": "React"
    },
    "limit": 10
  }'
```

**Option 2: Search job listings (for a known company)**

```bash
curl --location 'https://api.crustdata.com/data_lab/job_listings/Table/' \
  --header 'Authorization: Token $token' \
  --header 'Content-Type: application/json' \
  --data '{
    "dataset": {
      "name": "job_listings",
      "id": "joblisting"
    },
    "filters": {
      "op": "and",
      "conditions": [
        {
          "column": "company_website_domain",
          "type": "(.)",
          "value": "rippling.com"
        },
        {
          "op": "or",
          "conditions": [
            {"column": "title", "type": "(.)", "value": "Engineer"},
            {"column": "title", "type": "(.)", "value": "Developer"},
            {"column": "title", "type": "(.)", "value": "Architect"}
          ]
        },
        {
          "op": "or",
          "conditions": [
            {"column": "description", "type": "(.)", "value": "Python"},
            {"column": "description", "type": "(.)", "value": "Django"},
            {"column": "description", "type": "(.)", "value": "React"},
            {"column": "description", "type": "(.)", "value": "AWS"},
            {"column": "description", "type": "(.)", "value": "PostgreSQL"},
            {"column": "description", "type": "(.)", "value": "Kubernetes"}
          ]
        }
      ]
    },
    "offset": 0,
    "limit": 30
  }'
```

---

## Person-DB Search API

### How frequently are people profiles refreshed?

Profiles with >500 connections are refreshed every 30 days. Remaining profiles are refreshed every 90 days. We are working towards closing the gap aggressively.

### How to use In-DB people search open_to_cards filter?

```json
{
  "filters": {
    "column": "open_to_cards",
    "type": "=",
    "value": "CAREER_INTEREST"
  },
  "limit": 10
}
```

### Who has access to person preview?

Only users with monthly spend >$3K are eligible for preview.

### How to identify a fake profile?

Suggested way to identify fake profiles is by ignoring profiles with:

- No experience or >30 experiences
- Less than 5 connections
- Less than 5 followers

### Why are some profiles missing from persondb/search results that I see on LinkedIn?

There are a few reasons why you may see some gaps:

#### 1. De-prioritized / low-quality profiles

We intentionally de-prioritize profiles that appear low-quality or potentially fake when adding new people to our database. For example, profiles with fewer than ~5 connections are currently flagged and excluded.

#### 2. Incorrect employer mapping on LinkedIn profiles

In some cases, a profile lists an employer in free text or links to an incorrect/missing LinkedIn company page in their experience. When this happens, we're unable to reliably map the profile to the correct company, even though LinkedIn may surface it using fuzzy name matching.

#### 3. Genuine but temporarily missing profiles

There can be legitimate profiles that are temporarily missing from our database—most commonly when someone has recently changed jobs and our system hasn't picked up the update yet. Profiles with >500 connections are re-synced roughly every 30 days, which typically resolves this over time.

---

## Company Enrichment API

### Can I get all domains/websites associated with a company?

Yes. We track multiple domains per company.

- Use the Screener / Company API
- Look at the `domains` field in the company response
- This covers parent domains, sub-brands, and alternate websites (e.g. meta.com, facebook.com, instagram.com, whatsapp.com, etc., where available)
- For large-scale use cases, this data is also available via data dumps, which can be refreshed periodically.

---

## Watcher

### Can I limit the number of Watcher notifications sent?

Yes. You can cap usage by setting a maximum number of notifications per execution for a Watcher.

- This helps control automatic credit usage
- The limit applies per run, based on the Watcher's frequency