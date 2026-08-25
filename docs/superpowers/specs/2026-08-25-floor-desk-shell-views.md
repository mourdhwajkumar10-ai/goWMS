# Floor and Desk Shell Views

**Date:** 2026-08-25  
**Status:** Implemented  
**Related:** `docs/superpowers/specs/2026-08-24-role-aware-desktop-mobile-design.md` (§8 Desktop and Handheld Views)

## 1. Goal

Give warehouse workers a presentation that matches how they work: a **Floor shell** for task execution (few large actions) and a **Desk shell** for management (scoped sidebar). One login identity works on both; shell follows device by default and can be overridden. Ground staff must not see the full ERP left bar.

## 2. Problem

- Desk roles (`admin`, `wm`, `supervisor`) currently get the full ~40-item desk sidebar via `navPathsForRole` returning `null`.
- Floor roles get fewer paths but still lack a clear task home on handheld.
- The same person (e.g. manager) uses a PC and a phone/RF gun; device detection alone is brittle and there is no explicit Floor/Desk switch in the UI.
- Hiding nav is not security; this spec covers **presentation and route visibility**. Server-side permission enforcement remains owned by the role-aware RBAC plan.

## 3. Principles

1. **Capability ≠ presentation.** Permissions/role answer “may they?”; shell answers “how does it look?”
2. **One identity, two shells.** No separate mobile accounts.
3. **Floor home = task launcher**, not a long list. Drawer is secondary.
4. **Desk sidebar is permission- or role-scoped**, not “desk role = every Masters link.”
5. **Device default + explicit override.** `isHandheld()` / `setDeviceOverride` already exist; surface override in UserMenu.
6. **Backend remains authoritative** for mutations; this work only changes UI and client route guards.

## 4. Shell selection

```text
effectiveShell =
  explicit override (gowms_device) if set
  else auto: touch && max-width ≤ 1024 → floor
  else desk

If device_policy.handheld === false → never floor
If device_policy.desktop === false → never desk
(If both blocked, prefer desk + blocked message — edge case)
```

`AppShell` chooses `FloorLayout` vs `Layout` from `effectiveShell`, not raw `isHandheld()` alone once override helpers are unified.

## 5. Floor shell

### Task launcher (new home)

- Route: `/` (or dedicated `/floor` that RoleHome redirects to when shell is floor).
- Shows large tiles for tasks the user may open, derived from `floorPathsForDevice(role)` intersected with optional permission checks when a permission list is stored.
- Tile set examples:
  - picker: Pick, Stock Scan, Cycle Count, Quick Count
  - qi / receiving: RF Receiving, Dock Receiving, Item Verifier, Box Verification, Putaway, Exceptions
  - packer: Pack
  - desk roles on floor: all handheld operational tiles they can use
- Max primary tiles recommended: ~8; overflow under “More” only if needed.
- Empty state: “No floor tasks for your role” + link to request desk mode if `canUseDevice('desktop')`.

### Drawer

- Same path list as launcher (no extra admin/masters on floor).
- Keep hamburger + notifications + user menu.

## 6. Desk shell

### Sidebar scoping

Stop treating `isDeskRole` as “show every section.”

| Role | Default desk visibility |
|---|---|
| `admin` | Full sidebar (current) |
| `wm` | Operations + Stock + Buying/Selling as today; Masters without Employees/Roles unless permission |
| `supervisor` | Inward + Stock execution/ops + Exceptions/Follow-up/Reports; hide Employees, Roles, Analytics admin, and masterdata manage pages unless permission |
| Floor roles forced onto desk | Only `navPathsForRole` paths (already) |

When `getPermissions()` is non-empty, each nav item requires at least one mapped permission (see plan catalog). When empty, use role fallback tables (compatibility).

### Progressive disclosure

- Sections with zero visible items are omitted.
- Optional later: collapse Masters by default for non-admin — not required in v1 if filtering is enough.

## 7. Mode toggle

In `UserMenu` (both shells):

- Label: **Use floor view** / **Use desk view**
- Calls `setDeviceOverride('handheld' | 'desk')` then `window.location.assign(homePathForSession(role))` or navigate + soft reload of shell (full reload is acceptable for v1 to remount `AppShell`).
- **Use automatic** clears override via `setDeviceOverride(null)`.
- Respect `canUseDevice`: hide Floor option if handheld denied; hide Desk if desktop denied.

## 8. Out of scope (this plan)

- New JWT/auth provider
- Full backend permission middleware rollout (see role-aware plan)
- PIN/badge login
- Native mobile app
- Station/dock pinning at login
- Redesigning every page’s internal layout

## 9. Acceptance criteria

- [x] Picker on handheld sees a launcher with ≤5 primary tiles and no Masters/Buying tree.
- [x] Supervisor on desktop does not see Employees/Roles in the sidebar (unless granted).
- [x] WM/admin on desktop retain operational breadth; admin retains Employees/Roles.
- [x] Same user can switch Floor ↔ Desk from UserMenu; choice persists in `localStorage` until cleared.
- [x] Floor drawer and launcher show the same allowed paths.
- [x] Existing Vitest suites for permissions/routeAccess still pass; new tests cover launcher filtering and shell override helpers.
