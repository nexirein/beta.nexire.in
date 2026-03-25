/**
 * lib/ai/suggestion-dictionary.ts
 * 
 * An offline, static dictionary of the most common job title and location suggestions.
 * Bypasses the Prospeo /search-suggestions API entirely to save rate limits.
 * All keys must be strictly lowercase.
 */

export const STATIC_TITLE_SUGGESTIONS: Record<string, string[]> = {
  // Software / Tech
  "software engineer": ["software engineer", "senior software engineer", "lead software engineer", "principal software engineer", "staff software engineer", "software development engineer"],
  "software developer": ["software developer", "senior software developer", "lead software developer", "java developer", "full stack developer", "backend developer", "frontend developer"],
  "backend engineer": ["backend engineer", "senior backend engineer", "lead backend engineer", "staff backend engineer", "backend developer"],
  "backend developer": ["backend developer", "senior backend developer", "lead backend developer", "java backend developer", "node.js developer", "python backend developer"],
  "frontend engineer": ["frontend engineer", "senior frontend engineer", "lead frontend engineer", "ui engineer", "react engineer", "frontend web developer"],
  "frontend developer": ["frontend developer", "senior frontend developer", "lead frontend developer", "react developer", "angular developer", "vue developer"],
  "full stack engineer": ["full stack engineer", "senior full stack engineer", "lead full stack engineer", "full stack web developer", "mern stack developer"],
  "full stack developer": ["full stack developer", "senior full stack developer", "lead full stack developer", "mern stack developer", "full stack software engineer"],
  "product manager": ["product manager", "senior product manager", "vp product", "director of product", "technical product manager", "group product manager"],
  "project manager": ["project manager", "senior project manager", "technical project manager", "assistant project manager", "it project manager", "program manager"],
  "data scientist": ["data scientist", "senior data scientist", "lead data scientist", "principal data scientist", "machine learning engineer", "data analyst"],
  "data engineer": ["data engineer", "senior data engineer", "lead data engineer", "big data engineer", "data warehouse engineer"],
  "devops engineer": ["devops engineer", "senior devops engineer", "lead devops engineer", "site reliability engineer", "sre", "cloud engineer"],
  "qa engineer": ["qa engineer", "senior qa engineer", "quality assurance engineer", "qa automation engineer", "software test engineer", "sdet"],
  "ui/ux designer": ["ui/ux designer", "senior ui/ux designer", "product designer", "ux designer", "ui designer", "user experience designer"],
  // Marketing / Sales
  "marketing manager": ["marketing manager", "senior marketing manager", "digital marketing manager", "vp marketing", "director of marketing", "brand manager"],
  "sales executive": ["sales executive", "senior sales executive", "sales manager", "account executive", "business development executive", "sales Representative"],
  "business development manager": ["business development manager", "senior business development manager", "bd manager", "vp business development", "strategic partnerships manager"],
  "account manager": ["account manager", "senior account manager", "key account manager", "strategic account manager", "client success manager"],
  "sales manager": ["sales manager", "senior sales manager", "vp sales", "director of sales", "regional sales manager", "area sales manager"],
  // HR / Admin
  "hr manager": ["hr manager", "human resources manager", "senior hr manager", "vp human resources", "talent acquisition manager", "hr business partner"],
  "recruiter": ["recruiter", "senior recruiter", "talent acquisition specialist", "technical recruiter", "hr recruiter"],
  // Engineering / Civil / Mechanical
  "civil engineer": ["civil engineer", "senior civil engineer", "project engineer", "site engineer", "structural engineer"],
  "mechanical engineer": ["mechanical engineer", "senior mechanical engineer", "project engineer", "design engineer", "manufacturing engineer"]
};

export const STATIC_LOCATION_SUGGESTIONS: Record<string, string[]> = {
  // India / Major Metros
  "india": ["India"],
  "bengaluru": ["Bengaluru, India", "Bengaluru Urban, India", "Bengaluru North, India", "Bengaluru South, India"],
  "bangalore": ["Bangalore Division, India", "Bangalore Urban, India", "Bangalore Rural, India"],
  "mumbai": ["Mumbai, India", "Mumbai Suburban, India", "Navi Mumbai, India", "Mumbai Metropolitan Region, India"],
  "new delhi": ["New Delhi, India", "Delhi, India", "Delhi Division, India", "National Capital Territory of Delhi, India"],
  "delhi": ["Delhi, India", "New Delhi, India", "Delhi Division, India", "National Capital Territory of Delhi, India"],
  "pune": ["Pune, India", "Pune Division, India", "Pimpri-Chinchwad, India"],
  "hyderabad": ["Hyderabad, India", "Hyderabad Metropolitan Region, India", "Rangareddy, India"],
  "chennai": ["Chennai, India", "Chennai Division, India", "Kanchipuram, India"],
  "gurgaon": ["Gurugram, India", "Gurgaon Division, India", "Haryana, India"],
  "gurugram": ["Gurugram, India", "Gurgaon Division, India", "Haryana, India"],
  "noida": ["Noida, India", "Gautam Buddha Nagar, India", "Uttar Pradesh, India"],
  // Common US
  "united states": ["United States"],
  "new york": ["New York, United States", "New York metropolitan area, United States"],
  "san francisco": ["San Francisco, United States", "San Francisco Bay Area, United States", "San Francisco County, United States"]
};
