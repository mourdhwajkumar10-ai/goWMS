# Role-Aware Desktop and Mobile Architecture

**Date:** 2026-08-24  
**Branch:** `feat/role-aware-permissions-rf-camera`  
**Status:** Implemented (core) — see `docs/superpowers/specs/2026-08-25-role-aware-rollout-verification.md` for verification and deferred ops checks

## 1. Goal

Configure goWMS so the same operational data and business rules work consistently across desktop browsers, phones, tablets, and warehouse scanners, while each user can only access actions permitted by their role and warehouse scope.

The desktop and mobile interfaces are presentation variants of the same domain flows. Device detection must not be treated as authorization: the backend remains authoritative for every protected operation.

## 2. Scope

### In scope

- A canonical permission catalog.
- Role profiles and a role-to-permission matrix.
- Server-side permission enforcement for sensitive API operations.
- Login/session responses that expose the server-authoritative role and permissions to the frontend.
- Shared frontend permission helpers for route and control visibility.
- Separate desktop and handheld shells using the same API contracts.
- One canonical receiving data flow rendered as desktop and RF/mobile views.
- Explicit camera permission and availability states.
- Automated tests for role access, API authorization, receiving parity, and camera fallback.

### Out of scope for the first implementation

- Replacing JWT authentication with another identity provider.
- Storing camera images or video.
- Offline synchronization beyond the existing application behavior.
- Automatic device enrollment through MDM.
- A new mobile-native application.
- Rewriting unrelated warehouse modules.

## 3. Architecture

```text
                  +----------------------------+
                  | Server-authoritative auth  |
                  | role + permissions + scope |
                  +-------------+--------------+
                                |
                         Shared API contracts
                                |
              +-----------------+-----------------+
              |                                   |
      Desktop shell/view                 Handheld shell/view
      tables, filters, admin              cards, scanner, RF tasks
              |                                   |
              +-----------------+-----------------+
                                |
                    Backend permission middleware
                                |
                    Domain handlers + warehouse scope
```

The backend owns authorization. The frontend receives permission metadata to improve navigation and usability, but a hidden route or button is never considered a security control.

## 4. Permission Catalog

Permissions use the format `<domain>.<action>`:

| Permission | Intended capability |
|---|---|
| `receiving.view` | View receiving sessions and eligible POs |
| `receiving.start` | Start or resume a receiving session |
| `receiving.scan_box` | Scan and record box receipt |
| `receiving.scan_item` | Scan and verify an item |
| `receiving.reject_item` | Reject an item and route it to the reject location |
| `receiving.complete` | Complete box/session receiving steps |
| `receiving.approve` | Approve a packing list for receiving |
| `po.view` | View purchase orders |
| `po.create` | Create purchase orders |
| `po.edit` | Edit or submit purchase orders |
| `inventory.view` | View stock and location balances |
| `inventory.adjust` | Adjust inventory quantities |
| `masterdata.manage` | Manage items, locations, warehouses, and suppliers |
| `reports.view` | View operational reports |
| `users.manage` | Manage employees and credentials |
| `roles.manage` | Manage roles and permissions |
| `notifications.view` | View and acknowledge notifications |

The catalog is additive: new capabilities receive new permission names rather than broadening an unrelated permission silently.

## 5. Initial Role Profiles

| Role | Desktop shell | Handheld shell | Core permissions |
|---|---:|---:|---|
| `admin` | Yes | Yes | All permissions |
| `wm` | Yes | Yes | Operations, approvals, reports, inventory, master data |
| `supervisor` | Yes | Yes | Operations, receiving approval, reports, inventory view |
| `receiving_operator` | Optional | Yes | Receiving view/start/scan/reject/complete, PO view |
| `qi` | Optional | Yes | Receiving scan/complete, item verification, exceptions, QI |
| `picker` | Optional | Yes | Inventory view, picking, stock scans, cycle counts |
| `packer` | Optional | Yes | Packing and relevant inventory view |
| `dispatcher` | Yes | Yes | Dispatch, delivery, relevant order and inventory view |
| `driver` | No/limited | Yes | Assigned dispatch and delivery actions only |
| `billing` | Yes | No/limited | Billing, orders, customers, reports |
| `viewer` | Yes | No | Read-only permissions explicitly granted |

Existing role names must be mapped rather than renamed blindly. Before enforcing new permissions, the implementation must inventory current database roles and existing route behavior.

## 6. Authorization Rules

1. Every sensitive handler checks a named permission on the authenticated principal.
2. A missing permission returns HTTP `403` with the existing API error envelope.
3. Authentication failures continue to return HTTP `401`.
4. Warehouse-scoped operations additionally verify that the user may access the target warehouse/location.
5. Admin-level role management cannot be granted by a frontend request or client-provided role value.
6. The JWT/session claims or server-side session data are authoritative; `localStorage` values are display/cache hints only.
7. Existing permissive behavior must remain behind an explicit compatibility mode during migration, then be disabled after role mappings are validated.

## 7. Session/Login Contract

The authenticated session should expose:

```json
{
  "token": "...",
  "user": {
    "id": 123,
    "username": "operator@example.com",
    "role": "receiving_operator",
    "warehouse_ids": [1]
  },
  "permissions": [
    "receiving.view",
    "receiving.start",
    "receiving.scan_box",
    "receiving.scan_item"
  ],
  "device_policy": {
    "desktop": true,
    "handheld": true,
    "camera": true
  }
}
```

The exact existing response envelope should be preserved where possible for compatibility. New fields should be additive. The client must tolerate a missing permission list during migration by using the existing role-based fallback only until enforcement is enabled.

## 8. Desktop and Handheld Views

### Shared behavior

- Both views use the same receiving endpoints and status definitions.
- A PO/session selected on desktop must be visible on handheld if the user has permission and warehouse scope.
- Receiving status, box progress, item progress, exceptions, and completion are server-derived.
- Frontend route guards mirror backend permissions but do not replace them.

### Desktop

The desktop shell exposes management pages, tables, filters, uploads, approvals, reporting, and administrative actions according to permissions. It may show richer operational context but must not expose records outside the user’s warehouse scope.

### Handheld/RF

The handheld shell exposes task-focused cards, large touch targets, minimal navigation, and scanner-first execution pages. It should show an explicit loading state, API error state, and empty state. It must not hide an eligible receiving session simply because its PO link is incomplete; an open GRN/packing-list session may use its GRN/session number as a fallback display name while preserving its server ID.

The RF route and newer scanner theme should be unified so `/receiving` does not unexpectedly present a legacy visual shell while `/dock-receiving` presents a different scanner language. The receiving workflow remains one domain flow; only the presentation and task entry point vary.

## 9. Receiving Data Contract

The receiving selector consumes a normalized list of `ReceivingChoice` records containing:

- display name (PO number, or GRN/session fallback when no PO is linked),
- supplier,
- status,
- item and quantity totals,
- active/resume session ID,
- purchase order ID when available.

The backend should eventually provide this normalized contract directly. During the first migration, the frontend may merge the existing pending-PO and packing-list session endpoints, deduplicate by PO, and retain the active session ID. This adapter must be temporary and covered by tests.

## 10. Camera Permission and Capability States

Camera use is opt-in at scanner entry and requires a secure context (`https://` or localhost). The UI must represent:

- `starting`: requesting camera access,
- `ready`: live stream attached,
- `permission_denied`: browser/user denied access,
- `no_camera`: no video input available,
- `busy`: another application owns the camera,
- `unsupported`: browser lacks the required APIs,
- `manual`: manual code entry fallback.

The app never attempts to bypass browser permission controls. It must provide a retry action and keep manual entry available. Camera errors must not expose credentials, image data, or device-sensitive details in logs.

## 11. Migration Sequence

1. Inventory existing roles, permission tables, route checks, and warehouse-scope fields.
2. Add/align the permission catalog and role mappings without changing user-visible behavior.
3. Add backend permission middleware and endpoint checks behind an explicit feature flag or compatibility setting.
4. Extend login/session metadata with permissions and device policy.
5. Add frontend permission helpers and route/control guards.
6. Normalize receiving choices and align desktop/RF receiving views.
7. Unify the RF receiving visual shell with the current scanner theme while retaining the two-phase receiving behavior.
8. Harden camera startup, status reporting, retry, and manual fallback.
9. Enable enforcement for pilot roles and validate denied actions.
10. Remove compatibility fallbacks only after migration verification.

Each step should be independently testable and deployable where practical.

## 12. Testing and Acceptance Criteria

### Backend

- Authorized role can call each permitted receiving endpoint.
- Unauthorized role receives `403` for approval, inventory adjustment, master data, and role-management actions.
- Cross-warehouse access is denied.
- Login/session response includes the authoritative role and permissions.

### Frontend

- Desktop and handheld receiving selectors show the same eligible PO/session records.
- A session without a PO link is still selectable by its GRN/session number.
- Permission-denied routes redirect or show an accessible forbidden state.
- Hidden controls are not the only authorization mechanism.
- Camera states and manual fallback are visible and actionable.

### Responsive/runtime

Verify at 320px, 390px, 768px, 1024px, and 1440px. Test current Chrome Android, Safari iOS, and a desktop browser. Test a fresh origin, a returning PWA user, denied camera permission, no camera, and manual entry.

## 13. Security and Operational Notes

- Never commit JWT secrets, ngrok tokens, database passwords, or camera data.
- Rotate any credential pasted into chat or shell history.
- Avoid trusting client-provided role, device type, warehouse ID, or permission lists.
- Preserve audit logging for approvals, receiving completion, item rejection, inventory adjustments, role changes, and device enrollment.
- Keep the ngrok tunnel as a development/testing transport only; production access requires a stable HTTPS deployment and appropriate access controls.

## 14. Open Decisions for Implementation

1. Which existing database roles map to the proposed `receiving_operator`, `qi`, and `viewer` profiles?
2. Should device policy be global per role or configurable per user/device assignment?
3. Should the first enforcement rollout be enabled for all users or only a pilot warehouse/role group?
4. Should `/receiving` become the canonical RF route, with `/dock-receiving` retained only as a compatibility redirect?
