# Boardy Integration Guide

## Overview

When Boardy gets a **double opt-in** from an advisor, send the introduction to our API. We'll:
- Log it for attribution tracking
- Notify our team via Slack
- Track the advisor for placement attribution

---

## API Credentials

| | |
|---|---|
| **Base URL** | `https://api.stirlingshire.com` |
| **Vendor ID** | `5bd35782-aef5-4edf-b18c-3c0106b1c398` |
| **API Key** | `c3a9b8c77a97ced28cec4ed0f18ca4415238fe5af002f3ad55b9926922f7b2de` |

**Header:** `X-API-Key: your_api_key_here`

---

## Send Introduction

```
POST /api/vendors/{vendorId}/introductions
```

### Request

```json
{
  "candidateCrd": 1234567,
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "phone": "+1-212-555-1234",
  "introTimestamp": "2025-01-15T14:30:00Z",
  "conversationId": "boardy-convo-abc123",
  "recruiterName": "Steven"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `candidateCrd` | Yes | FINRA CRD number |
| `firstName` | Yes | Advisor's first name |
| `lastName` | Yes | Advisor's last name |
| `email` | No | Advisor's email |
| `phone` | No | Advisor's phone |
| `introTimestamp` | Yes | When opt-in occurred (ISO 8601) |
| `conversationId` | Yes | Your internal ID (for deduplication) |
| `recruiterName` | No | Stirlingshire recruiter if known |

### Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "candidateCrd": 1234567,
  "status": "OPEN",
  "createdAt": "2025-01-15T14:30:05.000Z"
}
```

---

## What Happens Next

### 1. Intro Notification (Immediate)

```
NEW INTRO
Jane Doe (CRD: 1234567)

Vendor:     Boardy
Recruiter:  Steven
Email:      jane.doe@example.com
Phone:      +1-212-555-1234

[Book via Calendly]
```

### 2. Meeting Booked (When candidate schedules via Calendly)

```
MEETING BOOKED
Jane Doe has scheduled a meeting!

CRD:        1234567
Date/Time:  Thu, Jan 16, 10:00 AM EST
Zoom Link:  [Join Meeting]
```

### 3. Hire Detected (Weekly BrokerCheck sync)

```
NEW PLACEMENT
Jane Doe has been placed!

CRD:        1234567
Hire Date:  2025-01-15
Intro Date: 2024-11-01
Vendor:     Boardy
```

---

## Placement Webhook

When an advisor you introduced gets hired, we send a webhook to your configured URL:

```json
{
  "event": "placement.created",
  "data": {
    "candidateCrd": 1234567,
    "candidateName": "Jane Doe",
    "hireDate": "2025-01-15",
    "introductionId": "660e8400-e29b-...",
    "conversationId": "boardy-convo-abc123",
    "feeAmount": "15000.00"
  }
}
```

---

## Idempotency

Same `vendorId` + `candidateCrd` + `conversationId` = returns existing record (no duplicate).

---

## Questions?

Contact: steven@stirlingshire.com
