# Feature 15 — Notifications

**Spec References:** goWMS_Outbound_Analysis.md §16, PRIORITY_QUEUE_DESIGN.md §8
**Status:** PARTIAL (in-app only, not wired to events)
**Priority:** LOW

---

## Current Implementation

### Database
- `notifications`: id, type (info/success/warning/error), title, message, is_read, created_at

### Backend (api/modules/notifications/handler.go — 95 lines)
- `GET /notifications/` — list (latest 100)
- `POST /notifications/` — create (type, title, message)
- `POST /notifications/:id/read` — mark read

### Frontend (Notifications.tsx — 122 lines)
- All/Unread filter, mark read, "Mark All Read", color-coded by type

### Frontend (Notifications.tsx component — toast)
- UI toast component for immediate feedback (not server-side)

---

## Gaps

### 1. Not Wired to Events
- Notifications are manually created via API
- No automatic notifications on key events:
  - GRN close (new stock received)
  - Pick list assigned to picker
  - Dispatch delay (past SLA)
  - Backorder stock arriving
  - Reorder alerts triggered
- **Plan:**
  1. Add `shared.Notify(ctx, type, title, message)` helper
  2. Call from event handlers:
     - grn/handler.go close → "Stock received: X items"
     - picking/handler.go create → "Pick list assigned: PICK-XXX"
     - backorder/handler.go fulfill → "Backorder fulfilled: BO-XXX"
     - inventory/reorder-alerts → "Reorder needed: ITEM-XXX"
  3. Support multiple recipients (role-based or specific user)
- **Effort:** 1-2 days

### 2. No External Delivery
- No push notifications (WebSocket/Firebase)
- No email (no SMTP config)
- No SMS (no API integration)
- **Impact:** Low for v1 — in-app notifications sufficient for desk users
- **Recommendation:** Add push notifications (WebSocket) for floor workers on mobile. Skip email/SMS for v1.

### 3. No Notification Preferences
- Users can't opt out of specific notification types
- **Impact:** Low — skip for v1

---

## Conflict Analysis

No conflicts — notifications are cross-cutting, additive to all modules.

---

## Acceptance Criteria

- [x] Create notification
- [x] List notifications
- [x] Mark read / mark all read
- [x] Color-coded by type
- [ ] Auto-notifications on GRN close (TODO)
- [ ] Auto-notifications on pick assignment (TODO)
- [ ] Auto-notifications on backorder events (TODO)

---

## Implementation Plan

### Phase 1 — Event Wiring (1-2 days)
1. Create shared.Notify helper
2. Wire to GRN close, pick creation, backorder fulfill
3. Add recipient support (user_id or role)

### Phase 2 — Push Notifications (future)
1. WebSocket connection for real-time updates
2. Floor worker mobile notifications
