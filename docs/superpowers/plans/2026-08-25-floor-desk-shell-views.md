# Floor and Desk Shell Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship a Floor task launcher and scoped Desk sidebar so ground staff are not overwhelmed, while managers keep breadth on desk and can switch Floor/Desk on the same login.

**Architecture:** Keep one auth identity. Extend `roleAccess` / `deviceDetect` / `permissions` helpers to drive (1) shell selection with explicit override, (2) a Floor home of large task tiles, (3) desk nav items filtered by role fallback or stored permissions. Presentation only — backend RBAC enforcement stays with `docs/superpowers/plans/2026-08-24-role-aware-desktop-mobile-plan.md`.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, existing Lucide icons, `scanner.css` / `index.css` tokens.

**Spec:** `docs/superpowers/specs/2026-08-25-floor-desk-shell-views.md`  
**Related:** `docs/superpowers/specs/2026-08-24-role-aware-desktop-mobile-design.md` (§8)

## Global Constraints

- Frontend hiding is not security; do not claim API protection in this work.
- Prefer existing helpers (`isHandheld`, `setDeviceOverride`, `floorPathsForDevice`, `hasPermission`, `canUseDevice`) over new state libraries.
- When `getPermissions()` is empty, keep role-based compatibility fallbacks (do not lock users out mid-migration).
- Do not push remotes or change git config.
- Every task adds/updates Vitest coverage where logic is pure; leave `npm test` and `web` typecheck green.
- Do not redesign RF page internals (ReceivingWizard scan UI) in this plan.

---

## File Map

### Create

- `web/src/utils/navCatalog.ts` — single catalog of desk nav items + floor tiles with path, label, section, role fallback, optional permission keys.
- `web/src/utils/shellMode.ts` — `getEffectiveShell()`, `canSwitchToShell()`, thin wrapper over deviceDetect + device_policy.
- `web/src/pages/FloorHome.tsx` — Floor task launcher page.
- `web/src/components/FloorTaskLauncher.tsx` — presentational tile grid (optional split if `FloorHome` stays thin).
- `web/src/__tests__/navCatalog.test.ts` — filtering for picker / supervisor / admin.
- `web/src/__tests__/shellMode.test.ts` — override + policy behavior.

### Modify

- `web/src/utils/roleAccess.ts` — re-export or delegate path lists to `navCatalog` where needed; keep public APIs stable (`navPathsForRole`, `floorPathsForDevice`, `homePathForRole`, `isDeskRole`).
- `web/src/utils/deviceDetect.ts` — ensure override + clear APIs are documented; add `getDeviceOverride()` if missing.
- `web/src/App.tsx` — `AppShell` uses `getEffectiveShell()`; floor home route wiring.
- `web/src/components/FloorLayout.tsx` — drawer built from catalog; default outlet home is FloorHome.
- `web/src/components/Layout.tsx` — build sidebar from catalog filters instead of hard-coded “desk = all”.
- `web/src/components/UserMenu.tsx` — Floor / Desk / Automatic toggle.
- `web/src/styles/scanner.css` — launcher tile styles under `.floor-launcher*` (match existing scanmaster tokens).

### Out of scope files

- Backend middleware / migrations (sister plan).
- `ReceivingWizard.tsx` scan UI (already redesigned).

---

### Task 1: Nav catalog + filter helpers

**Files:**
- Create: `web/src/utils/navCatalog.ts`
- Create: `web/src/__tests__/navCatalog.test.ts`
- Modify: `web/src/utils/roleAccess.ts` (keep exports; optionally source `HANDHELD_*` from catalog)

**Interfaces:**
- Produces:
  ```ts
  export type NavSectionId = 'home' | 'inward' | 'stock' | 'buying' | 'selling' | 'masters' | 'floor'

  export type NavItemDef = {
    to: string
    label: string
    section: NavSectionId
    /** If permissions stored, any of these grants visibility. Empty = path-only / role fallback. */
    permissions?: string[]
    /** Roles that see this item when permissions list is empty. `'*'` = all authenticated. */
    rolesFallback: string[] | '*'
    /** Show on floor launcher / floor drawer */
    floor?: boolean
    /** Desk sidebar only */
    desk?: boolean
  }

  export function listDeskNavItems(role: string | null, permissions: string[]): NavItemDef[]
  export function listFloorTiles(role: string | null, permissions: string[]): NavItemDef[]
  ```
- Consumes: `hasPermission` semantics — when `permissions.length === 0`, use `rolesFallback`; when non-empty, item visible if any `permissions` entry matches via existing `hasPermission` **or** direct includes (prefer calling `hasPermission` after `storePermissions` in tests).

- [x] **Step 1: Write failing tests for catalog filters**

Create `web/src/__tests__/navCatalog.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest'
import { listDeskNavItems, listFloorTiles } from '../utils/navCatalog'
import { storePermissions, clearPermissions } from '../utils/permissions'

function resetStorage() {
  const store = new Map<string, string>()
  // @ts-ignore
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: () => null,
  }
}

beforeEach(() => {
  resetStorage()
  clearPermissions()
})

describe('listFloorTiles', () => {
  it('picker sees pick-focused tiles only', () => {
    const tiles = listFloorTiles('picker', [])
    const paths = tiles.map(t => t.to)
    expect(paths).toContain('/pick')
    expect(paths).not.toContain('/pack')
    expect(paths).not.toContain('/employees')
  })

  it('supervisor on floor sees operational handheld tiles', () => {
    const paths = listFloorTiles('supervisor', []).map(t => t.to)
    expect(paths).toContain('/receiving')
    expect(paths).not.toContain('/roles')
  })
})

describe('listDeskNavItems', () => {
  it('supervisor without permissions list does not see roles or employees', () => {
    const paths = listDeskNavItems('supervisor', []).map(t => t.to)
    expect(paths).not.toContain('/roles')
    expect(paths).not.toContain('/employees')
    expect(paths).toContain('/exceptions')
  })

  it('admin sees roles and employees', () => {
    const paths = listDeskNavItems('admin', []).map(t => t.to)
    expect(paths).toContain('/roles')
    expect(paths).toContain('/employees')
  })

  it('stored permissions gate masters manage', () => {
    storePermissions(['receiving.view', 'reports.view'])
    const paths = listDeskNavItems('wm', ['receiving.view', 'reports.view']).map(t => t.to)
    expect(paths).not.toContain('/items')
  })
})
```

- [x] **Step 2: Run tests — expect fail**

Run: `cd web && npm test -- src/__tests__/navCatalog.test.ts`  
Expected: FAIL module not found / exports missing.

- [x] **Step 3: Implement `navCatalog.ts`**

Populate `NAV_CATALOG` from current `Layout.tsx` `sections` + `FloorLayout.tsx` `floorPages`. Rules when `permissions` arg is empty:

- `admin`: all desk items with `desk !== false`
- `wm`: all desk except `to` in `['/roles']`; `/employees` only if rolesFallback includes wm (default: exclude roles; include employees only if current product shows it for wm — **match Layout `canSeeAdminNav`**: admin/wm/supervisor see adminOnly items today — **change**: supervisor loses `/employees` and `/roles`; wm keeps `/employees`, loses `/roles` unless admin)
- `supervisor`: exclude `/employees`, `/roles`, `/analytics` (optional: keep analytics if already used — **exclude `/roles` and `/employees` only** to minimize surprise)
- floor roles: only items whose `to` is in current `navPathsForRole(role)`

When `permissions.length > 0`: show item if `permissions` includes `'*'` OR any of `item.permissions` is in the list; if `item.permissions` omitted, fall back to role rules.

Floor tiles: `floor: true` items whose path is in `floorPathsForDevice(role)` when permissions empty; else permission intersection.

Keep `roleAccess.ts` public functions working — either reimplement them to call catalog or leave tables and make catalog the single source; prefer **catalog as source**, thin wrappers in `roleAccess.ts`.

- [x] **Step 4: Re-run tests — expect pass**

Run: `cd web && npm test -- src/__tests__/navCatalog.test.ts`  
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add web/src/utils/navCatalog.ts web/src/utils/roleAccess.ts web/src/__tests__/navCatalog.test.ts
git commit -m "$(cat <<'EOF'
feat: add nav catalog for desk and floor filtering

Centralize path/label/role/permission metadata so shells can share one source of truth.
EOF
)"
```

---

### Task 2: Shell mode helpers

**Files:**
- Create: `web/src/utils/shellMode.ts`
- Modify: `web/src/utils/deviceDetect.ts` (add `getDeviceOverride()`)
- Create: `web/src/__tests__/shellMode.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ShellKind = 'floor' | 'desk'

  export function getDeviceOverride(): 'handheld' | 'desk' | null
  export function getEffectiveShell(): ShellKind
  export function canSwitchToShell(shell: ShellKind): boolean
  ```
- Consumes: `isHandheld` detection path, `setDeviceOverride`, `canUseDevice` from `permissions.ts`

- [x] **Step 1: Write failing shellMode tests**

```ts
// @vitest-environment node
import { describe, expect, it, beforeEach } from 'vitest'
import { setDeviceOverride } from '../utils/deviceDetect'
import { getEffectiveShell, canSwitchToShell } from '../utils/shellMode'
import { storeDevicePolicy, clearPermissions } from '../utils/permissions'

function resetStorage() {
  const store = new Map<string, string>()
  // @ts-ignore
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: () => null,
  }
}

beforeEach(() => {
  resetStorage()
  clearPermissions()
  setDeviceOverride(null)
})

it('override handheld forces floor shell', () => {
  setDeviceOverride('handheld')
  expect(getEffectiveShell()).toBe('floor')
})

it('override desk forces desk shell', () => {
  setDeviceOverride('desk')
  expect(getEffectiveShell()).toBe('desk')
})

it('blocks floor when device_policy.handheld is false', () => {
  storeDevicePolicy({ desktop: true, handheld: false, camera: false })
  setDeviceOverride('handheld')
  expect(canSwitchToShell('floor')).toBe(false)
  expect(getEffectiveShell()).toBe('desk')
})
```

- [x] **Step 2: Run — expect fail**

Run: `cd web && npm test -- src/__tests__/shellMode.test.ts`

- [x] **Step 3: Implement**

In `deviceDetect.ts`:

```ts
export function getDeviceOverride(): 'handheld' | 'desk' | null {
  const v = localStorage.getItem(KEY)
  if (v === 'handheld' || v === 'desk') return v
  return null
}
```

Note: today `isHandheld()` treats any cached value as authoritative. `getEffectiveShell` should:

1. If policy forbids a shell, do not return it.
2. If override set and allowed → map handheld→floor, desk→desk.
3. Else auto-detect without writing cache if you can avoid flip-flops; **preserve existing cache write behavior** of `isHandheld` for auto path to avoid regressions.

Implement `getEffectiveShell` / `canSwitchToShell` in `shellMode.ts` accordingly.

- [x] **Step 4: Tests pass**

Run: `cd web && npm test -- src/__tests__/shellMode.test.ts`

- [x] **Step 5: Commit**

```bash
git add web/src/utils/shellMode.ts web/src/utils/deviceDetect.ts web/src/__tests__/shellMode.test.ts
git commit -m "$(cat <<'EOF'
feat: add effective shell mode helpers with device policy

Allow Floor/Desk selection from override while respecting login device_policy.
EOF
)"
```

---

### Task 3: Floor task launcher UI

**Files:**
- Create: `web/src/pages/FloorHome.tsx`
- Create: `web/src/components/FloorTaskLauncher.tsx` (or inline in FloorHome if <150 lines)
- Modify: `web/src/styles/scanner.css`
- Modify: `web/src/App.tsx` (route index behavior for floor — see Task 4 if coupled)
- Test: extend `navCatalog` tests if needed; optional RTL smoke only if project already mounts routers easily — prefer pure list tests

**Interfaces:**
- Consumes: `listFloorTiles(getRole(), getPermissions())`, `useNavigate`
- Produces: Floor home page component default export

- [x] **Step 1: Add CSS for launcher**

In `scanner.css`:

```css
.floor-launcher {
  padding: 20px 16px 32px;
  max-width: 448px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.floor-launcher-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-family: var(--sm-font);
  color: var(--foreground);
}
.floor-launcher-sub {
  font-size: 13px;
  color: var(--muted-foreground);
  margin-bottom: 8px;
  font-family: var(--sm-font);
}
.floor-launcher-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.floor-launcher-tile {
  min-height: 96px;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid oklch(0.912 0.005 250 / 0.7);
  background: var(--card);
  box-shadow: var(--sm-shadow);
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--sm-font);
  color: var(--foreground);
}
.floor-launcher-tile:active { transform: scale(0.98); }
.floor-launcher-tile-label {
  font-size: 15px;
  font-weight: 600;
}
```

- [x] **Step 2: Implement `FloorTaskLauncher` + `FloorHome`**

```tsx
// FloorHome.tsx — sketch
import { getRole } from '../services/api'
import { getPermissions } from '../utils/permissions'
import { listFloorTiles } from '../utils/navCatalog'
import FloorTaskLauncher from '../components/FloorTaskLauncher'

export default function FloorHome() {
  const tiles = listFloorTiles(getRole(), getPermissions())
  return (
    <FloorTaskLauncher
      title="Floor tasks"
      subtitle="Choose a job for this shift"
      tiles={tiles}
    />
  )
}
```

Tiles navigate with `navigate(tile.to)`. Empty state copy per spec.

- [x] **Step 3: Manual check in browser** (dev server)

Force floor: in console `localStorage.setItem('gowms_device','handheld'); location.reload()`  
Open `/` after login as picker-like role — expect tile grid.

- [x] **Step 4: Commit**

```bash
git add web/src/pages/FloorHome.tsx web/src/components/FloorTaskLauncher.tsx web/src/styles/scanner.css
git commit -m "$(cat <<'EOF'
feat: add floor task launcher home

Give handheld users a short tile grid instead of hunting a long nav list.
EOF
)"
```

---

### Task 4: Wire FloorLayout + AppShell home

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/FloorLayout.tsx`
- Modify: `web/src/utils/roleAccess.ts` (`homePathForRole` for floor shell → `/` or `/floor`)

**Interfaces:**
- Consumes: `getEffectiveShell`, `listFloorTiles`, `FloorHome`
- Produces: Floor drawer from catalog; index route shows FloorHome when shell is floor

- [x] **Step 1: Change `AppShell`**

```tsx
import { getEffectiveShell } from './utils/shellMode'

function AppShell() {
  if (getEffectiveShell() === 'floor') return <FloorLayout />
  return <Layout />
}
```

- [x] **Step 2: Floor home routing**

Options (pick one and stick to it):

**Preferred:** Add route `path="floor"` element `<FloorHome />`. Change `RoleHome` / `homePathForRole` so non-desk **or** floor-shell users land on `/floor`. Desk `RoleHome` stays Dashboard at `/`.

When `getEffectiveShell() === 'floor'`, `homePathForRole` returns `/floor` for everyone (including wm/supervisor on handheld).

```ts
export function homePathForRole(role?: string | null) {
  // Caller in navigate after login should prefer shell-aware helper:
}
export function homePathForSession(role?: string | null): string {
  if (getEffectiveShell() === 'floor') return '/floor'
  if (isDeskRole(role)) return '/'
  return FLOOR_HOME[(role || '').toLowerCase()] || '/floor'
}
```

Update login success navigate and `RoleHome` to use `homePathForSession`. Keep `homePathForRole` as thin alias or update call sites.

Add `<Route path="floor" element={<FloorHome />} />` under the authenticated layout.

- [x] **Step 3: Rebuild FloorLayout drawer from `listFloorTiles`**

Replace hard-coded `floorPages` filter with catalog tiles (icon map: keep a `Record<string, Icon>` keyed by `to`).

- [x] **Step 4: Smoke**

- Handheld override: `/floor` shows launcher; drawer matches tiles.
- Desk override: `/` shows dashboard for admin; sidebar present.

- [x] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/components/FloorLayout.tsx web/src/utils/roleAccess.ts web/src/pages/FloorHome.tsx
git commit -m "$(cat <<'EOF'
feat: wire floor shell home and catalog-driven drawer

Handheld sessions land on the task launcher; drawer lists the same tasks.
EOF
)"
```

---

### Task 5: Scope Desk Layout sidebar

**Files:**
- Modify: `web/src/components/Layout.tsx`
- Modify: `web/src/__tests__/navCatalog.test.ts` (add assertions matching Layout behavior)

**Interfaces:**
- Consumes: `listDeskNavItems(getRole(), getPermissions())`
- Produces: Sidebar sections built by grouping catalog `section` field

- [x] **Step 1: Replace `sections` constant usage**

Keep Lucide icon map in Layout (`ICONS: Record<string, NavIcon>` keyed by `to`). Build visible items:

```ts
const items = listDeskNavItems(role, getPermissions())
const bySection = /* group by section order: home, inward, stock, buying, selling, masters */
```

Remove `itemVisible` / `canSeeAdminNav` duplication once catalog encodes the rules. Keep search awesomebar over the same filtered list.

- [x] **Step 2: Verify supervisor vs admin**

Manual or unit: supervisor paths exclude `/roles`, `/employees`; admin includes both.

- [x] **Step 3: Run full frontend tests**

Run: `cd web && npm test`  
Expected: PASS (update any brittle tests).

- [x] **Step 4: Commit**

```bash
git add web/src/components/Layout.tsx web/src/__tests__/navCatalog.test.ts
git commit -m "$(cat <<'EOF'
feat: filter desk sidebar from nav catalog

Supervisors no longer see admin-only masters; admin retains full desk nav.
EOF
)"
```

---

### Task 6: UserMenu Floor / Desk / Automatic toggle

**Files:**
- Modify: `web/src/components/UserMenu.tsx`
- Modify: `web/src/utils/shellMode.ts` if needed

**Interfaces:**
- Consumes: `getEffectiveShell`, `canSwitchToShell`, `setDeviceOverride`, `getDeviceOverride`, `homePathForSession`

- [x] **Step 1: Add menu actions**

Under theme toggle, add:

- If `canSwitchToShell('floor')` and effective ≠ floor: button **Use floor view** → `setDeviceOverride('handheld'); window.location.assign(homePathForSession(getRole()))`
- If `canSwitchToShell('desk')` and effective ≠ desk: **Use desk view** → `setDeviceOverride('desk'); ...`
- If override non-null: **Use automatic detection** → `setDeviceOverride(null); window.location.assign(...)`

Full reload is intentional so `AppShell` remounts.

- [x] **Step 2: Manual verify**

On wide desktop: switch to floor → FloorLayout + launcher. Switch back → Desk. Automatic clears key.

- [x] **Step 3: Commit**

```bash
git add web/src/components/UserMenu.tsx
git commit -m "$(cat <<'EOF'
feat: add Floor/Desk view switch in user menu

Let the same login move between task and management shells deliberately.
EOF
)"
```

---

### Task 7: Harden login landing + acceptance pass

**Files:**
- Modify: `web/src/pages/Login.tsx` (navigate to `homePathForSession`)
- Modify: any `navigate(homePathForRole(...))` call sites — grep and update
- Update: `docs/superpowers/specs/2026-08-25-floor-desk-shell-views.md` status to Implemented (checkbox acceptance)

- [x] **Step 1: Grep call sites**

Run:

```bash
rg -n "homePathForRole|isHandheld\\(" web/src
```

Replace shell selection and post-login redirects with `homePathForSession` / `getEffectiveShell` as appropriate.

- [x] **Step 2: Acceptance checklist**

- [x] Picker + floor: ≤5–6 tiles, no Masters
- [x] Supervisor + desk: no Employees/Roles
- [x] Admin + desk: Employees/Roles present
- [x] UserMenu switch Floor ↔ Desk persists across reload
- [x] `cd web && npm test` PASS
- [x] `cd web && npx tsc --noEmit` PASS (or project’s usual typecheck)

- [x] **Step 3: Commit**

```bash
git add web/src/pages/Login.tsx web/src docs/superpowers/specs/2026-08-25-floor-desk-shell-views.md
git commit -m "$(cat <<'EOF'
fix: land sessions on shell-aware home path

Align login redirects with Floor launcher vs desk dashboard.
EOF
)"
```

---

## Self-Review

| Spec requirement | Task |
|---|---|
| Floor task launcher | 3, 4 |
| Drawer = same paths as launcher | 4 |
| Desk sidebar scoped (supervisor vs admin) | 1, 5 |
| Mode toggle + persistence | 2, 6 |
| device_policy respected | 2, 6 |
| One identity, two shells | 4, 6 |
| Out of scope backend RBAC | Explicitly excluded; sister plan |
| Tests | 1, 2, 5, 7 |

**Placeholder scan:** none intentional.  
**Type names:** `NavItemDef`, `ShellKind`, `listFloorTiles`, `listDeskNavItems`, `getEffectiveShell`, `homePathForSession` used consistently.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-floor-desk-shell-views.md`. Spec at `docs/superpowers/specs/2026-08-25-floor-desk-shell-views.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
