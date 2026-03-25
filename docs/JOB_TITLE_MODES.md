# Job Title Mode Selector

The Job Title Mode Selector is a feature in the Search Filter Modal that allows users to control the temporal and contextual scope of job title filters. It is modeled after the "Juicebox" experience to provide industry-standard precision in talent discovery.

## User Interface

In the **Job** tab of the Filter Modal, the "Job Titles" section includes a pill button that opens a dropdown with five distinct modes:

1.  **Current Only** (Default): Find people who currently hold these job titles.
2.  **Current + Recent**: Find people holding or who held these titles within the last 2 years.
3.  **Current + Past**: Find people who held these titles at any point in their career (entire history).
4.  **Nested with Companies**: Match titles only at the specific companies you have selected in the **Company** tab.
5.  **Funding Stage**: Match titles at companies that currently fall within the funding range set in the **Funding & Revenue** tab.

## Technical Implementation

The feature spans the filter state, the UI component, and the CrustData filter builder.

### 1. Filter State (`types.ts`)
A new field `title_mode` of type `TitleMode` was added to the `CrustDataFilterState`.

```typescript
export type TitleMode =
  | "current_only"
  | "current_recent"
  | "current_and_past"
  | "nested_companies"
  | "funding_stage";
```

### 2. Filter Builder (`filter-builder.ts`)
The `buildCrustDataFilters` function branches based on the selected `title_mode` to emit different CrustData API conditions:

*   **Current Only**: Maps to `current_employers.title` with fuzzy matching `(.)`.
*   **Current + Recent**: Creates an `OR` condition between `current_employers.title` and a compound `AND(past_employers.title, past_employers.end_date => CUTOFF)`, where the cutoff is 2 years from today.
*   **Current + Past**: Maps to `all_employers.title` with fuzzy matching `(.)`.
*   **Nested with Companies**: Wraps the title filter and the company name filter (`current_employers.name`) inside a nested `AND` block. This ensures CrustData only returns profiles where *the same* employment record matches both conditions.
*   **Funding Stage**: Similar to nested companies, it wraps the title filter and funding amount filters (`current_employers.company_funding_latest`) inside a nested `AND` block targeting `current_employers`.

### 3. UI Component (`FilterModal.tsx`)
A `TitleModeSelector` sub-component provides the animated dropdown menu. It uses `framer-motion` for smooth transitions and `lucide-react` for icons.

## File References
- **Types**: `lib/crustdata/types.ts`
- **Logic**: `lib/crustdata/filter-builder.ts`
- **UI**: `components/search/FilterModal.tsx`
