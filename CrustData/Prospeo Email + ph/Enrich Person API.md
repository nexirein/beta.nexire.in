Enrich Person API
Enrich a person
This endpoint allows you to enrich a person with its complete accurate B2B profile data, email address and mobile.

Important note: When possible, it is recommended to use our Bulk Enrich Person endpoint instead for faster response time. It allows you to enrich up to 50 persons at once, instead of performing 50 individual requests.

How are credits spent?
Enriching a person record cost 1 credit per match (person data + company data + email).
Enriching a person record with a mobile cost 10 credits per match (person data + company data + email + mobile). The email is included for free.
You can control when you spend credits: only for verified email, only for record with a mobile, etc…
You won’t be charged if no results are found.
You won’t be charged if you enrich the same record twice in the lifetime of your account.
Endpoint
URL: https://api.prospeo.io/enrich-person 
Method: POST
Headers:
X-KEY: your_api_key
Content-Type: application/json
Parameters
Parameter	Example value	Description
only_verified_email
optional	true	Chose if you only want records with a verified email to be returned. Default is false.
enrich_mobile
optional	true	Chose if you want to enrich the mobile (if it exists).
only_verified_mobile
optional	true	Chose if you only want records with a mobile to be returned. Default is false. If true, enrich_mobile will automatically be true.
data
required	See below	The person to enrich. See below for complete details.
Data parameter
The data parameter contains the datapoints you have for us to identify the person. We offer the following matching datapoints:

Datapoint	Example value	Description
first_name
optional	Roger	The first name of the person
last_name
optional	Sterling	The last name of the person
full_name
optional	Roger Sterling	The full name of the person
linkedin_url
optional	https://www.linkedin.com/in/roger-sterling	The person’s public LinkedIn URL
email
optional	roger.sterling@deloitte.com	The work email of the person
company_name
optional	Deloitte	The company name
company_website
optional	deloitte.com	The company website
company_linkedin_url
optional	https://linkedin.com/company/deloitte	The company’s public LinkedIn URL
person_id
optional	6f745841665155f554e5f	If enriching from search: the ID of the person from the Search Person API endpoint
Minimum requirements for matching
We require at a minimum the below datapoints together in one request (allowing us to accurately identify the person):

first_name + last_name + any of (company_name/company_website/company_linkedin_url)
full_name + any of (company_name/company_website/company_linkedin_url)
linkedin_url
email
person_id (enrich from Search Person API)
Important note #1: We advise strongly against using only the company_name for matching. Many company have the same name, and this can result in mismatch/inaccurate results. Whenever possible, try to use at least the company_website.

Important note #2: the more datapoints you submit, the better, so whenever possible, submit everything you have for greater accuracy. For example, it is better to submit company_website and company_name together rather than just one of them.

Enrich records from our search API
Another way to enrich records is to use the person_id you get from the search results (Search Person API) to this endpoint. This will identify the person and enrich as per your option (only_verified_email, only_verified_mobile, enrich_mobile).

Example requests
Simple request that always returns a result if a person is matched but does not reveal the mobile (use enrich_mobile:true).

In this example, we used the first_name + last_name to identify the person, and submitted all the company datapoints possible for better accuracy. This request will perform better than a request with only the company_name.

 
POST "https://api.prospeo.io/enrich-person"
X-KEY: "your_api_key"
Content-Type: "application/json"
 
{
   "data": {
       "first_name": "Eva",
       "last_name": "Kiegler",
       "company_name": "Intercom",
       "company_website": "intercom.com",
       "company_linkedin_url": "https://www.linkedin.com/company/intercom"
   }
}
Response
This response contains all the possible fields and their example value. When a field is unavailable, it will be null.

Each response contains an person and company object. The company object contains the detail of the current company the lead work at. If the lead has no current job, this field can be null.

You can find the details of every person field here.
You can find the details of every company field here.
For error handling, see the error codes at the bottom of the page here.

{
    "error": false,
    "free_enrichment": false,
    "person": {
        "person_id": "aaaacd817619fba3d254cd64",
        "first_name": "Eoghan",
        "last_name": "Mccabe",
        "full_name": "Eoghan Mccabe",
        "linkedin_url": "https://www.linkedin.com/in/eoghanmccabe",
        "current_job_title": "CEO, chairman, and co-founder",
        "current_job_key": null,
        "headline": "CEO and founder at Intercom, building Fin.ai",
        "linkedin_member_id": null,
        "last_job_change_detected_at": null,
        "job_history": [
            {
                "title": "CEO, chairman, and co-founder",
                "company_name": "Intercom",
                "logo_url": "9ded0364-c88a-4789-9d39-2a15ed239edb.jpg",
                "current": true,
                "start_year": 2022,
                "start_month": 10,
                "end_year": null,
                "end_month": null,
                "duration_in_months": 39,
                "departments": [
                    "Founder",
                    "Chief Executive"
                ],
                "seniority": "C-Suite",
                "company_id": "cccc7c7da6116a8830a07100",
                "job_key": "82981650"
            },
            {
                "title": "Chairman and co-founder",
                "company_name": "Intercom",
                "logo_url": "9ded0364-c88a-4789-9d39-2a15ed239edb.jpg",
                "current": false,
                "start_year": 2020,
                "start_month": 7,
                "end_year": 2022,
                "end_month": 10,
                "duration_in_months": 27,
                "departments": [
                    "Founder"
                ],
                "seniority": "Founder/Owner",
                "company_id": "cccc7c7da6116a8830a07100",
                "job_key": "23054356"
            },
            {
                "title": "CEO and co-founder",
                "company_name": "Intercom",
                "logo_url": "9ded0364-c88a-4789-9d39-2a15ed239edb.jpg",
                "current": false,
                "start_year": 2011,
                "start_month": 8,
                "end_year": 2020,
                "end_month": 7,
                "duration_in_months": 107,
                "departments": [
                    "Founder",
                    "Chief Executive"
                ],
                "seniority": "C-Suite",
                "company_id": "cccc7c7da6116a8830a07100",
                "job_key": "68686694"
            },
            {
                "title": "CEO",
                "company_name": "Exceptional",
                "logo_url": "2588d75e-d2e7-4fb1-bf31-35cafd119ec0.jpg",
                "current": false,
                "start_year": 2008,
                "start_month": 10,
                "end_year": 2011,
                "end_month": 7,
                "duration_in_months": 33,
                "departments": [
                    "Chief Executive"
                ],
                "seniority": "C-Suite",
                "company_id": "ccccd431f3dfa7e88993bb18",
                "job_key": "80900834"
            },
            {
                "title": "CEO",
                "company_name": "Contrast",
                "logo_url": "d4bbee3f-7128-436d-a474-fcac68b989e4.jpg",
                "current": false,
                "start_year": 2007,
                "start_month": 12,
                "end_year": 2011,
                "end_month": 7,
                "duration_in_months": 43,
                "departments": [
                    "Chief Executive"
                ],
                "seniority": "C-Suite",
                "company_id": "ccccf3e7f023592ee266a9d8",
                "job_key": "72014547"
            }
        ],
        "mobile": {
            "status": "VERIFIED",
            "revealed": false,
            "mobile": "+1 415-3**-****",
            "mobile_national": "(415) 3**-****",
            "mobile_international": "+1 415-3**-****",
            "mobile_country": "United States",
            "mobile_country_code": "US"
        },
        "email": {
            "status": "VERIFIED",
            "revealed": true,
            "email": "eoghan.*****@intercom.com",
            "verification_method": "BOUNCEBAN",
            "email_mx_provider": "Google"
        },
        "location": {
            "country": "United States",
            "country_code": "US",
            "state": "California",
            "city": "San Francisco",
            "time_zone": "America/Los_Angeles",
            "time_zone_offset": -7.0
        },
        "skills": []
    },
	"company": {
		"company_id": "cccc7c7da6116a8830a07100",
		"name": "Intercom",
		"website": "https://intercom.com",
		"domain": "intercom.io",
		"other_websites": [],
		"description": "Intercom is the only complete AI-first customer service platform, enhancing the customer experience, improving operational efficiency, and scaling with your business every step of the way. \n\nOur AI-first platform is built on a single AI system, with two major components that will allow you to deliver the remarkable customer service you’ve spent decades striving for:\n\nFin AI Agent: The human-quality AI agent that works with any Helpdesk\n\nIntercom Customer Service Platform: The AI-first platform trusted by thousands of support leaders.  \n\nFounded in 2011 and backed by leading venture capitalists, including Kleiner Perkins, Bessemer Venture Partners and Social Capital, Intercom believes there's a new way to do customer service.",
		"description_seo": "Intercom is the complete AI-first customer service solution, giving exceptional experiences for support teams with AI agent, AI copilot, tickets, phone & more",
		"description_ai": "Intercom is an AI-first customer service solution that provides exceptional experiences for support teams with AI agent, AI copilot, tickets, phone, and more.",
		"type": "Private",
		"industry": "Software Development",
		"employee_count": 1822,
		"employee_count_on_prospeo": 437,
		"employee_range": "1001-2000",
		"location": {
			"country": "United States",
			"country_code": "US",
			"state": "California",
			"city": "San Francisco",
			"raw_address": "55 2nd Street, 4th Floor, San Francisco, California 94105, US"
		},
		"sic_codes": [
			"737"
		],
		"naics_codes": [],
		"email_tech": {
			"domain": "intercom.io",
			"mx_provider": "Google"
		},
		"linkedin_url": "https://www.linkedin.com/company/intercom",
		"twitter_url": "https://x.com/intercom",
		"facebook_url": "https://www.facebook.com/intercominc",
		"crunchbase_url": "https://www.crunchbase.com/organization/intercom",
		"instagram_url": "https://www.instagram.com/intercom",
		"youtube_url": "https://www.youtube.com/c/@intercominc",
		"phone_hq": {
			"phone_hq": "+14156733820",
			"phone_hq_national": "(415) 673-3820",
			"phone_hq_international": "+14156733820",
			"phone_hq_country": "United States",
			"phone_hq_country_code": "US"
		},
		"linkedin_id": null,
		"founded": 2011,
		"revenue_range": {
			"min": 100000000,
			"max": 250000000
		},
		"revenue_range_printed": "100M",
		"keywords": [
			"Customer Support",
			"Live Chat",
			"Marketing Automation",
			"Customer Relationship Management",
			"Customer Experience",
			"Customer Engagement",
			"Customer Service",
			"Mobile",
			"Customer Feedback",
			"AI",
			"Helpdesk",
			"CX",
			"Chat Bots",
			"Customer Communication",
			"Support Automation",
			"Shared Inbox"
		],
		"logo_url": "https://prospeo-static-assets.s3.us-east-1.amazonaws.com/company_logo/9ded0364-c88a-4789-9d39-2a15ed239edb.jpg",
		"attributes": {
			"is_b2b": true,
			"has_demo": false,
			"has_free_trial": true,
			"has_downloadable": false,
			"has_mobile_apps": false,
			"has_online_reviews": true,
			"has_pricing": true
		},
		"funding": {
			"count": 2,
			"total_funding": 125000000,
			"total_funding_printed": "$125.0M",
			"latest_funding_date": "2021-01-01T00:00:00",
			"latest_funding_stage": "Series unknown",
			"funding_events": [
				{
					"amount": null,
					"amount_printed": null,
					"raised_at": "2021-01-01T00:00:00",
					"stage": "Series unknown",
					"link": "https://www.crunchbase.com/funding_round/intercom-series-unknown--6ce20dfb"
				},
				{
					"amount": 125000000,
					"amount_printed": "$125,000,000",
					"raised_at": "2018-04-27T00:00:00",
					"stage": "Series D",
					"link": "https://www.crunchbase.com/funding_round/intercom-series-d--15490ce6"
				}
			]
		},
		"technology": {
			"count": 43,
			"technology_names": [
				"6sense",
				"theTradeDesk",
				"Amazon SES",
				"Contentful",
				"Node.js",
				"Tailwind CSS"
			],
			"technology_list": [
				{
					"name": "6sense",
					"category": "Marketing automation"
				},
				{
					"name": "theTradeDesk",
					"category": "Advertising"
				},
				{
					"name": "Amazon SES",
					"category": "Email"
				},
				{
					"name": "Contentful",
					"category": "CMS"
				}
			]
		},
		"job_postings": {
			"active_count": 3,
			"active_titles": [
				"account executive, senior midmarket",
				"senior product engineer",
				"senior recruiting coordinator"
			]
		}
	}
}
Response details
Property	Type	Description
error	boolean	Indicates if an error has occurred. If false, the request was successful. If true, an error has occurred and a error_code property will be present. See below.
free_enrichment	boolean	Indicates whether you were charged. This will be true if you enriched the record in the past. If you enriched the record in the past, but chose to enrich the mobile this time (with enrich_mobile), it will be false.
person	object	The person that was matched. See our up-to-date person fields in details here.
company	object	The current company of the person that was matched. See our up-to-date company fields in details here.
Error codes
HTTP code	error_code property	Meaning
400	NO_MATCH	We couldn’t match the data you provided with a person record. This will also be returned if you used only_verified_email, but the lead didn’t have a verified email, or if you used only_verified_mobile, but the lead didn’t have a mobile.
400	INVALID_DATAPOINTS	The datapoints you submitted to identify the person are meeting the minimum requirements for matching. See this section.
400	INSUFFICIENT_CREDITS	You do not have enough credit to perform the request.
401	INVALID_API_KEY	Invalid API key, check your X-KEY header.
429	RATE_LIMITED	You hit the rate limit for your current plan.
400	INVALID_REQUEST	The request your submitted is invalid.
400	INTERNAL_ERROR	An error occurred on our side, please contact the support.
Rate limit
See our rate limits page.