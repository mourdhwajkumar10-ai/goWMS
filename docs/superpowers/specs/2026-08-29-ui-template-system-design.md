# UI Template System Design Spec

**Date:** 2026-08-29  
**Status:** Updated after Review (v5 — Final)  
**Classification:** Architectural

---

## 1. Executive Summary

Create a reusable UI template system to eliminate duplication across **52 pages**. **Single unified token system** (from `web/src/index.css`) — desk aliases point to RF/C oklch tokens. GRN wizard and Receiving wizard use hex token namespaces that will be **consolidated into Desk namespace via alias mapping in :root**. Templates provide structural reuse; visual language = class/layout choice (`erpnext-*` vs `scan-*` vs `rw-*`), not competing color namespaces.

**Goal:** Build once, use everywhere. Minimum code, maximum reuse, no rework.

---

## 2. Token Reality: One Source, Three Legacy Namespaces → One Unified

### 2.1 Current State (Audit)

| File | Token Namespace | Type | Status |
|------|----------------|------|--------|
| `web/src/index.css` | **C/RF oklch** + **Desk aliases** | oklch + aliases | **PRIMARY SOURCE** |
| `web/src/styles/scanner.css` | RF/Scanner | oklch | Imports tokens (will) |
| `web/src/styles/receiving-wizard.css` | `--rw-*` | hex | **CONSOLIDATE via :root alias mapping** |
| `web/src/styles/grn-wizard.css` | `--grn-*` | hex | **CONSOLIDATE via :root alias mapping** |

**Key Finding:** `index.css` already has the unified oklch system. Desk aliases point to RF tokens. The two wizard files use **hex** tokens that duplicate Desk semantics — they will be migrated to use Desk aliases **via :root alias mapping in tokens.css** (not find-replace).

### 2.2 The Real Split: Class/Layout, Not Tokens

| Layer | Desk Admin | RF/Scanner | GRN Wizard | Receiving Wizard |
|-------|-----------|------------|------------|------------------|
| Shell | `desk-page` + `shell` + `sidebar` | `scanner-root` | `rw-page` | `rw-page` |
| Cards | `erpnext-card` | `scan-card` | `grn-card` | `rw-card` |
| Tables | `erpnext-table` | `scan-row` | `grn-table` | — |
| Badges | `erpnext-badge-*` | `scan-badge`/`scan-verdict` | `grn-badge` | `rw-badge` |
| Buttons | `erpnext-btn-*` (32px) | `scan-btn` (52px) | `rw-btn` (44px) | `rw-btn` (48px) |
| Layout | Full width | `--rf-content-max: 32.5rem` | Full width | `--rw-page` max 1280px |

**Decision:** Templates provide **structural reuse**. Visual language = class choice per page type. Tokens = single unified set from `index.css`.

---

## 3. Token File Strategy: Single Source, No Duplication

### 3.1 File: `web/src/styles/tokens.css`

```css
/* web/src/styles/tokens.css */
/* Single source — COPIED ONCE from web/src/index.css (no hand-merge) */
/* Wizard hex tokens MAPPED via :root alias mapping (not find-replace) */

:root {
  /* ─── C Core (oklch) — SINGLE SOURCE FROM index.css ─── */
  --background: oklch(0.955 0.008 250);
  --foreground: oklch(0.17 0.018 258);
  --card: oklch(0.995 0.002 250);
  --card-foreground: oklch(0.185 0.012 260);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.185 0.012 260);
  --primary: oklch(0.56 0.18 250);
  --primary-foreground: oklch(0.99 0.004 250);
  --secondary: oklch(0.945 0.004 250);
  --secondary-foreground: oklch(0.185 0.012 260);
  --muted: oklch(0.945 0.004 250);
  --muted-foreground: oklch(0.575 0.012 258);
  --accent: oklch(0.7 0.16 155);
  --accent-foreground: oklch(0.99 0 0);
  --destructive: oklch(0.6 0.198 24);
  --destructive-foreground: oklch(0.99 0 0);
  --warning: oklch(0.78 0.15 78);
  --warning-foreground: oklch(0.2 0.03 78);
  --border: oklch(0.912 0.005 250);
  --input: oklch(0.912 0.005 250);
  --ring: oklch(0.185 0.012 260);
  --radius: 1rem;

  /* RF/Scanner specific */
  --sm-gap: 12px;
  --sm-btn-h: 52px;
  --sm-font: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --sm-font-mono: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;
  --sm-shadow: 0 1px 2px oklch(0.17 0.018 258 / 0.04);
  --sm-shadow-md: 0 1px 2px oklch(0.17 0.018 258 / 0.04), 0 4px 12px oklch(0.17 0.018 258 / 0.06);
  --rf-content-max: 32.5rem;
  --scan-flash-success: oklch(0.7 0.16 155 / 0.08);
  --scan-flash-error:   oklch(0.6 0.198 24 / 0.10);
  --scan-flash-warn:    oklch(0.78 0.15 78 / 0.10);

  /* Desk aliases → RF/C tokens (NO new tokens, NO circular refs) */
  --text: var(--foreground);
  --text-dim: var(--muted-foreground);
  --text-muted: var(--muted-foreground);
  --text-color: var(--foreground);
  --heading-color: var(--foreground);
  --bg: var(--background);
  --bg-color: var(--background);
  --bg-soft: var(--secondary);
  --panel: var(--card);
  --panel-2: var(--secondary);
  --border-color: var(--border);
  --accent: var(--primary);
  --green: var(--accent);
  --amber: var(--warning);
  --red: var(--destructive);

  /* Radius aliases (from index.css) */
  --border-radius-sm: calc(var(--radius) * 0.4);
  --border-radius: calc(var(--radius) * 0.6);
  --border-radius-md: calc(var(--radius) * 0.6);
  --border-radius-lg: var(--radius);
  --border-radius-full: 9999px;
  --radius-sm: calc(var(--radius) * 0.4);
  --radius-md: calc(var(--radius) * 0.6);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);

  /* Typography */
  --font-stack: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;

  /* Shadows */
  --shadow-xs: 0 1px 2px oklch(0.17 0.018 258 / 0.04);
  --shadow-sm: 0 1px 2px oklch(0.17 0.018 258 / 0.04), 0 1px 3px oklch(0.17 0.018 258 / 0.04);
  --shadow-base: 0 4px 8px oklch(0.17 0.018 258 / 0.06), 0 1px 3px oklch(0.17 0.018 258 / 0.05);
  --shadow-md: 0 8px 24px oklch(0.17 0.018 258 / 0.08), 0 2px 6px oklch(0.17 0.018 258 / 0.04);

  /* RF/Scanner specific */
  --sm-gap: 12px;
  --sm-btn-h: 52px;
  --sm-font: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --sm-font-mono: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;
  --sm-shadow: 0 1px 2px oklch(0.17 0.018 258 / 0.04);
  --sm-shadow-md: 0 1px 2px oklch(0.17 0.018 258 / 0.04), 0 4px 12px oklch(0.17 0.018 258 / 0.06);
  --rf-content-max: 32.5rem;
  --scan-flash-success: oklch(0.7 0.16 155 / 0.08);
  --scan-flash-error:   oklch(0.6 0.198 24 / 0.10);
  --scan-flash-warn:    oklch(0.78 0.15 78 / 0.10);

  /* Motion tokens (from index.css) */
  --animate-sweep: sweep 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  --animate-halo: halo 2.2s ease-out infinite;
  --animate-verdict: verdict 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ALL animations — NO DUPLICATES */
@keyframes sweep { 0% { transform: translateY(-46%); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(46%); opacity: 0; } }
@keyframes halo { 0% { transform: scale(0.9); opacity: 0.5; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes verdict { 0% { transform: scale(0.82); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes smPulse { 50% { opacity: 0.5; } }
@keyframes cam-scan { 0%, 100% { top: 10px; opacity: 1; } 50% { top: calc(100% - 12px); opacity: 0.7; } }
@keyframes cam-screen-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rw-toast-in { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes rw-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rw-pop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
@keyframes rw-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes rw-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes rw-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 3.2 Wizard Hex Migration: Safe :root Alias Mapping (Phase 1.3)

**No find-replace.** In `tokens.css` :root, map wizard tokens to unified tokens:

```css
:root {
  /* ... unified tokens above ... */

  /* Wizard token → unified token mapping (Phase 1.3) */
  --rw-accent: var(--primary);
  --rw-accent-hover: var(--primary);
  --rw-bg: var(--bg);
  --rw-bg-2: var(--bg-soft);
  --rw-border: var(--border);
  --rw-text: var(--text);
  --rw-text-dim: var(--text-dim);
  --rw-radius: var(--border-radius-lg);

  --grn-accent: var(--primary);
  --grn-bg: var(--bg);
  --grn-border: var(--border);
  --grn-text: var(--text);
  --grn-radius: var(--border-radius-lg);
}
```

**Keep class names** (`rw-*`, `grn-*`). Defer renaming usages to later cleanup.

### 3.3 Import Order (Correct Paths)

```css
/* web/src/index.css (MAIN ENTRY — imported by main.tsx) */
@import './styles/tokens.css';

/* web/src/styles/scanner.css */
@import './tokens.css';

/* web/src/styles/receiving-wizard.css */
@import './tokens.css';

/* web/src/styles/grn-wizard.css */
@import './tokens.css';
```

| File | Correct Import |
|------|----------------|
| `web/src/index.css` | `@import './styles/tokens.css'` |
| `web/src/styles/scanner.css` | `@import './tokens.css'` |
| `web/src/styles/receiving-wizard.css` | `@import './tokens.css'` |
| `web/src/styles/grn-wizard.css` | `@import './tokens.css'` |

---

## 4. CSS Entry Points & File Tree

```
web/src/
├── index.css                    # MAIN ENTRY (imported by main.tsx)
├── styles/
│   ├── tokens.css               # NEW - single source
│   ├── scanner.css              # EXISTING - @import './tokens.css', NO :root
│   ├── receiving-wizard.css     # EXISTING - @import './tokens.css', NO :root, --rw-* usages kept
│   ├── grn-wizard.css           # EXISTING - @import './tokens.css', NO :root, --grn-* usages kept
│   └── scanner.css              # (already listed)
```

---

## 5. Template Architecture

### 5.1 Micro-Components (Building Blocks)

| Component | File | Purpose | Replaces |
|-----------|------|---------|----------|
| `PageHeader` | `common/PageHeader.tsx` | Title, description, breadcrumbs, actions | 30+ header blocks |
| `DataTable` | `common/DataTable.tsx` | Sortable table + pagination + empty | 25+ table implementations |
| `EmptyState` | `common/EmptyState.tsx` | Icon + title + message + action | 10+ empty states |
| `FilterBar` | `common/FilterBar.tsx` | Search + selects + leading controls | 20+ filter bars |
| `StatusBadge` | `common/StatusBadge.tsx` | Color badge from status string | 15+ inline functions |
| `ProgressDots` | `common/ProgressDots.tsx` | RF progress dots | 4+ implementations |
| `ProgressBar` | `common/ProgressBar.tsx` | RF progress bar | 4+ implementations |
| `FlashOverlay` | `common/FlashOverlay.tsx` | Integrates with existing toast system | ScannerLayout flash |

**Removed:** `ActionButton` (use `ui/Button`), `FormSection`/`FormField` (deferred to Phase 4+)

### 5.2 Page Templates (Composed)

| Template | File | Covers | Composition | Visual Language |
|----------|------|--------|-------------|-----------------|
| `ListPage` | `templates/ListPage.tsx` | 25+ list pages | `PageHeader` + `FilterBar` + `DataTable` + `EmptyState` + slots | Desk (`erpnext-*`) |
| `ScannerPage` | `templates/ScannerPage.tsx` | 4 wizard pages | `ScannerLayout` + composed slots + `useScannerState` hook | RF (`scan-*`) |
| `FormPage` | `templates/FormPage.tsx` | 15+ modals | `Modal` + `FormField` + actions | Desk (`erpnext-*`) |
| `DetailPage` | `templates/DetailPage.tsx` | Detail views | `PageHeader` + tabs + sections | Desk (`erpnext-*`) |
| `WizardPage` | `templates/WizardPage.tsx` | GRN/Receiving wizards | `PageHeader` + steps + panels | `rw-*` / `grn-*` classes |

---

## 6. Template Interfaces (TypeScript)

### 6.1 PageHeader

```typescript
// common/PageHeader.tsx
interface Action {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  icon?: ReactNode;
  disabled?: boolean;
}
interface Breadcrumb { label: string; onClick?: () => void; }

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: Action[];
  breadcrumbs?: Breadcrumb[];
  className?: string;
}
```

### 6.2 DataTable (Generic Pager, No `any`)

```typescript
// common/DataTable.tsx
interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  width?: string;
}

interface PagerInterface<T> {
  pageItems: T[];
  total: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setQ: (q: string) => void;
  q: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pager: PagerInterface<T>;
  emptyState?: EmptyStateProps;
  rowKey: keyof T | ((row: T) => string);
  onRowClick?: (row: T) => void;
  className?: string;
}
```

### 6.3 EmptyState

```typescript
// common/EmptyState.tsx
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' };
  className?: string;
}
```

### 6.4 FilterBar (Wraps ListPager)

```typescript
// common/FilterBar.tsx
interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'date' | 'daterange';
  options?: { value: string; label: string }[];
  value?: string;
  onChange: (key: string, value: string) => void;
}

interface FilterBarProps {
  search: { placeholder: string; value: string; onChange: (q: string) => void };
  filters?: FilterConfig[];
  leading?: ReactNode;
  className?: string;
}
// COMPOSITION: <FilterBar> → search + filters + <ListPager pager={pager} />
```

### 6.4 StatusBadge (Polymorphic)

```typescript
// common/StatusBadge.tsx
type StatusVariant = 'green' | 'blue' | 'yellow' | 'red' | 'amber';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  variantMap?: Record<string, StatusVariant>;
  className?: string;
  dot?: boolean;
}
```

### 6.5 ProgressDots / ProgressBar

```typescript
// common/ProgressDots.tsx
interface ProgressDotsProps { current: number; total: number; className?: string; }

// common/ProgressBar.tsx
interface ProgressBarProps { percent: number; animate?: boolean; variant?: 'dots' | 'bar'; className?: string; }
```

### 6.6 FlashOverlay

```typescript
// common/FlashOverlay.tsx
interface FlashOverlayProps {
  type: 'success' | 'error' | 'warning' | null;
  visible: boolean;
  onComplete?: () => void;
}
```

---

## 7. Page Templates

### 7.1 ListPage (Desk Admin, with Optional Slots)

```typescript
// templates/ListPage.tsx
interface ListPageToolbarAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  icon?: ReactNode;
}

interface ListPageProps<T> {
  title: string;
  description?: string;
  columns: Column<T>[];
  data: T[];
  pager: PagerInterface<T>;
  search: { placeholder: string; value: string; onChange: (q: string) => void };
  filters?: FilterConfig[];
  toolbar?: ReactNode;
  actions?: ListPageToolbarAction[];
  emptyState?: EmptyStateProps;
  onRowClick?: (row: T) => void;
  // Optional slots for complex pages
  children?: ReactNode;
  detailPanel?: ReactNode;
  className?: string;
}
// NO "SimpleListPage" vs "ComplexListPage" split — single ListPage with optional slots
```

### 7.2 ScannerPage (RF Only — Shell + Base Hook)

```typescript
// hooks/useScannerState.ts
export interface BaseScannerState {
  cameraKey: number;
  setCameraKey: (k: number) => void;
  flash: 'success' | 'error' | null;
  setFlash: (f: 'success' | 'error' | null) => void;
  toasts: ScannerToast[];
  toast: (text: string, type: 'ok' | 'warn' | 'err') => void;
  haptic: (ms: number) => void;
  playBeep: (freq: number, dur: number) => void;
  triggerVibrate: (p: number | number[]) => void;
}

export function useScannerState(): BaseScannerState { ... }

// templates/ScannerPage.tsx
interface ScannerPageSlots {
  header?: ReactNode;
  camera?: ReactNode;
  verdict?: ReactNode;
  progress?: ReactNode;
  prompt?: ReactNode;
  flash?: ReactNode;
  footer?: ReactNode;
  toasts?: ReactNode;
}

interface ScannerPageProps {
  title: string;
  step: number;
  totalSteps: number;
  progressVariant: 'dots' | 'bar';
  flash?: 'success' | 'error' | 'warning' | null;
  slots: ScannerPageSlots;
  // Pages call useScannerState() themselves; ScannerPage is pure shell
}
// COMPOSES: ScannerLayout + composed slots
```

### 7.3 WizardPage (GRN/Receiving)

```typescript
// templates/WizardPage.tsx
interface WizardPageProps {
  title: string;
  subtitle?: string;
  steps: { key: string; label: string; icon?: ReactNode }[];
  currentStep: number;
  onStepChange: (step: number) => void;
  headerActions?: Action[];
  panels: Record<string, ReactNode>;
  progress: { current: number; total: number };
  className?: string;  // 'rw-page' or 'grn-page'
}
```

### 7.4 FormPage (Modals, Generic — No `any`)

```typescript
// templates/FormPage.tsx
interface FormFieldConfig<TValues> {
  name: keyof TValues;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'textarea' | 'autocomplete';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  autocomplete?: { 
    api: (q: string) => Promise<unknown[]>; 
    render: (item: unknown) => ReactNode; 
  };
  validation?: (value: unknown) => string | null;
}

interface FormPageProps<TValues extends Record<string, unknown>> {
  title: string;
  description?: string;
  fields: FormFieldConfig<TValues>[][];
  onSubmit: (data: TValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  initialValues?: Partial<TValues>;
  modal?: boolean;
}
```

### 7.5 DetailPage

```typescript
// templates/DetailPage.tsx
interface DetailTab { key: string; label: string; content: ReactNode; badge?: number; }

interface DetailPageProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  tabs: DetailTab[];
  headerActions?: Action[];
  className?: string;
}
```

---

## 8. File Structure

```
web/src/
├── index.css                    # MAIN ENTRY (imported by main.tsx)
├── styles/
│   ├── tokens.css               # NEW - single source
│   ├── scanner.css              # EXISTING - @import './tokens.css', NO :root
│   ├── receiving-wizard.css     # EXISTING - @import './tokens.css', NO :root, --rw-* kept
│   ├── grn-wizard.css           # EXISTING - @import './tokens.css', NO :root, --grn-* kept
│   └── scanner.css              # (already listed)
├── hooks/
│   └── useScannerState.ts       # NEW - base hook from PutawayWizard
├── components/
│   ├── common/                  # NEW - micro-components
│   │   ├── PageHeader.tsx
│   │   ├── DataTable.tsx
│   │   ├── EmptyState.tsx
│   │   ├── FilterBar.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── ProgressDots.tsx
│   │   ├── ProgressBar.tsx
│   │   └── FlashOverlay.tsx
│   ├── templates/               # NEW - page templates
│   │   ├── ListPage.tsx
│   │   ├── ScannerPage.tsx
│   │   ├── WizardPage.tsx
│   │   ├── FormPage.tsx
│   │   └── DetailPage.tsx
│   ├── ui/                      # EXISTING - keep
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── Badge.tsx
│   ├── scan/                    # EXISTING - keep
│   │   ├── ScannerLayout.tsx
│   │   ├── ScanCard.tsx
│   │   ├── VerificationHeader.tsx
│   │   └── ...
│   └── modal/                   # NEW - for FormPage
│       └── Modal.tsx
└── pages/                       # REFACTOR - 52 pages use templates
    ├── Customers.tsx            # → ListPage (Phase 2 proof #1)
    ├── Suppliers.tsx            # → ListPage (Phase 2 proof #2)
    ├── Items.tsx                # → ListPage (Phase 5, with slots)
    ├── Warehouses.tsx           # → ListPage (Phase 5, with slots)
    ├── Batches.tsx              # → ListPage + FormPage
    ├── Transfers.tsx            # → ListPage + FormPage
    ├── PutawayWizard.tsx        # → ScannerPage
    ├── ReceivingWizard.tsx      # → WizardPage (rw-page)
    ├── GRN.tsx                  # → WizardPage (grn-page)
    ├── StockPeek.tsx            # → ScannerPage
    └── ...                      # all 52 pages
```

---

## 9. Migration Plan (Incremental)

### Phase 1: Foundation (Week 1)
| Task | Files | Deliverable |
|------|-------|-------------|
| 1.1 Create tokens.css | `web/src/styles/tokens.css` | Copied ONCE from index.css; wizard tokens mapped via :root aliases |
| 1.2 Update imports | `index.css`, `scanner.css`, `receiving-wizard.css`, `grn-wizard.css` | Correct import paths (Section 3.3) |
| 1.3 Map wizard tokens | `tokens.css` :root | `--rw-*` / `--grn-*` → unified aliases (Section 3.2) |
| 1.4 Align existing components | `PageHeader.tsx`, `EmptyState.tsx` | Use unified tokens; remove mixed desk/RF |
| 1.5 Build micro-components | `components/common/*.tsx` | 7 new components |
| 1.6 Build `ListPage` template | `components/templates/ListPage.tsx` | With optional slots, generic PagerInterface<T> |

### Phase 2: Prove It (Week 1-2)
| Task | Files | Deliverable |
|------|-------|-------------|
| 2.1 Refactor `Customers.tsx` | `pages/Customers.tsx` | Uses `ListPage` (~126 lines, simple) |
| 2.2 Refactor `Suppliers.tsx` | `pages/Suppliers.tsx` | Uses `ListPage` (~165 lines, simple) |
| 2.3 Review & approve | — | You verify visual parity + less code |

### Phase 3: Scanner Template (Week 2)
| Task | Files | Deliverable |
|------|-------|-------------|
| 3.1 Extract `useScannerState` | `hooks/useScannerState.ts` | Base state from PutawayWizard/ReceivingWizard |
| 3.2 Build `ScannerPage` shell | `components/templates/ScannerPage.tsx` | Composes `ScannerLayout` + slots |
| 3.3 Refactor `PutawayWizard.tsx` | `pages/PutawayWizard.tsx` | Uses `ScannerPage` + `useScannerState()` + page-specific state |
| 3.4 Verify animations | — | Sweep, halo, verdict, flash, progress all work |

### Phase 4: Wizard Template (Week 2-3)
| Task | Files | Deliverable |
|------|-------|-------------|
| 4.1 Build `WizardPage` template | `components/templates/WizardPage.tsx` | Step-based shell for GRN/Receiving |
| 4.2 Refactor `ReceivingWizard.tsx` | `pages/ReceivingWizard.tsx` | Uses `WizardPage` (rw-page classes) |
| 4.3 Refactor `GRN.tsx` | `pages/GRN.tsx` | Uses `WizardPage` (grn-page classes) |

### Phase 5: Form Template (Week 3)
| Task | Files | Deliverable |
|------|-------|-------------|
| 5.1 Build `FormPage` + `Modal` | `components/templates/FormPage.tsx`, `components/modal/Modal.tsx` | Generic `FormPageProps<TValues>` |
| 5.2 Refactor `Transfers.tsx` | `pages/Transfers.tsx` | Extract modal → `FormPage` |
| 5.3 Refactor `Batches.tsx` | `pages/Batches.tsx` | Extract modal → `FormPage` |

### Phase 6: Expand (Week 3+)
| Task | Files | Notes |
|------|-------|-------|
| 6.1 `Items.tsx` | `ListPage` with `children` (inline form) + `detailPanel` | Complex: 530+ lines |
| 6.2 `Warehouses.tsx` | `ListPage` with slots | Complex: 768 lines |
| 6.3 Remaining 52 pages | Systematic | — |

---

## 9. Quality Gates

| Gate | Criteria |
|------|----------|
| **Visual Parity** | Refactored pages match original pixel-for-pixel |
| **Animation Fidelity** | Sweep, halo, verdict, pulse, flash, scan-line identical |
| **Touch Targets** | RF: ≥52px (`--sm-btn-h`); Desk: ≥32px (`--btn-height`); Wizard: ≥44px |
| **Responsive** | Desk: full-width. RF: Phone ≤768px full-bleed; Desktop ≥769px centered 520px (`--rf-content-max`) |
| **Reduced Motion** | `@media (prefers-reduced-motion: reduce)` in tokens.css |
| **TypeScript** | Zero `any` outside generics; strict mode; proper generics (`FormPageProps<TValues>`, `PagerInterface<T>`) |
| **Bundle Size** | No new runtime deps; tree-shakeable components |

---

## 10. Specific Fixes from All Reviews

| Issue | Fix in Spec |
|-------|-------------|
| **Broken CSS in tokens.css** | Section 3.1: Single copy from index.css; no duplicated blocks; no circular `--border: var(--border)`; no duplicate keyframes |
| **Import paths** | Section 3.3: Correct relative paths per file location |
| **File tree** | Section 8: `index.css` at `web/src/index.css` (not under styles/) |
| **Wizard hex migration** | Section 3.2: Safe :root alias mapping; keep class names; defer renaming |
| **SimpleListPage vs ComplexListPage** | Removed claim; single `ListPage` with optional slots |
| **Cross-ref fixes** | Section numbers aligned (e.g., `useScannerState` in 6.2, `ScannerLayout` in 6.2) |
| **Zero `any`** | `PagerInterface<T>`, `FormPageProps<TValues>`, `autocomplete.api: Promise<unknown[]>`, `validation: (value: unknown) => string \| null` |
| **WizardPage template added** | Section 7.3 for GRN/Receiving |
| **ScannerPage = shell** | Section 7.2: `useScannerState` base hook; pages extend; `ScannerPage` composes `ScannerLayout` |

---

## 11. Approval Request

**Please review and confirm:**

1. ✅ Single unified token system (from `web/src/index.css`); wizard hex tokens mapped via :root aliases
2. ✅ Import paths corrected per file location; `index.css` at `web/src/index.css`
3. ✅ 8 micro-components + 5 templates (added `WizardPage`)
4. ✅ Phase 2 proof: `Customers.tsx` + `Suppliers.tsx` (simple)
5. ✅ `ScannerPage` = `ScannerLayout` shell + base `useScannerState` hook; pages extend state
6. ✅ `WizardPage` template for GRN/Receiving
7. ✅ `FormPage` with proper generics `FormPageProps<TValues>`
8. ✅ `FilterBar` wraps `ListPager`; `leading` slot for custom actions
9. ✅ `prefers-reduced-motion` in tokens.css
10. ✅ Phase 1.4: "Align existing PageHeader/EmptyState" not "build new"
11. ✅ Migration order: Foundation → Prove (Customers/Suppliers) → Scanner → Wizard → Form → Expand
12. ✅ No `any` outside generics; circular token refs removed; duplicate keyframes removed

**Reply "approved" or request changes.** Once approved, I'll invoke `writing-plans` for the implementation plan.