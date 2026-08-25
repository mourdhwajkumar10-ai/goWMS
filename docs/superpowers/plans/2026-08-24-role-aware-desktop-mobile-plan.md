# Role-Aware Desktop and Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Core implementation complete (2026-08-25). Remaining ops/E2E items tracked in `docs/superpowers/specs/2026-08-25-role-aware-rollout-verification.md`.

**Goal:** Make goWMS use one server-authorized permission model with consistent desktop and handheld receiving flows and explicit mobile camera permission states.

**Architecture:** Keep the existing JWT authentication and Fiber routes. Add a server-authoritative permission resolver and warehouse-scope checks at the API boundary, expose additive session metadata to the frontend, and use shared receiving data with separate desktop/handheld presentation shells. Camera access remains browser-controlled and falls back to manual scanning.

**Tech Stack:** Go 1.23, Fiber v2, pgx v5, PostgreSQL 16, React 18, TypeScript, Vite, Vitest, Testing Library, existing ZXing/BarcodeDetector integrations.

**Spec:** `docs/superpowers/specs/2026-08-24-role-aware-desktop-mobile-design.md`

## Global Constraints

- Backend authorization is authoritative; frontend route/button hiding is not security.
- Preserve the existing JWT authentication and API response envelope; add fields compatibly.
- Do not store camera images or video.
- Use existing dependencies before adding new ones.
- Do not expose secrets, tokens, passwords, or camera data in source, logs, or tests.
- Maintain the current `frebuff` branch and do not push or deploy externally.
- Preserve existing receiving behavior while unifying data contracts and presentation.
- Every task must add or update tests and leave the project buildable.

---

## File Map

### Backend

- Modify `api/middleware/auth.go` and related middleware files: authenticated principal context and permission checks.
- Modify `api/modules/rbac/*`: existing roles/permissions persistence and lookup conventions.
- Modify `api/modules/auth/*`: additive login/session response metadata.
- Modify protected module handlers such as `api/modules/grn/*`, `api/modules/packinglist/*`, `api/modules/po/*`, `api/modules/inventory/*`, and `api/modules/masterdata/*`: named permission and warehouse-scope checks.
- Create `api/middleware/permissions.go`: reusable permission and warehouse-scope enforcement helpers if existing middleware does not already provide the boundary.
- Create `api/middleware/permissions_test.go`: unit tests for allow/deny/scope behavior.
- Add a numbered migration only when the existing RBAC tables cannot represent the catalog or assignments.

### Frontend

- Modify `web/src/services/api.ts`: session metadata types and safe session persistence.
- Modify `web/src/utils/roleAccess.ts`: permission-aware route helpers while retaining compatibility fallback.
- Create `web/src/utils/permissions.ts`: `hasPermission`, `canOpenPermissionedPath`, and device-policy helpers.
- Modify `web/src/App.tsx` and `web/src/components/Layout.tsx`: permission-aware shell/navigation selection.
- Modify `web/src/pages/ReceivingWizard.tsx`: shared normalized receiving choices and scanner-themed RF presentation.
- Modify `web/src/pages/ReceivingManagement.tsx`: consume the same receiving contract where appropriate.
- Modify `web/src/components/CameraScanner.tsx`: explicit camera state machine, permission messaging, retry, and manual fallback.
- Modify `web/src/utils/receivingData.ts`: canonical receiving-choice normalization and camera state types.
- Add tests under `web/src/__tests__/` for permission helpers, receiving parity, and camera states.

### Documentation

- `docs/superpowers/specs/2026-08-24-role-aware-desktop-mobile-design.md`: approved architecture.
- This plan: implementation sequence and verification contract.

---

## Task 1: Inventory Existing Authorization and Role Data

**Inventory result from the current codebase:**

- Authentication is `api/middleware.Auth`, which stores `user_id` and `role` in Fiber locals from JWT claims.
- Permissions are stored in `roles` and `role_permissions`, cached by `api/modules/rbac.Store` and exposed by `rbac.HasPermission`.
- Path-level enforcement is `api/middleware.RBACEnforced`, enabled by `GOWMS_RBAC=1`; it maps module segments to existing codes such as `grn.access`, `masters.access`, and `roles.manage`.
- Existing role codes are `admin`, `supervisor`, `picker`, `packer`, `qi`, `dispatcher`, `wm`, `driver`, and `billing`; there is currently no `receiving_operator` or `viewer` seed role.
- Existing high-level access profiles expand to coarse module permissions, so the first implementation should extend this model rather than introduce a parallel fine-grained resolver.
- Warehouse IDs are present on employee/user and operational records, but a single existing generic warehouse-scope guard was not found; scope enforcement needs a focused design during Task 4.
- The frontend currently persists token/role in localStorage and uses `isHandheld()` plus role-based paths; permissions are not yet persisted in the login response.


**Files:**
- Inspect: `api/middleware/*`, `api/modules/rbac/*`, `api/modules/auth/*`, `migrations/*`, `web/src/utils/roleAccess.ts`
- Test: existing backend and frontend tests discovered during implementation.

**Produces:** A concrete mapping of existing role names, permission storage, authenticated context values, warehouse identifiers, and currently enforced route permissions. No runtime behavior changes.

- [ ] **Step 1: Locate current permission and role resolution code**

Run:

```bash
rg -n "permission|permissions|role|RBAC|warehouse_id|user_id" api/middleware api/modules/rbac api/modules/auth migrations
```

Record the existing table and function names in the task notes or implementation commit description. Do not create duplicate storage if an existing table already supports the catalog.

- [ ] **Step 2: Locate existing protected-route behavior**

Run:

```bash
rg -n "RBAC|Auth|Require|permission|Forbidden|StatusForbidden" api cmd
```

List which routes currently rely only on authentication and which already enforce permissions.

- [ ] **Step 3: Locate current frontend role/session persistence**

Run:

```bash
rg -n "setSession|getRole|getToken|localStorage|homePathForRole|canOpenPath" web/src
```

Confirm the compatibility fields that must remain intact.

- [ ] **Step 4: Run baseline verification**

Run:

```bash
docker run --rm -v "$PWD":/src -w /src golang:1.23-alpine go test ./...
cd web && npm test -- --run
npm run build
```

Expected baseline: backend tests pass in the Go 1.23 container; frontend build passes; the full frontend Vitest run currently has an existing `jsdom@30`/`undici@8` worker error (`webidl.util.markAsUncloneable`) before the existing UI test runs. Keep that runner issue documented and use focused Node-environment tests until dependency maintenance is approved.

- [ ] **Step 5: Preserve the inventory result in the implementation notes or design document.**

Do not commit generated output or secrets. If no files changed, leave the working tree untouched.

---

## Task 2: Extend the Existing RBAC Permission Store

**Files:**
- Modify: `api/modules/rbac/catalog.go`, `api/modules/rbac/cache.go`, and `api/modules/rbac/guard.go` to extend the existing permission store and guards.
- Create: `api/modules/rbac/permissions_test.go` for pure allow/deny behavior.
- Do not create a second middleware resolver; the existing `rbac.Global()` cache and `HasPermission` guard are the canonical authorization boundary.

**Interfaces:**

```go
func HasPermission(c *fiber.Ctx, permission string) bool
func (s *rbac.Store) Has(role, permission string) bool
func RequireWarehouseAccess(c *fiber.Ctx, warehouseID int) error
```

The implementation must extend the existing RBAC schema and role conventions. The current store already grants admin bypass and uses `roles` plus `role_permissions`; preserve those behaviors while adding explicit warehouse-scope checks.

- [ ] **Step 1: Write failing permission-store and warehouse-scope tests**

Test these behaviors using the project’s existing database test pattern or a focused pure resolver seam:

```go
func TestHasPermissionReturnsFalseForUnassignedPermission(t *testing.T) {}
func TestHasPermissionReturnsTrueForAssignedPermission(t *testing.T) {}
func TestRequireWarehouseAccessRejectsForeignWarehouse(t *testing.T) {}
```

Tests must assert behavior and HTTP status (`403`) rather than implementation details.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run:

```bash
go test ./api/modules/rbac -run 'TestHasPermission|TestRequireWarehouseAccess' -v
```

Expected: FAIL because the resolver functions or behavior do not yet exist.

- [ ] **Step 3: Extend the existing store and guard**

Use the existing `rbac.Store` cache and `HasPermission` guard. Add the smallest warehouse-scope helper needed by the current schema, deriving the user and target warehouse from server-side records. Do not accept role or permission values from request bodies as authority.

- [ ] **Step 4: Return the existing error envelope**

Authenticated-but-denied requests return `403`; missing or invalid authentication remains `401`. Keep the current admin bypass and explicit `GOWMS_RBAC` compatibility behavior documented.

- [ ] **Step 5: Run focused tests and backend type/build checks**

Run:

```bash
go test ./api/modules/rbac -run 'TestHasPermission|TestRequireWarehouseAccess' -v
go test ./...
```

Expected: all targeted and full backend tests pass.

- [ ] **Step 6: Commit the authorization foundation**

```bash
git add api/middleware api/modules/rbac
git commit -m "feat: add server-side permission resolution"
```

Do not stage unrelated pre-existing files.

---

## Task 3: Define and Seed the Permission Catalog and Role Mappings

**Files:**
- Modify: existing RBAC seed/catalog implementation found in Task 1.
- Create: `migrations/040_permission_catalog.sql` only if the existing RBAC schema cannot represent the catalog.
- Create/modify: backend RBAC tests.

**Interfaces:**

Permission names must include:

```text
receiving.view
receiving.start
receiving.scan_box
receiving.scan_item
receiving.reject_item
receiving.complete
receiving.approve
po.view
po.create
po.edit
inventory.view
inventory.adjust
masterdata.manage
reports.view
users.manage
roles.manage
notifications.view
```

- [ ] **Step 1: Write failing role-mapping tests**

Cover at least:

```go
func TestReceivingOperatorCanScanButCannotApprove(t *testing.T) {}
func TestSupervisorCanApproveReceiving(t *testing.T) {}
func TestViewerCannotMutateReceiving(t *testing.T) {}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
go test ./api/modules/rbac -run 'TestReceivingOperator|TestSupervisor|TestViewer' -v
```

Expected: FAIL until catalog and assignments exist.

- [ ] **Step 3: Add catalog/mappings using existing schema conventions**

Map existing roles (`admin`, `wm`, `supervisor`, `qi`, `picker`, `packer`, `dispatcher`, `driver`, `billing`) without renaming them. Add `receiving_operator` and `viewer` when the project’s role model supports new roles; otherwise document the equivalent existing-role mapping before seeding.

- [ ] **Step 4: Make seeding idempotent**

Use unique keys and `ON CONFLICT`/existing idempotent patterns. Never overwrite administrator-customized permissions on every startup.

- [ ] **Step 5: Run migration/RBAC tests**

Run:

```bash
go test ./api/modules/rbac -v
go test ./...
```

- [ ] **Step 6: Commit catalog and mappings**

```bash
git add migrations api/modules/rbac
git commit -m "feat: define warehouse permission catalog"
```

---

## Task 4: Enforce Permissions on Sensitive API Routes

**Files:**
- Modify: `cmd/server/main.go` when route middleware must be attached centrally; otherwise attach checks in the owning module.
- Modify: only the exact handlers identified during Task 1 in `api/modules/grn`, `api/modules/packinglist`, `api/modules/po`, `api/modules/inventory`, `api/modules/masterdata`, and `api/modules/rbac`; do not bulk-edit module files.
- Add tests alongside each affected module using existing test conventions.

**Interfaces:**

Sensitive operations must require:

```text
GET receiving/pending-pos             receiving.view
POST receiving/start                  receiving.start
POST receiving/scan-box                receiving.scan_box
POST receiving/scan-item               receiving.scan_item
POST receiving/reject-item             receiving.reject_item
POST receiving/complete-box            receiving.complete
POST packing-list/:id/approve          receiving.approve
POST/PUT/DELETE PO mutations           po.create / po.edit
POST inventory adjustments             inventory.adjust
master-data mutations                  masterdata.manage
role mutations                         roles.manage
```

- [ ] **Step 1: Write failing endpoint authorization tests**

For each high-risk route, add one allow and one deny case. Assert `401` for missing auth, `403` for authenticated-but-denied, and success for an authorized role.

- [ ] **Step 2: Run tests and verify they fail before enforcement**

Run the module-specific commands, for example:

```bash
go test ./api/modules/grn ./api/modules/packinglist ./api/modules/po ./api/modules/inventory -v
```

Expected: denied-role cases fail until middleware is attached.

- [ ] **Step 3: Attach named permission checks at route/handler boundaries**

Prefer route-level middleware where one permission covers an entire route group. Use handler-level checks where the required permission varies by action. Validate warehouse scope using server-derived target IDs, not blindly trusted request fields.

- [ ] **Step 4: Preserve compatibility mode explicitly**

If current production data lacks assignments, add an explicit configuration gate such as the existing RBAC feature switch. Log whether enforcement is enabled, but never log tokens or passwords. Default behavior must be chosen deliberately and documented.

- [ ] **Step 5: Run backend tests and build**

Run:

```bash
go test ./...
go build ./cmd/server
```

- [ ] **Step 6: Commit route enforcement**

```bash
git add cmd/server api/modules
git commit -m "feat: enforce permissions on warehouse mutations"
```

---

## Task 5: Extend Login Metadata and Frontend Permission Helpers

**Files:**
- Modify: `api/modules/auth/*`
- Modify: `web/src/services/api.ts`
- Create: `web/src/utils/permissions.ts`
- Modify: `web/src/utils/roleAccess.ts`
- Add: `web/src/__tests__/permissions.test.ts`

**Interfaces:**

```ts
export interface SessionMetadata {
  token: string
  role: string
  permissions?: string[]
  warehouse_ids?: number[]
  device_policy?: { desktop: boolean; handheld: boolean; camera: boolean }
}

export function hasPermission(permission: string): boolean
export function canUseDevice(device: 'desktop' | 'handheld' | 'camera'): boolean
```

- [ ] **Step 1: Write failing frontend permission tests**

Cover permission allow/deny, absent permission compatibility, and device policy decisions.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
cd web && npm test -- --run src/__tests__/permissions.test.ts
```

Expected: FAIL because helpers/session metadata do not exist.

- [ ] **Step 3: Add additive auth response metadata**

Return permissions and device policy from the server using the existing login response envelope. Preserve `token` and `role` fields exactly. Store metadata in a session-safe way; do not trust localStorage values for backend authorization.

- [ ] **Step 4: Implement frontend helpers**

Use the server-provided permission list when present. During compatibility mode only, retain the existing role fallback. Make the fallback easy to remove after rollout.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd web && npm test -- --run src/__tests__/permissions.test.ts
npm run build
```

- [ ] **Step 6: Commit the session contract**

```bash
git add api/modules/auth web/src/services/api.ts web/src/utils/permissions.ts web/src/utils/roleAccess.ts web/src/__tests__/permissions.test.ts
git commit -m "feat: expose session permissions to the client"
```

---

## Task 6: Align Desktop and Handheld Receiving Data

**Files:**
- Modify: `web/src/utils/receivingData.ts`
- Modify: `web/src/pages/ReceivingWizard.tsx`
- Modify: `web/src/pages/ReceivingManagement.tsx` only where needed to consume the normalized shape.
- Modify: the receiving API endpoint when a backend-normalized contract is selected; otherwise keep the temporary adapter in `receivingData.ts`.
- Add: `web/src/__tests__/receivingData.test.ts`.

**Interfaces:**

```ts
export interface ReceivingChoice {
  id: number
  name: string
  supplier_name: string
  status: string
  item_count: number
  total_qty: number
  resume_session_id?: number | null
  purchase_order_id?: number
}

export function mergeReceivingChoices(
  purchaseOrders: Array<Record<string, any>>,
  sessions: Array<Record<string, any>>,
): ReceivingChoice[]
```

- [ ] **Step 1: Add failing parity tests**

Cover a normal linked PO, a PO omitted from the pending-PO endpoint but present in an open session, a blank-PO session displayed by GRN number, deduplication, and an API error state.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
cd web && npm test -- --run src/__tests__/receivingData.test.ts
```

Expected: FAIL for any missing normalization behavior.

- [ ] **Step 3: Implement normalized data loading**

Use the same server sources for desktop and mobile. For the current implementation, keep the adapter in `receivingData.ts`, deduplicate by PO/session, and preserve active session IDs. Do not silently discard an open session with an incomplete PO link.

- [ ] **Step 4: Add loading, error, and empty states**

The mobile selector must distinguish “loading,” “failed to load,” and “no eligible receiving work.” Keep retry behavior accessible.

- [ ] **Step 5: Run tests and build**

```bash
cd web && npm test -- --run src/__tests__/receivingData.test.ts
npm run build
```

- [ ] **Step 6: Commit receiving parity**

```bash
git add web/src/utils/receivingData.ts web/src/pages/ReceivingWizard.tsx web/src/pages/ReceivingManagement.tsx web/src/__tests__/receivingData.test.ts
 git commit -m "fix: align desktop and handheld receiving choices"
```

---

## Task 7: Unify the RF Visual Shell Without Changing Receiving Behavior

**Files:**
- Modify: `web/src/pages/ReceivingWizard.tsx`
- Modify: `web/src/components/ScannerLayout.tsx` if composition is needed.
- Modify: `web/src/styles/receiving-wizard.css` and/or `web/src/styles/scanner.css`.
- Modify: `web/src/components/FloorLayout.tsx` and `web/src/utils/roleAccess.ts` when `/receiving` is selected as the canonical RF route; otherwise preserve both route links with explicit labels.
- Add/update: focused receiving UI tests.

**Interfaces:**

The receiving state machine remains:

```text
select_po → scan_box → scan_items → complete
```

Only layout, typography, spacing, button treatment, responsive behavior, and camera presentation change.

- [ ] **Step 1: Write failing UI tests for the RF theme contract**

Assert that the mobile receiving route renders the scanner-themed header, PO cards, camera area, manual entry fallback, and phase controls without removing the existing receiving actions.

- [ ] **Step 2: Run focused UI tests and verify failure**

```bash
cd web && npm test -- --run src/__tests__/ReceivingWizard.test.tsx
```

Expected: FAIL until the theme contract is implemented.

- [ ] **Step 3: Apply the scanner theme through existing CSS tokens/components**

Do not create a second receiving business flow. Reuse the existing scanner tokens, large touch targets, progress indicators, and accessible labels. Avoid desktop-only tables inside the handheld shell.

- [ ] **Step 4: Preserve route compatibility**

Keep existing links working. If `/dock-receiving` becomes a compatibility route or redirect, prove that current role navigation and deep links still work before changing it.

- [ ] **Step 5: Run UI tests and build**

```bash
cd web && npm test -- --run src/__tests__/ReceivingWizard.test.tsx
npm run build
```

- [ ] **Step 6: Commit RF presentation changes**

```bash
git add web/src/pages/ReceivingWizard.tsx web/src/components/ScannerLayout.tsx web/src/styles/receiving-wizard.css web/src/styles/scanner.css web/src/components/FloorLayout.tsx web/src/utils/roleAccess.ts web/src/__tests__/ReceivingWizard.test.tsx
git commit -m "feat: unify the handheld receiving scanner theme"
```

---

## Task 8: Harden Camera Permission and Manual Fallback

**Files:**
- Modify: `web/src/components/CameraScanner.tsx`
- Modify: `web/src/utils/receivingData.ts` or create `web/src/utils/camera.ts` if state logic deserves isolation.
- Add: `web/src/__tests__/camera.test.tsx` or focused pure camera-state tests.

**Interfaces:**

```ts
type CameraState =
  | 'starting'
  | 'ready'
  | 'permission_denied'
  | 'no_camera'
  | 'busy'
  | 'unsupported'
  | 'manual'

export function cameraErrorMessage(name?: string): string
```

- [ ] **Step 1: Write failing camera state tests**

Cover `NotAllowedError`, `NotFoundError`, `NotReadableError`, `SecurityError`, missing `mediaDevices`, successful stream startup, retry, and manual entry remaining available.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
cd web && npm test -- --run src/__tests__/camera.test.tsx
```

Expected: FAIL until the state mapping and UI behavior exist.

- [ ] **Step 3: Implement explicit camera state transitions**

Request camera access only when the scanner is active. Set `ready` only after the video element has a stream and playback has been attempted. Set `manual`/error states with actionable text when access fails. Keep stop/retry cleanup idempotent.

- [ ] **Step 4: Preserve browser security requirements**

Require `window.isSecureContext` or localhost. Never attempt permission bypasses. Do not log stream contents, device labels, or credentials.

- [ ] **Step 5: Run tests and typecheck**

```bash
cd web && npm test -- --run src/__tests__/camera.test.tsx
npm run build
```

- [ ] **Step 6: Commit camera handling**

```bash
git add web/src/components/CameraScanner.tsx web/src/utils/receivingData.ts web/src/__tests__/camera.test.tsx
git commit -m "fix: make mobile camera failures recoverable"
```

---

## Task 9: Add Permission-Aware Navigation and Controls

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Layout.tsx`
- Modify: `web/src/components/FloorLayout.tsx`
- Modify: `web/src/utils/roleAccess.ts`
- Modify: `web/src/utils/permissions.ts`
- Add: `web/src/__tests__/routeAccess.test.ts`.

- [ ] **Step 1: Write failing route/control tests**

Assert that receiving operators can reach RF receiving, billing cannot reach scanner routes by default, and admin controls are hidden for non-admins. Also assert that direct navigation is blocked in the UI while backend tests remain the security authority.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
cd web && npm test -- --run src/__tests__/routeAccess.test.ts
```

- [ ] **Step 3: Add permission-aware route guards**

Use permission names, not only device detection. Keep the existing role-based fallback while compatibility mode is active. Show an accessible forbidden state or redirect to the role home.

- [ ] **Step 4: Filter desktop and handheld navigation**

Use the device policy only to choose presentation and available task navigation. Do not let a mobile client request a privileged action just because the button is hidden.

- [ ] **Step 5: Run tests and build**

```bash
cd web && npm test -- --run src/__tests__/routeAccess.test.ts
npm run build
```

- [ ] **Step 6: Commit frontend access controls**

```bash
git add web/src/App.tsx web/src/components/Layout.tsx web/src/components/FloorLayout.tsx web/src/utils/roleAccess.ts web/src/utils/permissions.ts web/src/__tests__/routeAccess.test.ts
git commit -m "feat: tailor navigation to user permissions"
```

---

## Task 10: End-to-End Role, Device, Receiving, and HTTPS Verification

**Files:**
- Modify: tests or docs only for confirmed gaps.
- Inspect: `docker-compose.yml`, `Dockerfile`, `web/vite.config.ts`, ngrok runtime configuration.

- [ ] **Step 1: Run all backend tests and build**

```bash
go test ./...
go build ./cmd/server
```

- [ ] **Step 2: Run all frontend tests and build**

```bash
cd web && npm test -- --run
npm run build
```

- [ ] **Step 3: Rebuild the served Docker frontend**

```bash
docker compose up -d --build api
```

This is a local development operation. Confirm the container becomes healthy before browser verification.

- [ ] **Step 4: Verify API health and public HTTPS**

```bash
curl -fsS http://localhost:8080/api/health
curl -fsS https://parabola-baffle-childless.ngrok-free.dev/api/health
```

Expected: both return `{"status":"ok"}`.

- [ ] **Step 5: Verify role matrix manually in a browser**

For each pilot role:

1. Log in on desktop.
2. Confirm allowed navigation and controls.
3. Open the same receiving work on handheld HTTPS.
4. Confirm PO/session parity.
5. Attempt a forbidden API action and confirm `403`.

- [ ] **Step 6: Verify camera states on real devices**

Test current Chrome Android and Safari iOS over the public HTTPS URL:

- first permission prompt,
- allow permission and live stream,
- deny permission and manual fallback,
- browser site settings changed to allow,
- camera busy/no camera,
- hard refresh/PWA reload.

- [ ] **Step 7: Review for secrets and unrelated changes**

```bash
git diff --check
git status --short
git diff --stat
```

Ensure no ngrok token, JWT secret, database password, or generated `node_modules`/build artifact is staged.

- [ ] **Step 8: Record rollout recommendation**

Document the pilot role/warehouse, compatibility flag state, test devices, known limitations, and rollback switch. Do not claim production readiness until every acceptance criterion is evidenced.

---

## Handoff Notes

Implementation should proceed task-by-task with a fresh test cycle and review checkpoint after each task. The current working tree already contains unrelated changes; stage only files directly related to the task being executed. Do not reset, stash, commit, push, or deploy unrelated work.
