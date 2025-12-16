# Boardy Integration Guide

## Overview

When Boardy's AI gets a double opt-in from a financial advisor who wants to speak with Stirlingshire, send the introduction to our API. We'll automatically:
- Log the introduction for attribution tracking
- Create a Zoom meeting (if time provided)
- Add to our calendar
- Notify our team via Slack

---

## API Credentials

**Base URL:** `https://api.stirlingshire.com` _(or your deployed URL)_

**Vendor ID:** `[WILL BE PROVIDED]`

**API Key:** `[WILL BE PROVIDED]`

---

## Authentication

Include the API key in the `X-API-Key` header:

```
X-API-Key: your_api_key_here
```

---

## Send Introduction

**Endpoint:** `POST /api/vendors/{vendorId}/introductions`

### Request Body

```json
{
  "candidateCrd": 1234567,
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "phone": "+1-212-555-1234",
  "linkedin": "https://www.linkedin.com/in/janedoe",
  "introTimestamp": "2025-01-15T14:30:00Z",
  "conversationId": "boardy-convo-abc123",
  "recruiterName": "Steven",
  "meetingStartTime": "2025-01-16T10:00:00Z",
  "meetingDuration": 30,
  "metadata": {
    "campaign": "Q1-2025-Outreach",
    "source": "LinkedIn",
    "region": "Northeast"
  }
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `candidateCrd` | Yes | FINRA CRD number of the advisor |
| `firstName` | Yes | Advisor's first name |
| `lastName` | Yes | Advisor's last name |
| `email` | No | Advisor's email (enables calendar invite) |
| `phone` | No | Advisor's phone number |
| `linkedin` | No | LinkedIn profile URL |
| `introTimestamp` | Yes | ISO 8601 timestamp when opt-in occurred |
| `conversationId` | Yes | Your internal conversation/lead ID (for deduplication) |
| `recruiterName` | No | Stirlingshire recruiter name if known |
| `meetingStartTime` | No | ISO 8601 timestamp to auto-book a meeting |
| `meetingDuration` | No | Meeting duration in minutes (default: 30) |
| `metadata` | No | Any additional context (campaign, source, etc.) |

### Response

**Success (201 Created or 200 OK if duplicate):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "candidateCrd": 1234567,
  "candidateFirstName": "Jane",
  "candidateLastName": "Doe",
  "status": "OPEN",
  "introTimestamp": "2025-01-15T14:30:00.000Z",
  "meetingStartTime": "2025-01-16T10:00:00.000Z",
  "meetingZoomLink": "https://zoom.us/j/123456789",
  "createdAt": "2025-01-15T14:30:05.000Z"
}
```

---

## Auto-Meeting Booking

If you include `meetingStartTime`, we automatically:
1. Create a Zoom meeting at that time
2. Add it to Steven's calendar
3. Send a calendar invite to the advisor (if email provided)

The Zoom link is returned in the response and included in our Slack notification.

---

## Idempotency

The API is idempotent based on:
- `vendorId` + `candidateCrd` + `conversationId`

If you send the same combination twice, we return the existing introduction (200 OK) rather than creating a duplicate.

---

## Example cURL

```bash
curl -X POST "https://api.stirlingshire.com/api/vendors/YOUR_VENDOR_ID/introductions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "candidateCrd": 7654321,
    "firstName": "John",
    "lastName": "Smith",
    "email": "john.smith@wealth.com",
    "phone": "+1-555-123-4567",
    "introTimestamp": "2025-01-15T09:00:00Z",
    "conversationId": "boardy-lead-xyz789",
    "meetingStartTime": "2025-01-17T15:00:00Z",
    "meetingDuration": 30
  }'
```

---

## What Happens After Introduction

### 1. Slack Notification (Immediate)

When you send an introduction, our team receives a Slack notification like this:

```text
┌─────────────────────────────────────────────────────────┐
│  🆕 NEW INTRO 🧑‍💼                                        │
├─────────────────────────────────────────────────────────┤
│  Jane Doe (CRD: 1234567)                                │
│                                                         │
│  Vendor:     Boardy                                     │
│  Recruiter:  Steven                                     │
│                                                         │
│  Email:      jane.doe@example.com                       │
│  Phone:      +1-212-555-1234                            │
│                                                         │
│  View LinkedIn Profile                                  │
├─────────────────────────────────────────────────────────┤
│  📅 Meeting Scheduled                                   │
│                                                         │
│  Date/Time:  Thu, Jan 16, 10:00 AM EST                  │
│  Zoom Link:  Join Meeting                               │
├─────────────────────────────────────────────────────────┤
│  Conversation ID: boardy-convo-abc123                   │
└─────────────────────────────────────────────────────────┘
```

If no meeting time is provided, we show a "Book via Calendly" button instead.

### 2. Ongoing Tracking

1. **Immediate:** Slack notification to Stirlingshire team with advisor details + Zoom link
2. **Ongoing:** We track the advisor via FINRA BrokerCheck
3. **On Hire:** If advisor joins Stirlingshire within 12 months, placement is attributed to Boardy
4. **Notification:** Webhook sent to your `webhookUrl` (if configured) when placement confirmed

---

## Webhook Notifications (Placement Created)

When an advisor you introduced gets hired at Stirlingshire, we'll send a webhook to your configured URL.

### Setup

Provide us your webhook endpoint URL (e.g., `https://boardy.ai/webhooks/stirlingshire`) and we'll configure it on your vendor account.

### Webhook Payload

```json
POST https://your-webhook-url.com
Content-Type: application/json
X-Stirlingshire-Event: placement.created

{
  "event": "placement.created",
  "timestamp": "2025-01-20T15:30:00.000Z",
  "data": {
    "placementId": "550e8400-e29b-41d4-a716-446655440000",
    "candidateCrd": 1234567,
    "candidateName": "Jane Doe",
    "hireDate": "2025-01-15",
    "firmEntity": "Stirlingshire Investments",
    "introductionId": "660e8400-e29b-41d4-a716-446655440001",
    "introTimestamp": "2024-11-01T10:00:00.000Z",
    "conversationId": "boardy-convo-abc123",
    "feeAmount": "15000.00",
    "feeCurrency": "USD"
  }
}
```

### What This Means

When you receive this webhook:
- The advisor you introduced (`conversationId`) was hired
- Stirlingshire owes you the placement fee (`feeAmount`)
- The `introductionId` links back to your original introduction

### Responding to Webhooks

Return a `200 OK` response to acknowledge receipt. If we don't receive a success response, we'll retry.

---

## Questions?

Contact: steven@stirlingshire.com
