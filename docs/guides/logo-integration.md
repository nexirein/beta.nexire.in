# Developer Guide: Logo Integration Strategy

Nexire AI uses a two-pronged strategy for fetching company and institute logos during the recruitment search process.

## 1. Company Logo Strategy (Logo.dev)

For all current and past employers, Nexire uses the **Logo.dev** API for consistent, high-quality company branding.

### Implementation: `OrgLogo` Component
-   **Service**: [Logo.dev](https://logo.dev)
-   **Resolution**: Domain-based (`company_website_domain` from CrustData).
-   **URL Structure**: `https://img.logo.dev/{domain}?token={pk_token}&size=64`
-   **Fallback**: If the logo fails to load (onError) or the domain is missing, the component falls back to a **Initials Avatar** with a background color based on the company name.

### Authentication
The Logo.dev token is a **Publishable Token** (`pk_...`) intended to be exposed in the frontend. It is stored in `.env` as `NEXT_PUBLIC_LOGO_DEV_TOKEN`.

---

## 2. Institute Logo Strategy (LinkedIn)

For educational backgrounds, Nexire uses LinkedIn-provided URLs when available.

### Implementation: `InstituteAvatar` Component
-   **Resolution**: Uses `institute_logo_url` from the CrustData `education_background` array.
-   **Fallback**: If the LinkedIn URL is missing or broken, the component falls back to a generic **Academic Icon** or **Initials**.

---

## 3. Graceful Degradation & Performance

-   **Caching**: Browser-side caching for all logo URLs.
-   **Error Handling**: Both components use a `useState` hook to track loading errors and trigger immediate UI fallbacks.
-   **Sizing**: Standardized to `size=64` (rendered at 32x32 or 40x40 px) for crisp display on high-DPI screens.
