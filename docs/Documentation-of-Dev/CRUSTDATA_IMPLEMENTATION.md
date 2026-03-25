# CrustData Implementation Documentation

## Overview
Nexire's candidate search is powered by the CrustData PersonDB API. This implementation leverages a multi-path resolution strategy to transform natural language requirements into precise search filters.

## Architecture

### 1. Filter Resolution Pipeline (`/api/ai/context-to-filters`)
The pipeline processes conversational context through three parallel paths:
- **Path A: Autocomplete Resolution**: Uses the `CrustDataClient` to match job titles and regions against real-time LinkedIn data.
- **Path B: Industry Mapping**: Resolves raw industry mentions into CrustData's specific industry taxonomy.
- **Path C: LLM Direct Mapping**: Maps seniority levels, headcount ranges, and experience years using predefined whitelists.

### 2. Search Strategy Persistence
To maintain context between the chat and manual filter editing:
- **`requirement_summary`**: The AI generates a one-sentence summary of the search brief.
- **Persistent Storage**: This summary is stored in the `useSearchStore` and displayed prominently in the `FilterSummaryCard` and `FilterModal`.

### 3. "Recruiter Intuition" Logic
- **Experience Floor**: Automatically applies a `+2` year buffer to experience requirements to ensure candidate maturity.
- **Location Radius**: Simulates a 30-mile radius around target cities using geo-distance filters.
- **Auto-Broaden**: When zero matches are found, the system proactively suggests removing restrictive filters (e.g., specific skills or strict locations).

## UI/UX Design Principles
- **Professionalism**: Decorative icons have been removed in favor of a clean, typography-led interface.
- **Transparency**: The "Search Strategy" field provides immediate feedback on how the AI interprets requirements.
- **Actionability**: Status badges (Healthy/Limited/Strained) guide the user on the restrictiveness of their current filters.
