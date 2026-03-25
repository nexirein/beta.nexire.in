# Company Enrichment API Dictionary

This dictionary describes the data returned by the Company Enrichment API (`/screener/company` endpoint). It provides detailed information about companies across various categories including firmographics, headcount, traffic metrics, and more.

## Response Structure

The API returns an array of company objects, each containing comprehensive data organized in the following sections.

**⚠️ Note:** Fields marked with an asterisk (*) have upcoming data type changes.

## Basic Company Information

| Field                         | Type    | Description                                                        |
|-------------------------------|---------|-------------------------------------------------------------------|
| company_id                    | integer | Unique identifier for the company                                  |
| company_name                  | string  | Name of the company                                                |
| linkedin_profile_name          | string  | Name of the company on it's LinkedIn profile                              |
| linkedin_profile_url          | string  | URL to the company's LinkedIn profile                              |
| crunchbase_profile_url        | string  | URL to the company's Crunchbase profile                            |
| crunchbase_profile_uuid       | string  | Unique UUID from Crunchbase                                        |
| linkedin_id                   | string  | Unique LinkedIn identifier for the company                         |
| linkedin_logo_url             | string  | URL of the company's logo from LinkedIn                            |
| linkedin_logo_permalink       | string  | S3 link of company's logo with no expiry date
| company_twitter_url           | string  | URL to the company's Twitter profile                               |
| company_website_domain        | string  | Domain of the company's website                                    |
| company_website               | string  | Full URL of the company's website                                  |
| domains                       | array   | All known domains associated with the company                      |
| is_full_domain_match          | boolean | Boolean indicating if the domain perfectly matches the request     |

## Firmographics

| Field                             | Type     | Description                                                      |
|-----------------------------------|----------|------------------------------------------------------------------|
| hq_country                        | string   | Country where the company's headquarters is located              |
| headquarters                      | string   | Full address of the company headquarters                         |
| largest_headcount_country         | string   | Country with the highest employee count                          |
| hq_street_address                 | string   | Street address of company headquarters                           |
| year_founded                      | string   | Year the company was founded                                     |
| fiscal_year_end                   | string   | End of the company's fiscal year                                 |
| estimated_revenue_lower_bound_usd | integer  | Lower estimate of company's annual revenue in USD                |
| estimated_revenue_higher_bound_usd| integer  | Higher estimate of company's annual revenue in USD               |
| estimated_revenue_timeseries      | array    | Historic estimate revenue data over time                         |
| employee_count_range              | string   | Range indicating approximate number of employees (e.g. "201-500")|
| company_type                      | string   | Type of company (e.g. "Privately Held")                          |
| linkedin_company_description      | string   | Description from company's LinkedIn profile                      |
| acquisition_status                | string   | Status if the company has been acquired                          |
| ipo_date                          | string   | Date on which company went public                                |
| markets                           | array    | Markets in which the company operates (e.g., PRIVATE, NASDAQ)    |
| stock_symbols                     | array    | Stock ticker symbols for publicly traded companies               |
| ceo_location                      | string   | Location of the company's CEO                                    |
| all_office_addresses              | array    | List of all office locations/addresses for the company           |

## Taxonomy and Categories

| Field                               | Type   | Description                                                        |
|-------------------------------------|--------|-------------------------------------------------------------------|
| taxonomy.linkedin_specialities      | array  | List of specialties listed on LinkedIn                             |
| taxonomy.linkedin_industries        | array  | Industries in which the company operates according to LinkedIn     |
| taxonomy.crunchbase_categories      | array  | Categories assigned to the company on Crunchbase                   |
| taxonomy.primary_naics_detail       | object | Detailed information about the company's primary NAICS classification |
| taxonomy.primary_naics_detail.naics_code | string |  NAICS (North American Industry Classification System) code |
| taxonomy.primary_naics_detail.sector | string |  Broad sector classification under NAICS |
| taxonomy.primary_naics_detail.sub_sector | string |  Sub-sector classification under NAICS |
| taxonomy.primary_naics_detail.industry_group | string |  Industry group classification under NAICS |
| taxonomy.primary_naics_detail.industry | string |  Specific industry classification under NAICS |
| taxonomy.primary_naics_detail.year  | number |  Year of the NAICS classification |
| taxonomy.sic_detail_list            | array  | List of SIC (Standard Industrial Classification) codes and details |
| taxonomy.sic_detail_list[].sic_code | string | SIC code |
| taxonomy.sic_detail_list[].industry | string | Industry classification according to SIC |
| taxonomy.sic_detail_list[].year     | number | Year of the SIC classification |

## Competitors

| Field                                        | Type   | Description                                              |
|----------------------------------------------|--------|----------------------------------------------------------|
| competitors.competitor_website_domains       | array  | List of website domains of competing companies           |
| competitors.paid_seo_competitors_website_domains | array  | Domains competing for the same paid keywords         |
| competitors.organic_seo_competitors_website_domains | array  | Domains competing for the same organic keywords   |

## Headcount

| Field                                      | Type    | Description                                                |
|--------------------------------------------|---------|----------------------------------------------------------|
| headcount.linkedin_headcount               | integer | Total number of employees from LinkedIn                    |
| headcount.linkedin_headcount_total_growth_percent | object  | Growth percentages (mom, qoq, six_months, yoy)      |
| headcount.linkedin_headcount_total_growth_absolute | object  | Absolute growth figures (mom, qoq, six_months, yoy)|
| headcount.linkedin_headcount_by_role_absolute | object  | Employee counts broken down by role                     |
| headcount.linkedin_headcount_by_role_percent | object  | Percentage breakdown of employees by role                |
| headcount.linkedin_role_metrics            | object  | Categorization of roles by percentage ranges               |
| headcount.linkedin_headcount_by_role_six_months_growth_percent | object  | Six-month growth by role               |
| headcount.linkedin_headcount_by_role_yoy_growth_percent | object  | Year-over-year growth by role                 |
| headcount.linkedin_headcount_by_region_absolute | object  | Employee counts broken down by region                 |
| headcount.linkedin_headcount_by_region_percent | object  | Percentage breakdown of employees by region            |
| headcount.linkedin_region_metrics          | object  | Categorization of regions by percentage ranges             |
| headcount.linkedin_headcount_by_skill_absolute | object  | Employee counts broken down by skill                   |
| headcount.linkedin_headcount_by_skill_percent | object  | Percentage breakdown of employees by skill              |
| headcount.linkedin_skill_metrics           | object  | Categorization of skills by percentage ranges              |
| headcount.linkedin_headcount_timeseries    | array   | Historical headcount data over time                        |
| headcount.linkedin_headcount_by_function_timeseries | object  | Historical headcount by function over time        |

## Web Traffic

| Field                                        | Type     | Description                                                 |
|----------------------------------------------|----------|-------------------------------------------------------------|
| web_traffic.monthly_visitors*                 | ~~number~~ → integer  | Monthly visitors to the company website                     |
| web_traffic.monthly_visitor_mom_pct          | number   | Month-over-month percentage change in visitors              |
| web_traffic.monthly_visitor_qoq_pct          | number   | Quarter-over-quarter percentage change in visitors          |
| web_traffic.traffic_source_social_pct        | number   | Percentage of traffic from social media                     |
| web_traffic.traffic_source_search_pct        | number   | Percentage of traffic from search engines                   |
| web_traffic.traffic_source_direct_pct        | number   | Percentage of traffic from direct visits                    |
| web_traffic.traffic_source_paid_referral_pct | number   | Percentage of traffic from paid referrals                   |
| web_traffic.traffic_source_referral_pct      | number   | Percentage of traffic from organic referrals                |
| web_traffic.monthly_visitors_timeseries*      | array    | Historical data of monthly visitors (monthly_visitors field: ~~number~~ → integer)                         |

## Glassdoor

| Field                                      | Type     | Description                                               |
|--------------------------------------------|----------|-----------------------------------------------------------|
| glassdoor.glassdoor_overall_rating         | number   | Overall company rating on Glassdoor                       |
| glassdoor.glassdoor_ceo_approval_pct*       | ~~integer~~ → number   | Percentage of employees who approve of the CEO            |
| glassdoor.glassdoor_business_outlook_pct*   | ~~integer~~ → number   | Percentage with positive business outlook                 |
| glassdoor.glassdoor_review_count           | integer  | Number of reviews on Glassdoor                            |
| glassdoor.glassdoor_senior_management_rating | number   | Rating for senior management                            |
| glassdoor.glassdoor_compensation_rating    | number   | Rating for compensation and benefits                      |
| glassdoor.glassdoor_career_opportunities_rating | number   | Rating for career opportunities                      |
| glassdoor.glassdoor_culture_rating         | number   | Rating for company culture                                |
| glassdoor.glassdoor_diversity_rating       | number   | Rating for diversity                                      |
| glassdoor.glassdoor_work_life_balance_rating | number   | Rating for work-life balance                            |
| glassdoor.glassdoor_recommend_to_friend_pct* | ~~integer~~ → number   | Percentage who would recommend to a friend               |
| glassdoor.glassdoor_ceo_approval_growth_percent | object   | Growth percentages for CEO approval                  |
| glassdoor.glassdoor_review_count_growth_percent | object   | Growth percentages for review count                  |

## G2

| Field                      | Type     | Description                                               |
|----------------------------|----------|-----------------------------------------------------------|
| g2.g2_review_count         | integer  | Number of reviews on G2                                   |
| g2.g2_average_rating       | number   | Average rating on G2                                      |
| g2.g2_review_count_mom_pct | number   | Month-over-month percentage change in G2 reviews          |
| g2.g2_review_count_qoq_pct | number   | Quarter-over-quarter percentage change in G2 reviews      |
| g2.g2_review_count_yoy_pct | number   | Year-over-year percentage change in G2 reviews            |

## LinkedIn Followers

| Field                                                     | Type     | Description                                    |
|-----------------------------------------------------------|----------|------------------------------------------------|
| linkedin_followers.linkedin_followers                     | integer  | Total number of LinkedIn followers              |
| linkedin_followers.linkedin_follower_count_timeseries     | array    | Historical follower count data                  |
| linkedin_followers.linkedin_followers_mom_percent         | number   | Month-over-month percentage change in followers |
| linkedin_followers.linkedin_followers_qoq_percent         | number   | Quarter-over-quarter percentage change          |
| linkedin_followers.linkedin_followers_six_months_growth_percent | number   | Six-month growth percentage               |
| linkedin_followers.linkedin_followers_yoy_percent         | number   | Year-over-year percentage change in followers   |

## Funding and Investment

| Field                               | Type                     | Description                              | Schema                           |
| ----------------------------------- | ------------------------ | ---------------------------------------- | ------------------------------------- |
| funding_and_investment.crunchbase_total_investment_usd   | integer                  | Total investment amount in USD           | –                                     |
| funding_and_investment.days_since_last_fundraise         | integer                  | Days elapsed since latest round          | –                                     |
| funding_and_investment.last_funding_round_type           | string                   | Most recent funding-round type           | –                                     |
| funding_and_investment.crunchbase_investors_info_list    | array\<InvestorInfo>     | Detailed investors info                  | [InvestorInfo](#investorinfo)         |
| funding_and_investment.crunchbase_investors              | array                    | Flat list of investor names              | –                                     |
| funding_and_investment.last_funding_round_investment_usd | integer                  | Amount raised in latest round (USD)      | –                                     |
| funding_and_investment.funding_milestones_timeseries     | array\<FundingMilestone> | Historical funding milestones            | [FundingMilestone](#fundingmilestone) |
| funding_and_investment.acquisitions                      | array\<Acquisition>      | Companies **this** company acquired      | [Acquisition](#acquisition)           |
| funding_and_investment.acquired_by                       | array\<Acquisition>      | Companies that **acquired** this company | [Acquisition](#acquisition)           |

### Acquisition
| Field                     | Type           | Description                           |
| ------------------------- | -------------- | ------------------------------------- |
| acquirer_company_id     | integer        | Crustdata ID of the acquiring company |
| acquirer_company_name   | string         | Name of the acquirer                  |
| acquirer_crunchbase_url | string         | Acquirer’s Crunchbase URL             |
| acquiree_company_id     | integer        | Crustdata ID of the acquired company  |
| acquiree_company_name   | string         | Name of the acquiree                  |
| acquiree_crunchbase_url | string         | Acquiree’s Crunchbase URL             |
| announced_on_date       | string         | Announcement date                     |
| price_usd               | number         | Deal price (USD)                      |
| transaction_text        | string         | Free-text description                 |

### InvestorInfo
| Field        | Type   | Description                        |
| ------------ | ------ | ---------------------------------- |
| name       | string | Investor name                      |
| uuid       | string | Crunchbase UUID                    |
| type       | string | Investor type (eg: organization/person) |
| categories* | ~~string~~ → array | Array of investor categories (eg: accventure_capital,investment_bank,etc.)         |

### FundingMilestone

| Field                          | Type    | Description                              |
| ------------------------------ | ------- | ---------------------------------------- |
| funding_date                 | string  | Date of the funding round      |
| funding_milestone_amount_usd | integer | Amount raised (USD)                      |
| funding_round                | string  | Round type/name                          |
| funding_milestone_investors  | string  | Investor names in this round             |
| date                         | string  | Same date in alternate format  |

## Job Openings

| Field                                                        | Type     | Description                                        |
|--------------------------------------------------------------|----------|---------------------------------------------------|
| job_openings.recent_job_openings_title                       | string   | Title of recent job opening                        |
| job_openings.job_openings_count                              | integer  | Total count of current job openings                |
| job_openings.job_openings_count_growth_percent               | object   | Growth percentages for job openings                |
| job_openings.job_openings_by_function_qoq_pct                | object   | Quarter-over-quarter growth by function            |
| job_openings.job_openings_by_function_six_months_growth_pct  | object   | Six-month growth by function                       |
| job_openings.open_jobs_timeseries                            | array    | Historical job openings data                       |
| job_openings.recent_job_openings                             | array    | List of recent job openings with details           |

## SEO Metrics

| Field                                 | Type      | Description                                                   |
|---------------------------------------|-----------|---------------------------------------------------------------|
| seo.average_seo_organic_rank*          | ~~integer~~ → number    | Average rank in organic search results                        |
| seo.monthly_paid_clicks               | integer   | Monthly clicks from paid search                               |
| seo.monthly_organic_clicks            | integer   | Monthly clicks from organic search                            |
| seo.average_ad_rank*                   | ~~integer~~ → number    | Average position of ads                                       |
| seo.total_organic_results*             | ~~number~~ → integer    | Total number of keywords appearing in organic results         |
| seo.monthly_google_ads_budget         | number    | Estimated monthly Google Ads budget in USD                    |
| seo.monthly_organic_value*             | ~~integer~~ → number   | Estimated value of organic traffic in USD                     |
| seo.total_ads_purchased               | integer   | Total number of keywords advertised on                        |
| seo.lost_ranked_seo_keywords          | integer   | Number of keywords where ranking decreased                    |
| seo.gained_ranked_seo_keywords        | integer   | Number of keywords where ranking improved                     |
| seo.newly_ranked_seo_keywords         | integer   | Number of newly ranked keywords                               |

## Founders Information

| Field                                 | Type     | Description                                               |
|---------------------------------------|----------|-----------------------------------------------------------|
| founders.founders_locations           | array    | Locations of company founders                             |
| founders.founders_education_institute | string   | Educational institutions attended by founders             |
| founders.founders_degree_name         | string   | Degrees held by founders                                  |
| founders.founders_previous_companies  | array    | Previous companies where founders worked                  |
| founders.founders_previous_titles     | array    | Previous job titles held by founders                      |
| founders.profiles                     | array    | Detailed profiles of company founders                     |

### Founder Profile Details

Each object in `founders.profiles` contains:

| Field                                              | Type     | Description                                      |
|----------------------------------------------------|----------|--------------------------------------------------|
| founders.profiles[].linkedin_profile_url           | string   | LinkedIn profile URL (system format)             |
| founders.profiles[].linkedin_flagship_url          | string   | LinkedIn profile URL (human-readable format)     |
| founders.profiles[].name                           | string   | Full name of the founder                         |
| founders.profiles[].location                       | string   | Geographic location of the founder               |
| founders.profiles[].title                          | string   | Current job title                                |
| founders.profiles[].last_updated                   | string   | When the founder's data was last updated         |
| founders.profiles[].headline                       | string   | LinkedIn headline                                |
| founders.profiles[].summary                        | string   | Professional summary or bio                      |
| founders.profiles[].num_of_connections             | integer  | Number of LinkedIn connections                   |
| founders.profiles[].skills                         | array    | List of professional skills                      |
| founders.profiles[].profile_picture_url            | string   | URL to profile picture                           |
| founders.profiles[].twitter_handle                 | string   | Twitter username                                 |
| founders.profiles[].languages                      | array    | Languages spoken                                 |
| founders.profiles[].linkedin_open_to_cards         | object   | LinkedIn "open to" status information            |
| founders.profiles[].all_employers                  | array    | List of all companies the person has worked for |
| founders.profiles[].past_employers                 | array    | List of previous employers                       |
| founders.profiles[].all_employers_company_id       | array    | Company IDs corresponding to all employers       |
| founders.profiles[].all_titles                     | array    | List of all job titles held                      |
| founders.profiles[].all_schools                    | array    | List of educational institutions attended        |
| founders.profiles[].all_degrees                    | array    | List of degrees earned                           |
| founders.profiles[].current_employers              | array    | List of current employment details               |
| founders.profiles[].education_background           | array    | List of education entries                        |
| founders.profiles[].certifications                 | array    | Professional certifications                      |
| founders.profiles[].honors                         | array    | Awards and honors received                       |

## CXOs (C-Level Executives)

Information about C-level executives and senior leadership of the company.

| Field                               | Type     | Description                                                |
|-------------------------------------|----------|-----------------------------------------------------------|
| cxos                                | array    | Array of CXO-level executives at the company              |
| cxos[].linkedin_profile_url         | string   | LinkedIn profile URL (system format)                       |
| cxos[].linkedin_flagship_url        | string   | LinkedIn profile URL (human-readable format)               |
| cxos[].name                         | string   | Full name of the executive                                 |
| cxos[].location                     | string   | Geographic location of the executive                       |
| cxos[].title                        | string   | Current job title (e.g., CEO, CTO, CFO, etc.)            |
| cxos[].last_updated                 | string   | When the executive's data was last updated                 |
| cxos[].headline                     | string   | LinkedIn headline                                          |
| cxos[].summary                      | string   | Professional summary or bio                                |
| cxos[].num_of_connections           | integer  | Number of LinkedIn connections                             |
| cxos[].skills                       | array    | List of professional skills                                |
| cxos[].profile_picture_url          | string   | URL to profile picture                                     |
| cxos[].twitter_handle               | string   | Twitter username                                           |
| cxos[].languages                    | array    | Languages spoken                                           |
| cxos[].linkedin_open_to_cards       | object   | LinkedIn "open to" status information                      |
| cxos[].all_employers                | array    | List of all companies the person has worked for           |
| cxos[].past_employers               | array    | List of previous employers                                 |
| cxos[].all_employers_company_id     | array    | Company IDs corresponding to all employers                 |
| cxos[].all_titles                   | array    | List of all job titles held                                |
| cxos[].all_schools                  | array    | List of educational institutions attended                  |
| cxos[].all_degrees                  | array    | List of degrees earned                                     |
| cxos[].current_employers            | array    | List of current employment details                         |
| cxos[].education_background         | array    | List of education entries                                  |
| cxos[].certifications               | array    | Professional certifications                                |
| cxos[].honors                       | array    | Awards and honors received                                 |

## News Articles

| Field                        | Type     | Description                                         |
|------------------------------|----------|-----------------------------------------------------|
| news_articles                | array    | Array of recent news articles about the company     |
| news_articles[].article_url    | string   | URL of the news article                             |
| news_articles[].article_publisher_name | string   | Name of the publishing source                |
| news_articles[].article_title  | string   | Title of the news article                           |
| news_articles[].article_publish_date | string   | Publication date of the article               |

## Product Hunt

| Field                                | Type     | Description                                            |
|--------------------------------------|----------|--------------------------------------------------------|
| producthunt.slug                     | string   | Product Hunt slug/identifier                           |
| producthunt.company_name             | string   | Company name as listed on Product Hunt                 |
| producthunt.company_website_url      | string   | URL to the company's website                           |
| producthunt.angel_list_url           | string   | URL to the company's AngelList profile                 |
| producthunt.facebook_url             | string   | URL to the company's Facebook page                     |
| producthunt.instagram_url            | string   | URL to the company's Instagram profile                 |
| producthunt.github_url               | string   | URL to the company's GitHub profile                    |
| producthunt.twitter_url              | string   | URL to the company's Twitter profile                   |
| producthunt.threads_url              | string   | URL to the company's Threads profile                   |
| producthunt.linkedin_url             | string   | URL to the company's LinkedIn profile                  |
| producthunt.producthunt_url          | string   | URL to the company's Product Hunt page                 |
| producthunt.description              | string   | Description of the product                             |
| producthunt.rating                   | number   | Average rating on Product Hunt                         |
| producthunt.num_upvotes              | integer  | Total number of upvotes received                       |
| producthunt.num_reviews              | integer  | Total number of reviews received                       |
| producthunt.num_followers            | integer  | Total number of followers on Product Hunt              |
| producthunt.last_updated             | string   | Date and time when the data was last updated           |
| producthunt.categories               | array    | List of categories the product belongs to              |

### Product Hunt Makers

| Field                                | Type     | Description                                            |
|--------------------------------------|----------|--------------------------------------------------------|
| producthunt.makers                   | array    | Array of makers/creators of the product                |
| producthunt.makers[].username        | string   | Username of the maker on Product Hunt                  |
| producthunt.makers[].name            | string   | Full name of the maker                                 |
| producthunt.makers[].headline        | string   | Headline/short bio of the maker                        |
| producthunt.makers[].about           | string   | Detailed information about the maker                   |
| producthunt.makers[].num_badges      | integer  | Number of badges earned by the maker                   |
| producthunt.makers[].num_votes       | integer  | Number of votes received by the maker                  |
| producthunt.makers[].website_urls    | array    | List of website URLs associated with the maker         |
| producthunt.makers[].last_updated    | string   | When the maker's information was last updated          |

### Product Hunt Launches

| Field                                     | Type      | Description                                         |
|-------------------------------------------|-----------|-----------------------------------------------------|
| producthunt.launches                      | array     | Array of product launches on Product Hunt           |
| producthunt.launches[].launch_id          | string    | Unique identifier for the launch                    |
| producthunt.launches[].slug               | string    | URL-friendly name of the launch                     |
| producthunt.launches[].name               | string    | Name of the product launched                        |
| producthunt.launches[].tagline            | string    | Short description/tagline of the launch             |
| producthunt.launches[].description        | string    | Detailed description of the launch                  |
| producthunt.launches[].launched_at        | string    | Date and time when the product was launched         |
| producthunt.launches[].num_upvotes        | integer   | Number of upvotes received for the launch           |
| producthunt.launches[].num_comments       | integer   | Number of comments on the launch                    |
| producthunt.launches[].day_rank           | integer   | Ranking of the launch for the day                   |
| producthunt.launches[].week_rank          | integer   | Ranking of the launch for the week                  |
| producthunt.launches[].month_rank         | integer   | Ranking of the launch for the month                 |
| producthunt.launches[].year_rank          | integer   | Ranking of the launch for the year                  |
| producthunt.launches[].golden_kitty_award | boolean   | Whether the launch received a Golden Kitty Award    |
| producthunt.launches[].last_updated       | string    | When the launch information was last updated        |

## Decision Makers

Information about key decision makers and leadership team members of the company.

| Field                                | Type     | Description                                            |
|--------------------------------------|----------|--------------------------------------------------------|
| decision_makers                      | array    | Array of key decision makers at the company            |
| decision_makers[].linkedin_profile_url | string   | LinkedIn profile URL (system format)                |
| decision_makers[].linkedin_flagship_url | string   | LinkedIn profile URL (human-readable format)       |
| decision_makers[].name               | string   | Full name of the decision maker                        |
| decision_makers[].location           | string   | Geographic location of the decision maker              |
| decision_makers[].title              | string   | Current job title                                      |
| decision_makers[].last_updated       | string   | When the decision maker's data was last updated        |
| decision_makers[].headline           | string   | LinkedIn headline                                      |
| decision_makers[].summary            | string   | Professional summary or bio                            |
| decision_makers[].num_of_connections | integer  | Number of LinkedIn connections                         |
| decision_makers[].skills             | array    | List of professional skills                            |
| decision_makers[].profile_picture_url | string   | URL to profile picture                                |
| decision_makers[].twitter_handle     | string   | Twitter username                                       |
| decision_makers[].languages          | array    | Languages spoken                                       |
| decision_makers[].linkedin_open_to_cards | object   | LinkedIn "open to" status information              |
| decision_makers[].all_employers      | array    | List of all companies the person has worked for        |
| decision_makers[].past_employers     | array    | List of previous employers                             |
| decision_makers[].all_employers_company_id | array    | Company IDs corresponding to all employers       |
| decision_makers[].all_titles         | array    | List of all job titles held                            |
| decision_makers[].all_schools        | array    | List of educational institutions attended              |
| decision_makers[].all_degrees        | array    | List of degrees earned                                 |

### Current Employment Details

| Field                                                    | Type     | Description                                        |
|----------------------------------------------------------|----------|----------------------------------------------------|
| decision_makers[].current_employers                      | array    | List of current employers                          |
| decision_makers[].current_employers[].employer_name      | string   | Name of the employer                               |
| decision_makers[].current_employers[].employer_linkedin_id | string   | LinkedIn ID of the employer                      |
| decision_makers[].current_employers[].employer_logo_url  | string   | URL to employer's logo                             |
| decision_makers[].current_employers[].employer_linkedin_description | string   | Employer's LinkedIn description         |
| decision_makers[].current_employers[].employer_company_id | array    | Company IDs associated with the employer          |
| decision_makers[].current_employers[].employer_company_website_domain | array    | Website domains of the employer        |
| decision_makers[].current_employers[].employee_position_id | integer  | Unique ID for the position                       |
| decision_makers[].current_employers[].employee_title     | string   | Job title at the employer                          |
| decision_makers[].current_employers[].employee_description | string   | Job description                                  |
| decision_makers[].current_employers[].employee_location  | string   | Job location                                       |
| decision_makers[].current_employers[].start_date         | string   | Start date of employment                           |
| decision_makers[].current_employers[].end_date           | string   | End date of employment (null if current)           |

### Education Background

| Field                                                          | Type     | Description                                      |
|----------------------------------------------------------------|----------|--------------------------------------------------|
| decision_makers[].education_background                         | array    | List of education entries                         |
| decision_makers[].education_background[].degree_name           | string   | Name of degree earned                             |
| decision_makers[].education_background[].institute_name        | string   | Name of educational institution                   |
| decision_makers[].education_background[].institute_linkedin_id | string   | LinkedIn ID of the institution                    |
| decision_makers[].education_background[].institute_linkedin_url | string   | LinkedIn URL of the institution                   |
| decision_makers[].education_background[].institute_logo_url    | string   | URL to institution's logo                         |
| decision_makers[].education_background[].field_of_study        | string   | Major or specialization                           |
| decision_makers[].education_background[].activities_and_societies | string   | Extracurricular activities                     |
| decision_makers[].education_background[].start_date            | string   | Start date of education                           |
| decision_makers[].education_background[].end_date              | string   | End date of education                             |
| decision_makers[].certifications                               | array    | Professional certifications                       |
| decision_makers[].honors                                       | array    | Awards and honors received                        |

## Gartner

Information about the company from Gartner, including company details and product reviews.

| Field                      | Type     | Description                                               |
|----------------------------|----------|-----------------------------------------------------------|
| gartner.slug               | string   | Gartner identifier for the company                        |
| gartner.company_name       | string   | Company name as listed in Gartner                         |
| gartner.company_website_url| string   | Company website URL registered with Gartner               |
| gartner.description        | string   | Company description from Gartner                          |
| gartner.year_founded       | string   | Year the company was founded according to Gartner         |
| gartner.head_office_city   | string   | City where company headquarters is located                |
| gartner.head_office_country| string   | Country where company headquarters is located             |
| gartner.num_employees_min  | integer  | Minimum number of employees according to Gartner          |
| gartner.num_employees_max  | integer  | Maximum number of employees according to Gartner          |
| gartner.products           | array    | List of company products tracked by Gartner               |
| gartner.reviews            | array    | List of product reviews from Gartner                      |