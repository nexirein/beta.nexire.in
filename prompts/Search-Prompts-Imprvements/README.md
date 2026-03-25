# Nexire Prompts — Implementation Guide

## How to Use These Prompts

1. **Always** start every IDE session by pasting the contents of `MASTER_CONTEXT.md`
2. Then paste the phase prompt you're working on
3. The IDE will have all the context it needs to write correct code

## Phase Order (implement in sequence)

| File | Phase | What Gets Built | Est. Sessions |
|---|---|---|---|
| `MASTER_CONTEXT.md` | Always | Context document (not a build phase) | — |
| `phase-0-infrastructure.md` | Phase 0 | DB schema, Prisma, Redis, Prospeo client, Account manager | 2-3 |
| `phase-1-ui-foundation.md` | Phase 1 | Black theme, sidebar, layout, projects dashboard | 2-3 |
| `phase-2-projects.md` | Phase 2 | Project/search routing, all API routes, URL architecture | 2-3 |
| `phase-3-filter-modal.md` | Phase 3 | Wide filter modal, all Prospeo filters UI | 3-4 |
| `phase-4-ai-jd-pipeline.md` | Phase 4 | Python FAISS service, LLM extraction, JD modal | 3-4 |
| `phase-5-search-results.md` | Phase 5 | Results page, list/table view, profile panel | 3-4 |
| `phase-6-api-management.md` | Phase 6 | Admin panel, rate limiting, multi-account rotation | 2-3 |
| `phase-7-caching-storage.md` | Phase 7 | Redis cache, DB storage strategy, candidate index | 1-2 |
| `phase-8-optimization.md` | Phase 8 | Polish, keyboard shortcuts, empty states, perf | 1-2 |

## Manual Steps You Must Do (before starting)

1. **Phase 3**: Paste 4,946 technology values into `PASTE_ALL_4946_TECHNOLOGIES_HERE` in phase-3-filter-modal.md
2. **Phase 3**: Paste 256 industry values into `PASTE_ALL_256_INDUSTRIES_HERE`
3. **Phase 3**: Paste 107 MX provider values into `PASTE_MX_PROVIDERS_HERE`
4. **Phase 4**: Populate `python-service/data/technologies.json` with 4,946 tech names array
5. **Phase 4**: Populate `python-service/data/industries.json` with 256 industry names array
6. **Phase 8**: Fill in `[USER_INSERTS_21ST_DEV_COMPONENT_PROMPTS_HERE]` with your 21st.dev picks

## Prospeo Enum URLs (fetch values from these):
- Technologies (4946): https://prospeo.io/api-docs/enum/technologies
- Industries (256): https://prospeo.io/api-docs/enum/industries
- MX Providers (107): https://prospeo.io/api-docs/enum/mx-providers
- NAICS Codes: https://prospeo.io/api-docs/enum/naics-codes
- SIC Codes: https://prospeo.io/api-docs/enum/sic-codes
- Departments: https://prospeo.io/api-docs/enum/departments
- Seniorities: https://prospeo.io/api-docs/enum/seniorities
- Employee Ranges: https://prospeo.io/api-docs/enum/employee-ranges
- Funding Stages: https://prospeo.io/api-docs/enum/funding-stages
