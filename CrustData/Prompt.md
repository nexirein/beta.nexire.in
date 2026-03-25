What we need to display in very good way in the results section on each profile , or whatever backend things that needs to be handled you design that accordingly , and whatever fields in the “People Discovery API (/screener/persondb/search endpoint” provides should be stored in our master people data every field we are getting we should store it in our database each and every field in the whole response that returned , and in our platform that below things we will display and interact with 
Note: 
“1. Company / Employer Logo Handling
Crustdata does NOT provide company logo URLs, so we rely entirely on Logo.dev.
If company domain is available from Crustdata:
Directly fetch logo using:
https://img.logo.dev/{company_website}?token=LOGO_DEV_PUBLISHABLE_KEY
👉 Example:
https://img.logo.dev/gonoise.com?token=pk_JgbzA-I-Ssu_JN0iUMq1rQ
🔁 Fallback (when domain is missing)
If company domain is NOT available, then:
Take company_website
Call Logo.dev Brand Search API:
src="https://img.logo.dev/nike.com?token=LOGO_DEV_PUBLISHABLE_KEY"
curl --header "Authorization: Bearer LOGO_DEV_PUBLISHABLE_KEY" \
"https://api.logo.dev/search?q={company_name}&strategy=match"
Extract best match:
{
  "name": "Company Name",
  "domain": "companydomain.com"
}
Fetch logo using extracted domain:
https://img.logo.dev/companydomain.com?token=pk_JgbzA-I-Ssu_JN0iUMq1rQ
✅ Final Flow (Company)
company_domain → Logo.dev image API → logo  
ELSE  
company_name → Logo.dev search → domain → Logo.dev image API → logo

2. Education / Institute Logo Handling
Crustdata sometimes provides institute_logo_url, but it may be missing or empty.
✅ Primary Case
If institute_logo_url exists:
Use it directly
🔁 Fallback (when logo URL is missing)
If institute_logo_url is NOT available:
Take institute_name
Call Logo.dev Brand Search API:
curl --header "Authorization: Bearer LOGO_DEV_PUBLISHABLE_KEY" \
"https://api.logo.dev/search?q={institute_name}&strategy=match"
Extract domain:
{
  "name": "Institute Name",
  "domain": "institute.edu"
}
Fetch logo:
https://img.logo.dev/institute.edu?token=pk_JgbzA-I-Ssu_JN0iUMq1rQ
✅ Final Flow (Education)
institute_logo_url → use directly  
ELSE  
institute_name → Logo.dev search → domain → Logo.dev image API → logo
⚠️ Important Notes
Crustdata:
❌ Does NOT provide company logos
✅ Sometimes provides institute logos
Always:
Clean names before search (remove commas, city names)
Use strategy=match for accurate results
Pick top result (data[0])
Cache domains to reduce API cost
🚀 Final Unified Logic
IF domain exists → use Logo.dev image API  
ELSE → search name → get domain → fetch logo”


Structure , Field | Type | Description | Example
 name | string | Full name of the person | "Jane Smith"  
linkedin_profile_url	string	LinkedIn profile URL	"https://www.linkedin.com/in/ACoAABLXvswB8M5uj4-GKj_LUdJEarR9lC5ohFo"
flagship_profile_url	string	LinkedIn flagship profile URL	"https://www.linkedin.com/in/janesmith" both this 2 & 3 have to design such a way when the user wanted to see the contact details could be mail, personal mail, ph then first on the flagship profileurl  link the request would be send and it fetches display otherwise try with linkedin profile url also if not then only not found you can display 
region	string	Current location/region	"San Francisco Bay Area"
region_address_components	array of strings	Address hierarchy components (city, state, country)	["San Francisco Bay Area", "California", "United States"]
summary	string	Profile summary/about section	"Experienced leader in..." > It will help us to to provide more meaningful “ai insight” to that profile, but some profiles maybe large bio would present so that we display two lines and hides it view more to see the whole in very clean way 
twitter_handle	string	Twitter/X username (if available)	"janesmith" this is the important thing also if available display beside the linkedin icon the x.com also icon inserting the link
profile_picture_url	string	URL to profile picture	"https://media.licdn.com/dms/image/v2/D5603AQH..." the results in the list all the profile pictures should be shown and when going through individual profile then also each of the profile modal the profile picture should be visible /displayed and if this throuhgs invalid link then request this “profile_picture_permalink	string	Permanent URL to profile picture	"https://crustdata-media.s3.us-east-2.amazonaws.com/person/..." and showcase the picture 
open_to_cards	array	Open To Cards information	[] , this will provide we as nexire unique fields open to work or not with the fields they are comfortable to work we can also anyhow in the profile list we can showcase , or in the image like a dot we can display means a green dot if they open to work , and hovering over the profile picture in the list or by clicking individual view of profile another modal would show where they open to “where” we can see
years_of_experience_raw	number	Raw years of experience value	12
skills	array of strings	List of professional skills	["Python", "Machine Learning", "Leadership"]
languages	array of strings	Languages spoken	["English (Native or bilingual proficiency)", "Telugu (Native or bilingual proficiency)"]
current_employers	array of objects	Current employment details	See Current Employer Object,( in the list of result this would be shown )
past_employers	array of objects	Past employment details	See Past Employer Object
all_employers	array of objects	All employment history	Combined current and past employers, (this would include in the full profile when user click a single profile and modal right side pops up with all the details , for reference below i have attached a json of person parameters that would returned from crustdata, now the main point is whatever the best way to display with minimum latency architect them that way like in the list we only provide the current employers right for reference take a look to the image attached but dont copy exactly cause i have my own brand identity so we can make the ui and ux on the result list as well as when clicked a particular profile)
education_background	array of objects	Educational background	See Education Object
certifications	array of objects	Professional certifications	See Certification Object
honors	array of objects	Honors and awards	See Honor Object
region_address_components	array of strings	Address hierarchy components (city, state, country)	["San Francisco Bay Area", "California", "United States"](by this we could better filter out the candidates that comes to the 100 )
Location Details Object
Field
Type
Description
Example
city
string
City name
"New York"
state
string
State/province name
"New York"
country
string
Country name
"United States"
continent
string
Continent name
"North America"

Current Employer Object
Field
Type
Description
Example
name
string
Company name
"PlugXR"
linkedin_id
string
Company LinkedIn ID
"14455520"
company_id
number
Internal company ID
8998
company_linkedin_id
string
Company LinkedIn ID (duplicate of linkedin_id)
"14455520"
company_website_domain
string
Company website domain
"plugxr.com"
position_id
string
Position identifier
"1391672653"
title
string
Job title
"Founder & CEO"
description
string
Job description
"Leading engineering teams..."
location
string
Job location
"Hyderabad, Telangana, India"
start_date
string
Position start date (ISO format)
"2017-02-01T00:00:00"
end_date
string
Position end date (null for current)
null
employer_is_default
boolean
Whether this is the default/primary employer
true
seniority_level
string
Seniority level at company
"CXO"
function_category
string
Job function category
""
years_at_company
string
Years at company (categorical)
"6 to 10 years"
years_at_company_raw
number
Years at current company
8
company_headquarters_country
string
Company HQ country (ISO 3-alpha format)
"USA"
company_hq_location
string
Company headquarters location
"San Jose, California, United States"
company_hq_location_address_components
array of strings
HQ address hierarchy components
["San Jose", "Santa Clara County", "California", "United States"]
company_headcount_range
string
Employee count range
"11-50"
company_headcount_latest
number
Latest headcount number
41
company_industries
array of strings
Company industries
["Software Development", "Technology, Information and Internet", "Technology, Information and Media"]
company_linkedin_industry
string
Primary LinkedIn industry
"Software Development"
company_type
string
Type of company
"Privately Held"
company_website
string
Full company website URL
"https://www.plugxr.com/"
company_linkedin_profile_url
string
Company LinkedIn profile URL
"https://www.linkedin.com/company/plugxr"
business_email_verified
boolean
Whether business email is verified. Filterable: use {"column": "current_employers.business_email_verified", "type": "=", "value": true} to find profiles with verified emails
true

Past Employer Object
Objects within the past_employers array field of the Person Object. Similar structure to Current Employer Object, but represents previous employment.
Education Object
Field
Type
Description
Example
degree_name
string
Name of degree earned
"Master of Science"
field_of_study
string
Field or major of study
"Computer Science"
institute_name
string
Educational institution name
"Stanford University"
institute_linkedin_id
string
Institution LinkedIn ID
"18104"
institute_linkedin_url
string
Institution LinkedIn URL
"https://linkedin.com/school/stanford-university"
institute_logo_url
string
Institution logo URL
"https://media.licdn.com/..."
start_date
string
Education start date (ISO format)
"2008-09-01T00:00:00+00:00"
end_date
string
Education end date (ISO format)
"2010-06-01T00:00:00+00:00"
activities_and_societies
string
Extracurricular activities
"Computer Science Society, Debate Team"

Certification Object
Field
Type
Description
Example
name
string
Certification name
"AWS Solutions Architect"
issued_date
string
Issue date (ISO format)
"2023-05-15T00:00:00+00:00"
expiration_date
string
Expiration date (ISO format)
"2026-05-15T00:00:00+00:00"
url
string
Certification URL/link
"https://aws.amazon.com/..."
issuer_organization
string
Issuing organization
"Amazon Web Services"
issuer_organization_linkedin_id
string
Issuer LinkedIn ID
"2382910"
certification_id
string
Certification identifier
"AWS-SAA-C03-123456"

Honor Object
Field
Type
Description
Example
title
string
Honor/award title
"Employee of the Year"
issued_date
string
Date issued (ISO format)
"2023-12-01T00:00:00+00:00"
description
string
Honor description
"Recognized for outstanding leadership..."
issuer
string
Issuing organization
"TechCorp Inc."
media_urls
array of strings
Associated media URLs
["https://example.com/award-photo.jpg"]
associated_organization_linkedin_id
string
Organization LinkedIn ID
"123456"
associated_organization
string
Associated organization name
"TechCorp Inc."

Pagination Response
Field
Type
Description
Example
profiles
array
Array of person objects
See above
next_cursor
string
Cursor for next page (null if last page)
"eJx1jjEOwjAMRe..."
total_count
number
Total number of results matching filters
1155003

Filter Field Types
When building filters, fields support different data types:
Data Type
Supported Operators
Example Fields
String
=, !=, in, not_in, (.)
name, title, company_name
Number
=, !=, >, <, =>, =<, in, not_in
years_of_experience_raw, num_of_connections
Date
=, !=, >, <, =>, =<
start_date, end_date, issued_date
Boolean
=, !=
recently_changed_jobs
Array
=, !=, in, not_in, (.)
skills, languages, company_industries

For detailed filtering examples and usage, refer to the People Discovery API documentation.


"{
            "person_id": 967,
            "name": "Tejal Polekar",
            "first_name": "Tejal",
            "last_name": "Polekar",
            "region": "Mumbai, Maharashtra, India",
            "region_address_components": [
                "Mumbai",
                "Mumbai City",
                "Konkan Division",
                "Maharashtra",
                "India"
            ],
            "headline": "Strategy | Operations | Innovation",
            "summary": "A dynamic professional with a proven ability to drive projects to successful completion while optimizing operational workflows, fostering sustainable growth and enhance operational efficiency. With a talent for turning visionary concepts into actionable strategies, I thrive in dynamic, innovation-driven environments that embrace flexibility and collaboration.\n\nSpecializing in data-driven insights, process optimization, and strategic coherence, I partner with founders to streamline operations and uncover growth opportunities.",
            "skills": [
                "Project Management",
                "Phone Etiquette",
                "Director level",
                "Time Management",
                "Calendars",
                "Executive Support",
                "Calendaring",
                "Good Presentation skill. Conceptual knowledge.",
                "Microsoft Office",
                "Management",
                "Leadership",
                "Team Management",
                "Operations Management",
                "Service Delivery"
            ],
            "languages": [
                "English",
                "Hindi",
                "Marathi"
            ],
            "profile_language": "English",
            "linkedin_profile_url": "https://www.linkedin.com/in/ACoAABkPR7cBawD9az_7iDcK-ZC6mZoakF9N5NI",
            "flagship_profile_url": "https://www.linkedin.com/in/tejal-polekar-533975b8",
            "emails": [],
            "profile_picture_url": "https://media.licdn.com/dms/image/v2/C5603AQHopexYHgbGSg/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1558335733493?e=1743638400&v=beta&t=bvjtoUcB7qZIIASR987UFZxBad8eGDldw05f5IztuE4",
            "profile_picture_permalink": "https://crustdata-media.s3.us-east-2.amazonaws.com/person/10089fca11427f074b27104171952a1f301bafb31ad254f4daa7714aa310370e.jpg",
            "twitter_handle": "",
            "open_to_cards": [],
            "num_of_connections": 756,
            "education_background": [
                {
                    "degree_name": "Bachelor’s Degree",
                    "institute_name": "University of Mumbai",
                    "institute_linkedin_id": "15093732",
                    "institute_linkedin_url": "https://www.linkedin.com/school/15093732/",
                    "institute_logo_url": "https://media.licdn.com/dms/image/v2/C4E0BAQGsu_DimiqUow/company-logo_400_400/company-logo_400_400/0/1631357817785?e=1767225600&v=beta&t=V1XJnk0dflNeVUevroAPEbFYEprrISibHXDjtTKN41M",
                    "field_of_study": "Information Technology",
                    "activities_and_societies": "",
                    "start_date": "2013-01-01T00:00:00",
                    "end_date": "2015-01-01T00:00:00"
                },
                {
                    "degree_name": "High School",
                    "institute_name": "Bhavans College",
                    "institute_linkedin_id": "15251419",
                    "institute_linkedin_url": "https://www.linkedin.com/school/15251419/",
                    "institute_logo_url": "https://media.licdn.com/dms/image/v2/C560BAQHiajdf1RI_6g/company-logo_400_400/company-logo_400_400/0/1630618737526/bhavans_college_logo?e=1767225600&v=beta&t=B-a1UNYKXysFoAWiqr5mnkLxMfTokOmhcfODBdH8l58",
                    "field_of_study": "Biology/Biological Sciences, General",
                    "activities_and_societies": "",
                    "start_date": "2011-01-01T00:00:00",
                    "end_date": "2012-01-01T00:00:00"
                }
            ],
            "honors": [],
            "certifications": [],
            "current_employers": [
                {
                    "name": "Wingify",
                    "linkedin_id": "1775796",
                    "company_id": 8286,
                    "company_linkedin_id": "1775796",
                    "company_website_domain": "wingify.com",
                    "position_id": 2520761566,
                    "title": "Associate Manager ",
                    "description": "",
                    "location": "",
                    "start_date": "2022-10-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Entry Level Manager",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 3,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Delhi, India",
                    "company_hq_location_address_components": [
                        "Delhi",
                        "Delhi Division",
                        "India"
                    ],
                    "company_headcount_range": "201-500",
                    "company_industries": [
                        "Technology, Information and Internet",
                        "Technology, Information and Media"
                    ],
                    "company_linkedin_industry": "Technology, Information and Internet",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 441,
                    "company_website": "http://www.wingify.com",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/wingify",
                    "business_email_verified": false
                },
                {
                    "name": "Wingify",
                    "linkedin_id": "1775796",
                    "company_id": 8286,
                    "company_linkedin_id": "1775796",
                    "company_website_domain": "wingify.com",
                    "position_id": 1898030643,
                    "title": "EA To Founder & CEO",
                    "description": "",
                    "location": "India",
                    "start_date": "2021-11-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "CXO",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 4,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Delhi, India",
                    "company_hq_location_address_components": [
                        "Delhi",
                        "Delhi Division",
                        "India"
                    ],
                    "company_headcount_range": "201-500",
                    "company_industries": [
                        "Technology, Information and Internet",
                        "Technology, Information and Media"
                    ],
                    "company_linkedin_industry": "Technology, Information and Internet",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 441,
                    "company_website": "http://www.wingify.com",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/wingify",
                    "business_email_verified": false
                },
                {
                    "name": "Wingify",
                    "linkedin_id": "1775796",
                    "company_id": 8286,
                    "company_linkedin_id": "1775796",
                    "company_website_domain": "wingify.com",
                    "position_id": 2520759807,
                    "title": "Manager",
                    "description": "",
                    "location": "",
                    "start_date": "2023-11-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Entry Level Manager",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 2,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Delhi, India",
                    "company_hq_location_address_components": [
                        "Delhi",
                        "Delhi Division",
                        "India"
                    ],
                    "company_headcount_range": "201-500",
                    "company_industries": [
                        "Technology, Information and Internet",
                        "Technology, Information and Media"
                    ],
                    "company_linkedin_industry": "Technology, Information and Internet",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 441,
                    "company_website": "http://www.wingify.com",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/wingify",
                    "business_email_verified": false
                }
            ],
            "past_employers": [
                {
                    "name": "Seashell Logistics Pvt ltd",
                    "linkedin_id": "2367903",
                    "company_id": 1136330,
                    "company_linkedin_id": "2367903",
                    "company_website_domain": "seashellgroup.in",
                    "position_id": 1668412912,
                    "title": "Executive Assistant to MD",
                    "description": "",
                    "location": "Mumbai, Maharashtra, India",
                    "start_date": "2019-12-01T00:00:00",
                    "end_date": "2022-01-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Entry Level",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 2,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Navi Mumbai, Maharashtra, India",
                    "company_hq_location_address_components": [
                        "Navi Mumbai",
                        "Thane taluka",
                        "Konkan Division",
                        "Maharashtra",
                        "India"
                    ],
                    "company_headcount_range": "501-1000",
                    "company_industries": [
                        "Transportation, Logistics, Supply Chain and Storage"
                    ],
                    "company_linkedin_industry": "Transportation, Logistics, Supply Chain and Storage",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 503,
                    "company_website": "http://www.seashellgroup.in",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/seashell-logistics",
                    "business_email_verified": false
                },
                {
                    "name": "SAHEBA",
                    "linkedin_id": "35587383",
                    "company_id": 4232145,
                    "company_linkedin_id": "35587383",
                    "company_website_domain": "saheba.org",
                    "position_id": 1822790179,
                    "title": "Executive assistant to Director",
                    "description": "",
                    "location": "Navi mumbai",
                    "start_date": "2018-11-01T00:00:00",
                    "end_date": "2019-12-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Director",
                    "function_category": "",
                    "years_at_company": "1 to 2 years",
                    "years_at_company_raw": 1,
                    "company_headquarters_country": "ARE",
                    "company_hq_location": "Dubai, Dubai, United Arab Emirates",
                    "company_hq_location_address_components": [
                        "Dubai",
                        "Dubai",
                        "United Arab Emirates"
                    ],
                    "company_headcount_range": "2-10",
                    "company_industries": [
                        "Venture Capital and Private Equity Principals",
                        "Capital Markets",
                        "Financial Services"
                    ],
                    "company_linkedin_industry": "Venture Capital and Private Equity Principals",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 22,
                    "company_website": "http://www.saheba.org",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/saheba",
                    "business_email_verified": false
                },
                {
                    "name": "Healthspring - Family Health Experts",
                    "linkedin_id": "3543986",
                    "company_id": 6651,
                    "company_linkedin_id": "3543986",
                    "company_website_domain": "healthspring.in",
                    "position_id": 1465442143,
                    "title": "Senior Associate Member Services ",
                    "description": "",
                    "location": "vashi",
                    "start_date": "2016-03-01T00:00:00",
                    "end_date": "2018-09-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Senior",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 2,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Mumbai, Maharashtra, India",
                    "company_hq_location_address_components": [
                        "Mumbai",
                        "Mumbai City",
                        "Konkan Division",
                        "Maharashtra",
                        "India"
                    ],
                    "company_headcount_range": "1001-5000",
                    "company_industries": [
                        "Hospitals and Health Care"
                    ],
                    "company_linkedin_industry": "Hospitals and Health Care",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 407,
                    "company_website": "https://www.healthspring.in",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/healthspring-occupational-and-corporate-health-experts",
                    "business_email_verified": false
                }
            ],
            "last_updated": "2026-02-12T06:03:28",
            "recently_changed_jobs": false,
            "years_of_experience": "6 to 10 years",
            "years_of_experience_raw": 9,
            "all_employers": [
                {
                    "name": "Wingify",
                    "linkedin_id": "1775796",
                    "company_id": 8286,
                    "company_linkedin_id": "1775796",
                    "company_website_domain": "wingify.com",
                    "position_id": 2520761566,
                    "title": "Associate Manager ",
                    "description": "",
                    "location": "",
                    "start_date": "2022-10-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Entry Level Manager",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 3,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Delhi, India",
                    "company_hq_location_address_components": [
                        "Delhi",
                        "Delhi Division",
                        "India"
                    ],
                    "company_headcount_range": "201-500",
                    "company_industries": [
                        "Technology, Information and Internet",
                        "Technology, Information and Media"
                    ],
                    "company_linkedin_industry": "Technology, Information and Internet",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 441,
                    "company_website": "http://www.wingify.com",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/wingify",
                    "business_email_verified": false
                },
                {
                    "name": "Wingify",
                    "linkedin_id": "1775796",
                    "company_id": 8286,
                    "company_linkedin_id": "1775796",
                    "company_website_domain": "wingify.com",
                    "position_id": 1898030643,
                    "title": "EA To Founder & CEO",
                    "description": "",
                    "location": "India",
                    "start_date": "2021-11-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "CXO",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 4,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Delhi, India",
                    "company_hq_location_address_components": [
                        "Delhi",
                        "Delhi Division",
                        "India"
                    ],
                    "company_headcount_range": "201-500",
                    "company_industries": [
                        "Technology, Information and Internet",
                        "Technology, Information and Media"
                    ],
                    "company_linkedin_industry": "Technology, Information and Internet",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 441,
                    "company_website": "http://www.wingify.com",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/wingify",
                    "business_email_verified": false
                },
                {
                    "name": "Wingify",
                    "linkedin_id": "1775796",
                    "company_id": 8286,
                    "company_linkedin_id": "1775796",
                    "company_website_domain": "wingify.com",
                    "position_id": 2520759807,
                    "title": "Manager",
                    "description": "",
                    "location": "",
                    "start_date": "2023-11-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Entry Level Manager",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 2,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Delhi, India",
                    "company_hq_location_address_components": [
                        "Delhi",
                        "Delhi Division",
                        "India"
                    ],
                    "company_headcount_range": "201-500",
                    "company_industries": [
                        "Technology, Information and Internet",
                        "Technology, Information and Media"
                    ],
                    "company_linkedin_industry": "Technology, Information and Internet",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 441,
                    "company_website": "http://www.wingify.com",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/wingify",
                    "business_email_verified": false
                },
                {
                    "name": "Seashell Logistics Pvt ltd",
                    "linkedin_id": "2367903",
                    "company_id": 1136330,
                    "company_linkedin_id": "2367903",
                    "company_website_domain": "seashellgroup.in",
                    "position_id": 1668412912,
                    "title": "Executive Assistant to MD",
                    "description": "",
                    "location": "Mumbai, Maharashtra, India",
                    "start_date": "2019-12-01T00:00:00",
                    "end_date": "2022-01-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Entry Level",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 2,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Navi Mumbai, Maharashtra, India",
                    "company_hq_location_address_components": [
                        "Navi Mumbai",
                        "Thane taluka",
                        "Konkan Division",
                        "Maharashtra",
                        "India"
                    ],
                    "company_headcount_range": "501-1000",
                    "company_industries": [
                        "Transportation, Logistics, Supply Chain and Storage"
                    ],
                    "company_linkedin_industry": "Transportation, Logistics, Supply Chain and Storage",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 503,
                    "company_website": "http://www.seashellgroup.in",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/seashell-logistics",
                    "business_email_verified": false
                },
                {
                    "name": "SAHEBA",
                    "linkedin_id": "35587383",
                    "company_id": 4232145,
                    "company_linkedin_id": "35587383",
                    "company_website_domain": "saheba.org",
                    "position_id": 1822790179,
                    "title": "Executive assistant to Director",
                    "description": "",
                    "location": "Navi mumbai",
                    "start_date": "2018-11-01T00:00:00",
                    "end_date": "2019-12-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Director",
                    "function_category": "",
                    "years_at_company": "1 to 2 years",
                    "years_at_company_raw": 1,
                    "company_headquarters_country": "ARE",
                    "company_hq_location": "Dubai, Dubai, United Arab Emirates",
                    "company_hq_location_address_components": [
                        "Dubai",
                        "Dubai",
                        "United Arab Emirates"
                    ],
                    "company_headcount_range": "2-10",
                    "company_industries": [
                        "Venture Capital and Private Equity Principals",
                        "Capital Markets",
                        "Financial Services"
                    ],
                    "company_linkedin_industry": "Venture Capital and Private Equity Principals",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 22,
                    "company_website": "http://www.saheba.org",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/saheba",
                    "business_email_verified": false
                },
                {
                    "name": "Healthspring - Family Health Experts",
                    "linkedin_id": "3543986",
                    "company_id": 6651,
                    "company_linkedin_id": "3543986",
                    "company_website_domain": "healthspring.in",
                    "position_id": 1465442143,
                    "title": "Senior Associate Member Services ",
                    "description": "",
                    "location": "vashi",
                    "start_date": "2016-03-01T00:00:00",
                    "end_date": "2018-09-01T00:00:00",
                    "employer_is_default": false,
                    "seniority_level": "Senior",
                    "function_category": "",
                    "years_at_company": "3 to 5 years",
                    "years_at_company_raw": 2,
                    "company_headquarters_country": "IND",
                    "company_hq_location": "Mumbai, Maharashtra, India",
                    "company_hq_location_address_components": [
                        "Mumbai",
                        "Mumbai City",
                        "Konkan Division",
                        "Maharashtra",
                        "India"
                    ],
                    "company_headcount_range": "1001-5000",
                    "company_industries": [
                        "Hospitals and Health Care"
                    ],
                    "company_linkedin_industry": "Hospitals and Health Care",
                    "company_type": "Privately Held",
                    "company_headcount_latest": 407,
                    "company_website": "https://www.healthspring.in",
                    "company_linkedin_profile_url": "https://www.linkedin.com/company/healthspring-occupational-and-corporate-health-experts",
                    "business_email_verified": false
                }
            ],
            "updated_at": "2026-02-15T02:13:18",
            "location_details": {
                "city": "Mumbai",
                "state": "Maharashtra",
                "country": "India",
                "continent": "Asia"
            }
        }"