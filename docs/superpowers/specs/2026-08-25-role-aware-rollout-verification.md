# Role-aware rollout verification

**Date:** 2026-08-25  
**Branch:** `feat/role-aware-permissions-rf-camera`  
**Plans:**  
- `docs/superpowers/plans/2026-08-24-role-aware-desktop-mobile-plan.md`  
- `docs/superpowers/plans/2026-08-25-floor-desk-shell-views.md`

## Automated verification (this session)

| Check | Result |
|---|---|
| `go test ./api/modules/rbac ./api/modules/po ./api/modules/grn ./api/modules/packinglist ./api/middleware` | PASS |
| `go build ./cmd/server` | PASS |
| `cd web && npm test` | PASS — 72 tests |
| `cd web && npx tsc --noEmit` | PASS |

## What shipped (role-aware remaining gaps)

1. **RBAC store** — sorted `Codes()`, unknown role `nil`, `UserMayAccessWarehouse`, FineGrainedPermissions-bound mapping tests (`563aa8a`).
2. **Named route enforcement** — RF per-action perms, packing-list approve, PO create/edit, masterdata/inventory writes, `POST /receiving/start` (`fa66c91`).
3. **Camera + path helpers** — insecure-context guard, `manual` state, `canOpenPermissionedPath` (`fb4a7b4`).
4. **Floor/Desk shells** — earlier commits `6a1b32e`…`af60947` (launcher, scoped desk nav, mode toggle).

## Still manual / ops (not run here)

- [ ] Docker frontend rebuild + serve against live API
- [ ] Public HTTPS / ngrok health check
- [ ] Browser role matrix (admin / wm / supervisor / qi / picker / packer / billing)
- [ ] Real-device camera matrix (permission denied, no camera, insecure HTTP)
- [ ] Confirm migration `040_permission_catalog.sql` applied on pilot DB
- [ ] Pilot with `GOWMS_RBAC=1` after validating coarse PathPermission vs always-on `RequirePermission`

## Rollout recommendation

1. Deploy code with **named `RequirePermission` always on** (already independent of `GOWMS_RBAC`).
2. Ensure `040` seed / role permissions loaded (`FineGrainedPermissions` / Roles UI) before floor users hit deny 403s.
3. Keep `GOWMS_RBAC` off until PathPermission map is reviewed (receiving was historically unmapped under coarse mode).
4. Pilot one warehouse: supervisor + receiving_operator/qi + picker; watch 403 rates on approve / scan-item / PO create.
5. Then enable floor launcher UX training; managers use UserMenu Floor/Desk switch.

## Explicitly deferred

- Full `go test ./...` across every module (focused packages verified).
- Wiring `RequireWarehouseAccess` on every warehouse-scoped handler (helper + unit tests exist; mount per-handler as needed).
- `ReceivingManagement` consuming `mergeReceivingChoices`.
- ReceivingWizard RTL theme contract test.
