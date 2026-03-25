# CrustData API Testing Guide

## Manual Verification (`scripts/test-crustdata.ts`)
We have provided a standalone script to verify CrustData API filters without needing to run the full UI.

### Prerequisites
- Node.js installed
- `CRUSTDATA_API_KEY` set in your environment or `.env.local`

### Running the Test
You can execute the script using `ts-node` or `tsx`:

```bash
npx tsx scripts/test-crustdata.ts
```

### What it Tests
The script validates:
1. **Connectivity**: Ensures your API key is valid and the endpoint is reachable.
2. **Filter Composition**: Tests our `assembleCrustDataFilters` logic against specific test cases (e.g., "Senior Software Engineer in NYC").
3. **Payload Structure**: Verifies that the generated YAML/JSON payload matches CrustData's expected schema.

## Debugging Autocomplete
To test the realtime suggestions API used in the `FilterModal`:
```bash
curl -X GET "http://localhost:3000/api/suggestions?source=crustdata&field=title&q=Software"
```

## Interpreting Zero Results
If the API returns zero results, check the following in order:
1. **Job Title Strategy**: Is it using `boolean` search correctly? (Try swapping to `include` strategy).
2. **Location Precision**: Is the `geo_distance` too restrictive (e.g., < 10 miles)?
3. **Experience Over-matching**: Ensure `experience_min` matches the candidates' actual years in the data.

## Useful Links
- [CrustData Postman Documentation](https://documenter.getpostman.com/view/21578161/UzJQqBrW)
- [Nexire Admin Panel](https://nexire.in/admin) (to check API usage logs)
