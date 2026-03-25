/**
 * types/database.ts
 * Owner: nexire-backend
 * Purpose: TypeScript types for all 17 Nexire database tables + helper types.
 *          These are the ground truth for all data flowing through the app.
 *          Keep in sync with supabase/migrations/*.sql
 */

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export type UUID = string
export type ISO8601 = string

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export type OrgPlan = 'free' | 'solo' | 'growth' | 'custom'
export type BillingCycle = 'monthly' | 'annual'
export type MemberRole = 'owner' | 'admin' | 'member'
export type ProjectStatus = 'active' | 'closed' | 'archived'
export type RevealType = 'email' | 'phone'
export type RevealStatus = 'verified' | 'unverified' | 'invalid'
export type CreditTxType =
  | 'monthly_grant'
  | 'rollover'
  | 'reveal_email'
  | 'reveal_phone'
  | 'manual_topup'
  | 'refund'
  | 'adjustment'
export type ShortlistStatus = 'new' | 'screening' | 'interview' | 'offer' | 'rejected'
export type SequenceStatus = 'draft' | 'active' | 'paused' | 'completed'
export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'bounced' | 'dnc'
export type MailboxProvider = 'gmail' | 'outlook'
export type ContactSource = 'reveal' | 'manual' | 'import'
export type DNCType = 'email' | 'domain'
export type InviteRole = 'admin' | 'member'

// ─────────────────────────────────────────────────────────────────────────────
// CORE TABLES
// ─────────────────────────────────────────────────────────────────────────────

export interface Org {
  id: UUID
  name: string
  plan: OrgPlan
  billing_cycle: BillingCycle
  credits_balance: number
  credits_used: number
  credits_monthly: number
  cycle_resets_at: ISO8601 | null
  razorpay_subscription_id: string | null
  created_at: ISO8601
  updated_at: ISO8601
}

export interface Profile {
  id: UUID             // = auth.users.id
  org_id: UUID
  member_role: MemberRole
  full_name: string | null
  avatar_url: string | null
  job_title: string | null
  timezone: string
  created_at: ISO8601
  updated_at: ISO8601
}

export interface Project {
  id: UUID
  org_id: UUID
  title: string
  description: string | null
  status: ProjectStatus
  jd_text: string | null
  created_by: UUID | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE DB
// ─────────────────────────────────────────────────────────────────────────────

export interface Search {
  id: UUID
  org_id: UUID
  project_id: UUID | null
  query: string | null
  filters_json: ProspeoFilters | null
  criteria_json: ScoringCriteria | null
  result_count: number
  page: number
  credits_used: number
  was_cached: boolean
  created_at: ISO8601
}

/** The Nexire Intelligence DB row. Persistent per-org candidate record. */
export interface Candidate {
  id: UUID
  org_id: UUID
  person_id: string           // Prospeo stable ID — unique conflict key per org
  full_name: string | null
  headline: string | null
  current_title: string | null
  current_company: string | null
  location: string | null
  skills_json: string[] | null // array of skill strings
  linkedin_url: string | null
  profile_pic_url: string | null
  tenure_months: number | null
  estimated_notice_days: number | null  // GENERATED column — do not write
  ai_score: number | null     // 0–100; 80-100=good, 50-79=potential, <50=no match
  hidden: boolean
  raw_json: Record<string, unknown> | null  // full Prospeo payload
  first_seen_at: ISO8601
  last_enriched_at: ISO8601
}

export interface SearchCandidate {
  id: UUID
  search_id: UUID
  candidate_id: UUID
  position: number | null
  created_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// REVEALS
// ─────────────────────────────────────────────────────────────────────────────

export interface Reveal {
  id: UUID
  org_id: UUID
  candidate_id: UUID | null
  person_id: string             // Prospeo person_id — UNIQUE with (org_id, type)
  type: RevealType
  email: string | null
  phone: string | null
  status: RevealStatus
  revealed_by: UUID | null
  credits_charged: number
  created_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT LEDGER
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditTransaction {
  id: UUID
  org_id: UUID
  user_id: UUID | null
  type: CreditTxType
  amount: number               // positive = credit, negative = debit
  balance_after: number        // org.credits_balance snapshot after this tx
  notes: string | null
  candidate_id: UUID | null
  reveal_id: UUID | null
  created_at: ISO8601
  // NO updated_at — this table is append-only
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

export interface ShortlistEntry {
  id: UUID
  org_id: UUID
  project_id: UUID
  candidate_id: UUID
  status: ShortlistStatus
  notes: string | null
  ctc_lpa: number | null       // CTC estimate in Indian Lakhs Per Annum
  added_by: UUID | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SEQUENCES
// ─────────────────────────────────────────────────────────────────────────────

export interface SequenceStep {
  step: number
  delay_days: number
  subject: string
  body: string  // supports {{first_name}}, {{company}}, {{role}} tokens
}

export interface Sequence {
  id: UUID
  org_id: UUID
  project_id: UUID | null
  name: string
  status: SequenceStatus
  steps_json: SequenceStep[]
  created_at: ISO8601
  updated_at: ISO8601
}

export interface SequenceEnrollment {
  id: UUID
  org_id: UUID
  sequence_id: UUID
  candidate_id: UUID
  mailbox_id: UUID | null
  current_step: number
  status: EnrollmentStatus
  next_send_at: ISO8601 | null
  enrolled_by: UUID | null
  error_message: string | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// MAILBOXES
// ─────────────────────────────────────────────────────────────────────────────

export interface Mailbox {
  id: UUID
  org_id: UUID
  user_id: UUID
  email: string
  provider: MailboxProvider
  access_token: string | null     // OAuth access token (encrypted at rest)
  refresh_token: string | null    // OAuth refresh token (encrypted at rest)
  token_expires_at: ISO8601 | null
  is_active: boolean
  display_name: string | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT VIEWS (share links)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientView {
  id: UUID
  org_id: UUID
  project_id: UUID | null
  token: string              // URL-safe random token
  title: string | null
  password_hash: string | null  // bcrypt; null = no password required
  expires_at: ISO8601 | null
  view_count: number
  is_active: boolean
  created_by: UUID | null
  created_at: ISO8601
  updated_at: ISO8601
}

export interface ClientViewCandidate {
  id: UUID
  view_id: UUID
  candidate_id: UUID
  position: number | null
  created_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS + DNC
// ─────────────────────────────────────────────────────────────────────────────

export interface Contact {
  id: UUID
  org_id: UUID
  candidate_id: UUID | null
  email: string | null
  phone: string | null
  source: ContactSource
  dnc: boolean
  dnc_reason: string | null
  created_at: ISO8601
  updated_at: ISO8601
}

export interface DNCEntry {
  id: UUID
  org_id: UUID
  value: string          // email address OR domain (e.g. competitor.com)
  type: DNCType
  reason: string | null
  added_by: UUID | null
  created_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH LIBRARY
// ─────────────────────────────────────────────────────────────────────────────

export interface SavedSearch {
  id: UUID
  org_id: UUID
  name: string
  filters_json: ProspeoFilters | null
  criteria_json: ScoringCriteria | null
  use_count: number
  created_by: UUID | null
  created_at: ISO8601
  updated_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM INVITATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgInvitation {
  id: UUID
  org_id: UUID
  email: string
  role: InviteRole
  token: string         // cryptographically random; sent in invite email
  invited_by: UUID | null
  accepted_at: ISO8601 | null   // null = pending
  expires_at: ISO8601 | null
  created_at: ISO8601
}

// ─────────────────────────────────────────────────────────────────────────────
// PROSPEO FILTER SHAPE (matches Prospeo API request body)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProspeoFilters {
  person_job_title?: string
  person_seniority?: string[]
  person_departments?: string[]
  person_location?: string
  person_year_of_experience?: { min?: number; max?: number }
  company_industry?: string
  company_headcount_range?: string
  company_funding?: string
  company_technology?: string
  company_names?: string[]
  company_websites?: string[]
  [key: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// AI SCORING CRITERIA
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoringCriteria {
  min_score?: number         // 0–100; default 50
  required_skills?: string[]
  preferred_seniority?: string[]
  custom_notes?: string      // natural language notes for AI scorer
  [key: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE WRAPPERS
// ─────────────────────────────────────────────────────────────────────────────

export type ApiSuccess<T> = { data: T }
export type ApiError = { error: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSITE TYPES (for API responses with joined data)
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidateWithReveals extends Candidate {
  reveals?: Reveal[]
}

export interface ShortlistEntryWithCandidate extends ShortlistEntry {
  candidate: Candidate
  reveals?: Reveal[]
}

export interface ProfileWithOrg extends Profile {
  org: Org
}

export interface SearchWithCandidates extends Search {
  candidates: Candidate[]
}
