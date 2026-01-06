# Stirlingshire-Boardy

**Notification & Tracking Layer** for advisor recruitment between Stirlingshire and Boardy.

Both parties share the same Excel file of financial advisors (with CRD numbers). This service tracks key events and notifies the team via Slack.

---

## What It Does

```
Shared Excel File (advisors with CRD numbers)
                    ↓
┌─────────────────────────────────────────────────────┐
│  Stirlingshire-Boardy Tracking Service              │
│                                                     │
│  EVENT                    SLACK NOTIFICATION        │
│  ─────────────────────    ────────────────────────  │
│  1. Intro Made         →  🆕 NEW INTRO              │
│  2. Meeting Booked     →  📅 MEETING BOOKED         │
│  3. Hire Detected      →  🎉 NEW PLACEMENT          │
│                                                     │
│  + Audit trail for attribution tracking             │
└─────────────────────────────────────────────────────┘
```

**CRD number** is the key that ties everything together across all events.

---

## Three Core Events

### 1. Introduction (Boardy → System)

When Boardy gets a **double opt-in** from an advisor:

```
POST /api/vendors/{vendorId}/introductions
```

**Slack Notification:**
```
🆕 NEW INTRO 🧑‍💼
Jane Doe (CRD: 1234567)

Vendor:     Boardy
Recruiter:  Steven

Email:      jane.doe@example.com
Phone:      +1-212-555-1234

📅 Schedule a Meeting [Book via Calendly]
```

### 2. Meeting Booked (Calendly → System)

When an advisor books via the Calendly link:

**Slack Notification:**
```
📅 MEETING BOOKED
Jane Doe has scheduled a meeting via Calendly!

CRD:        1234567
Vendor:     Boardy
Date/Time:  Thu, Jan 16, 10:00 AM EST

Zoom Link:  Join Meeting
```

### 3. Hire Detected (BrokerCheck Sync)

Weekly check of FINRA BrokerCheck to see if introduced advisors joined Stirlingshire:

**Slack Notification:**
```
🎉 NEW PLACEMENT 💰
Jane Doe has been placed!

CRD:        1234567
Firm:       Stirlingshire Investments
Hire Date:  2025-01-15
Intro Date: 2024-11-01

Vendor:     Boardy
```

---

## Tech Stack

- **NestJS** (TypeScript)
- **PostgreSQL** + Prisma ORM
- **Slack** (webhook notifications)
- **Calendly** (self-service meeting booking)
- **FINRA BrokerCheck** (free public API for hire detection)

---

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database URL, Slack webhook, Calendly token

# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Start the server
npm run start:dev
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `SLACK_CHANNEL` | Channel for notifications (default: #stirlingshire-boardy-hiring) |
| `CALENDLY_API_TOKEN` | Calendly API token (Pro plan required) |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | Webhook signature verification |
| `STIRLINGSHIRE_FIRM_CRD` | Firm CRD to monitor in BrokerCheck |

---

## API Endpoints

### Introductions
- `POST /api/vendors/:vendorId/introductions` - Log a new introduction
- `GET /api/vendors/:vendorId/introductions` - List introductions

### Hires
- `POST /api/hires` - Log a hire (internal systems)
- `GET /api/hires` - List hires

### Placements
- `GET /api/placements` - List placements
- `POST /api/placements/match/:hireId` - Match a hire to introductions

### Webhooks
- `POST /api/webhooks/calendly` - Receive Calendly booking events

---

## Documentation

- [Boardy Integration Guide](docs/BOARDY_INTEGRATION.md) - API details for Boardy
- [Swagger Docs](http://localhost:3000/api/docs) - Interactive API documentation

---

## Attribution Window

When an advisor is hired, the system checks if there was an introduction within the **attribution window** (default: 12 months). If yes, a placement is created and attributed to Boardy.
