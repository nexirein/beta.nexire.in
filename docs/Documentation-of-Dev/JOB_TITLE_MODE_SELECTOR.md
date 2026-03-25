# Job Title Mode Selector Architecture

This document details the filtering logic used to implement temporal and contextual job title scoping from the Nexire Search UI to the CrustData People Search API.

## Filtering Strategies by Mode

Each mode in the UI maps to a specific `CrustDataFilterTree` structure emitted by `buildCrustDataFilters`.

### 1. `current_only`
Targets individuals currently holding the job titles.
- **API Column**: `current_employers.title`
- **Operator**: `(.)` (Fuzzy matching)
- **Logic**: A simple fuzzy OR condition for multiple titles.

### 2. `current_recent`
Target current roles OR roles held within the last 2 years.
- **Logic**: `OR(CurrentTitleCheck, RecentPastTitleCheck)`
- **`RecentPastTitleCheck`**: `AND(past_employers.title (.), past_employers.end_date => CUTOFF)`
- **Cutoff Generation**: Computed in JS as `new Date().setFullYear(now - 2).toISOString().slice(0, 10)`.

### 3. `current_and_past`
Targets the person's entire career history.
- **API Column**: `all_employers.title`
- **Operator**: `(.)`
- **Note**: CrustData's `all_employers` field is an array field that automatically searches across both current and past employment records.

### 4. `nested_companies`
Targets the specified job titles *only* at the companies already selected in the "Include Companies" filter.
- **Logic**: `AND(current_employers.title (.), current_employers.name in [Names])`
- **Crucial Note**: By wrapping both conditions in an `AND` targeting the `current_employers` nested path, the API ensures both conditions must be true for the *same* employer record in the array. This prevents matching a person who is a "CEO" at Company A but currently works as a "Manager" at a selected Company B.

### 5. `funding_stage`
Targets job titles at companies matching the active funding filters.
- **Logic**: `AND(current_employers.title (.), current_employers.company_funding_latest => MIN, current_employers.company_funding_latest =< MAX)`
- **Scoping**: Like `nested_companies`, this uses nested AND scoping to ensure the title is held *at* the funded company.

## Implementation Files
- **Enum Definitions**: `lib/crustdata/types.ts` (`TitleMode`)
- **Filter Assembly**: `lib/crustdata/filter-builder.ts` (`buildCrustDataFilters`)
- **UI Interaction**: `components/search/FilterModal.tsx` (`TitleModeSelector`)
- **State Management**: `lib/hooks/useFilterState.ts` (Handles `title_mode` key)
