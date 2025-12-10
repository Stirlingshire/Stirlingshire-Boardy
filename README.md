# Stirlingshire-Boardy
# Stirlingshire – Advisor Placement Tracking Service (Boardy Integration)

This service is the **shared, auditable ledger** between **Stirlingshire** and **Boardy**.

Its job:

1. Track which advisors Boardy has **introduced** (double opt-in) to Stirlingshire recruiters — using CRD as the canonical ID.
2. Detect when those advisors later **join Stirlingshire**, using:
   - Internal onboarding events, and
   - A **weekly FINRA registration/termination sync**.
3. Create **placements** for billable hires.
4. Push hire/placement information back to Boardy so:
   - Boardy knows which hires to bill on.
   - Boardy can refine targeting based on who Stirlingshire is actually hiring.
5. Maintain a full **audit trail** that both parties can review.

Boardy already has advisor master data (Name, Phone, Email, LinkedIn, CRD) provided by Stirlingshire and handles outreach. This service does not call prospects; it is the **authoritative system of record**.

---

## Business Flow Overview

1. **Stirlingshire → Boardy (advisor universe)**  
   Stirlingshire gives Boardy a list of several thousand advisors with:
   - Name, Phone, Email, LinkedIn, CRD.

2. **Boardy outreach & double opt-in**  
   Boardy’s AI:
   - Contacts advisors using the list.
   - Discusses opportunities with Stirlingshire.
   - When an advisor **explicitly agrees** to speak with a Stirlingshire recruiter (double opt-in):
     - Boardy records that event.
     - Boardy’s backend sends a **single API call** to this service with the advisor’s CRD and introduction timestamp.

3. **Stirlingshire onboarding / hiring**  
   When an advisor is actually **hired**:
   - Internal onboarding / registration systems send a `POST /hires` event to this service, **and/or**
   - Once per week, the service calls FINRA APIs to pull Stirlingshire’s registration/termination data and:
     - Detect **new registrations** (new hires).
     - Detect **terminations**.

4. **Matching & placements**  
   The service:
   - Matches **introductions** (by CRD and time) to **hires** (from internal events and weekly FINRA sync).
   - If a valid match is found within the agreed attribution window (e.g. 12 months):
     - Creates a **placement** record.
     - Marks the introduction as `PLACED`.

5. **Notifications & feedback to Boardy**  
   For each new placement:
   - Stirlingshire gets an internal notification (email/Slack/log).
   - Boardy receives a **webhook** with:
     - Advisor identity (CRD + name).
     - Hire date.
     - Stirlingshire entity.
     - Placement ID and fee data.
   - Boardy:
     - Logs this as a success for billing.
     - Uses the hire profile to refine which advisors to target next.

6. **Auditability**  
   - Every introduction, hire, placement, and status change is logged in an `audit_log` table.
   - Both parties can query introductions & placements by CRD, date, status, etc.

---

## Tech Stack

- Language: **TypeScript**
- Framework: **NestJS**
- Database: **PostgreSQL**
- Auth: API key or JWT (machine-to-machine)
- Migrations: Prisma or TypeORM
- Scheduling: `@nestjs/schedule` (cron jobs)

---

## Core Data Model (PostgreSQL)

### `vendor`

Represents recruiting partners (e.g., Boardy).

- `id` (UUID, PK)
- `name` (TEXT) — e.g. `"Boardy"`
- `placement_terms` (JSONB) — fee rules, attribution window, etc.
- `webhook_url` (TEXT, nullable) — where to POST placement events.
- `api_key_hash` (TEXT) — hash of vendor API key for auth.
- `is_active` (BOOLEAN, default TRUE)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### `introduction`

Each **double opt-in** introduction from Boardy.

- `id` (UUID, PK)
- `vendor_id` (UUID, FK → `vendor.id`)
- `candidate_crd` (BIGINT, indexed)
- `candidate_first_name` (TEXT)
- `candidate_last_name` (TEXT)
- `candidate_phone` (TEXT, nullable)
- `candidate_email` (TEXT, nullable)
- `candidate_linkedin` (TEXT, nullable)
- `intro_timestamp` (TIMESTAMPTZ)
- `recruiter_name` (TEXT, nullable) — Stirlingshire recruiter introduced to.
- `conversation_id` (TEXT) — Boardy’s internal conversation/lead ID.
- `status` (ENUM) — `OPEN | PLACED | EXPIRED | CANCELLED`
- `metadata` (JSONB, nullable) — campaign, territory, etc.
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Uniqueness (idempotency):**

- Unique constraint: `(vendor_id, candidate_crd, conversation_id)`

### `hire`

Represents a hire at a Stirlingshire entity (from internal systems or FINRA weekly sync).

- `id` (UUID, PK)
- `crd_number` (BIGINT, indexed)
- `first_name` (TEXT)
- `last_name` (TEXT)
- `firm_entity` (TEXT) — e.g. `"Stirlingshire BD LLC"`, `"Stirlingshire RIA LLC"`.
- `firm_crd` (BIGINT, nullable if internal-only source)
- `hire_date` (DATE)
- `termination_date` (DATE, nullable) — if/when FINRA or internal data shows termination.
- `source` (TEXT) — `"INTERNAL_ONBOARDING" | "FINRA_WEEKLY_SYNC" | ...`
- `raw_source_reference` (TEXT, nullable) — e.g., HR system ID, FINRA file batch ID.
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### `placement`

Billable placements.

- `id` (UUID, PK)
- `vendor_id` (UUID, FK → `vendor.id`)
- `introduction_id` (UUID, FK → `introduction.id`, unique)
- `hire_id` (UUID, FK → `hire.id`)
- `candidate_crd` (BIGINT, indexed)
- `hire_date` (DATE)
- `status` (ENUM) — `PENDING_NOTIFY | NOTIFIED | INVOICED | PAID | DISPUTED`
- `fee_amount` (NUMERIC(18,2))
- `fee_currency` (TEXT, default `'USD'`)
- `terms_snapshot` (JSONB) — copy of vendor’s placement terms at creation.
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### `audit_log`

For a full, reconstructible history.

- `id` (UUID, PK)
- `entity_type` (TEXT) — `"INTRODUCTION" | "HIRE" | "PLACEMENT"`
- `entity_id` (UUID)
- `event_type` (TEXT) — `"CREATED" | "UPDATED" | "STATUS_CHANGED" | "NOTIFIED_VENDOR" | "NOTIFIED_INTERNAL"`
- `old_value` (JSONB, nullable)
- `new_value` (JSONB, nullable)
- `source` (TEXT) — `"SYSTEM" | "BOARDY_API" | "INTERNAL_API" | "FINRA_SYNC"`
- `created_at` (TIMESTAMPTZ)

---

## API – Boardy-Facing

Base path: `/api`.  
Auth: Vendor API key or JWT mapped to `vendor.id`.

### 1. Log a Double Opt-In Introduction (Boardy → Service)

**Endpoint**

`POST /api/vendors/:vendorId/introductions`

**Request body (JSON)**

```json
{
  "candidateCrd": 1234567,
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+1-212-555-1234",
  "email": "jane.doe@example.com",
  "linkedin": "https://www.linkedin.com/in/janedoe",
  "introTimestamp": "2025-12-09T15:02:00Z",
  "recruiterName": "John Recruiter",
  "conversationId": "boardy-convo-123",
  "metadata": {
    "campaign": "US-Expansion-2026",
    "region": "NY/NJ",
    "seniority": "Senior FA"
  }
}
