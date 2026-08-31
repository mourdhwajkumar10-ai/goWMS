# UI Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable UI template system (micro-components + page templates) to eliminate duplication across 52 pages, using the existing unified token system from `web/src/index.css` with wizard hex tokens mapped via :root aliases.

**Architecture:** Single unified token system from `web/src/index.css`; wizard hex tokens (`--rw-*`, `--grn-*`) mapped to Desk aliases via :root in `tokens.css`; 8 micro-components + 5 page templates composed into existing 52 pages incrementally.

**Tech Stack:** React 18, TypeScript, Vite, CSS custom properties (oklch), existing UI components (`ui/Button`, `ui/Card`, `ui/Badge`, `ScannerLayout`, `ScanCard`, `VerificationHeader`)

**Spec:** `docs/superpowers/specs/2026-08-29-ui-template-system-design.md`

## Global Constraints

- **Single token source:** `web/src/styles/tokens.css` copied once from `web/src/index.css`; wizard hex tokens mapped via :root aliases (`--rw-accent: var(--primary)`, etc.)
- **Import paths:** `web/src/index.css` → `@import './styles/tokens.css'`; files under `styles/` → `@import './tokens.css'`
- **No dual namespace:** No hex desk tokens; no `--color-*` rename; keep `--background`, `--primary`, `--sm-btn-h`, `--sm-gap` exactly
- **Visual language = class choice:** Desk = `erpnext-*` (full width); RF = `scan-*` (520px centered); Wizard = `rw-*`/`grn-*`
- **Touch targets:** RF ≥52px (`--sm-btn-h`); Desk ≥32px (`--btn-height`); Wizard ≥44px
- **Responsive:** Desk full-width; RF phone ≤768px full-bleed, desktop ≥769px centered 520px (`--rf-content-max`)
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` in tokens.css
- **TypeScript:** Zero `any` outside generics; strict mode; proper generics (`FormPageProps<TValues>`, `PagerInterface<T>`)
- **Bundle size:** No new runtime deps; tree-shakeable components
- **Wizard hex migration:** Safe :root alias mapping (`--rw-accent: var(--primary)`), keep class names, defer renaming
- **Phase 2 proof:** `Customers.tsx` + `Suppliers.tsx` (simple lists), NOT Items/Warehouses

---

## Phase 1: Foundation (Week 1)

### Task 1.1: Create tokens.css

**Files:**
- Create: `web/src/styles/tokens.css`
- Modify: `web/src/index.css:1-180` (remove :root tokens, add import)

**Interfaces:**
- Consumes: `web/src/index.css` (current :root block)
- Produces: `web/src/styles/tokens.css` (single source of truth)

- [ ] **Step 1: Copy :root block from index.css to tokens.css**

```bash
# Extract the :root block from web/src/index.css (lines 3-157)
# Copy to web/src/styles/tokens.css
```

- [ ] **Step 2: Add wizard token alias mapping to tokens.css :root**

```css
/* In tokens.css :root, ADD after line ~157 */
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
```

- [ ] **Step 3: Add all animations (no duplicates)**

```css
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

- [ ] **Step 4: Update index.css to import tokens.css and remove :root**

```css
/* web/src/index.css - line 1 */
@import './styles/tokens.css';

/* REMOVE lines 3-157 (the :root block) */
/* KEEP all aliases and component styles below line 157 */
```

- [ ] **Step 5: Run build and verify no visual regression**

```bash
cd web && npm run build
# Verify no CSS errors, check a few pages visually
```

- [ ] **Step 6: Commit**

```bash
git add web/src/styles/tokens.css web/src/index.css
git commit -m "feat: create tokens.css as single token source with wizard alias mapping"
```

---

### Task 1.2: Update CSS Import Paths

**Files:**
- Modify: `web/src/styles/scanner.css:1-10`
- Modify: `web/src/styles/receiving-wizard.css:1-30`
- Modify: `web/src/styles/grn-wizard.css:1-22`

**Interfaces:**
- Consumes: `web/src/styles/tokens.css`
- Produces: Updated import statements in 3 files

- [ ] **Step 1: Update scanner.css import**

```css
/* web/src/styles/scanner.css - line 1 */
@import './tokens.css';

/* REMOVE the :root block (lines 9-59 in original) */
/* KEEP all component styles */
```

- [ ] **Step 2: Update receiving-wizard.css import**

```css
/* web/src/styles/receiving-wizard.css - line 1 */
@import './tokens.css';

/* REMOVE the :root block (lines 7-30 in original) */
/* KEEP all --rw-* class usages (they now resolve via :root aliases in tokens.css) */
```

- [ ] **Step 3: Update grn-wizard.css import**

```css
/* web/src/styles/grn-wizard.css - line 1 */
@import './tokens.css';

/* REMOVE the :root block (lines 6-22 in original) */
/* KEEP all --grn-* class usages */
```

- [ ] **Step 4: Run build and verify**

```bash
cd web && npm run build
# Check receiving wizard and GRN wizard still work
```

- [ ] **Step 5: Commit**

```bash
git add web/src/styles/scanner.css web/src/styles/receiving-wizard.css web/src/styles/grn-wizard.css
git commit -m "fix: update CSS imports to use tokens.css, remove duplicate :root blocks"
```

---

### Task 1.3: Align Existing Components (PageHeader, EmptyState)

**Files:**
- Modify: `web/src/components/common/PageHeader.tsx`
- Modify: `web/src/components/common/EmptyState.tsx`

**Interfaces:**
- Consumes: Unified tokens from `tokens.css`
- Produces: Components using unified token references

- [ ] **Step 1: Update PageHeader to use unified tokens**

```tsx
// web/src/components/common/PageHeader.tsx
// Replace mixed desk/RF inline styles with token references
// Title: color: var(--text) → uses --text alias
// Description: color: var(--text-dim)
// Button: use ui/Button component
```

- [ ] **Step 2: Update EmptyState to use unified tokens**

```tsx
// web/src/components/common/EmptyState.tsx
// Use unified tokens for colors
// Support both desk and RF visual language via className prop
```

- [ ] **Step 3: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/common/PageHeader.tsx web/src/components/common/EmptyState.tsx
git commit -m "refactor: align PageHeader and EmptyState with unified tokens"
```

---

### Task 1.4: Build Micro-Components

**Files:**
- Create: `web/src/components/common/DataTable.tsx`
- Create: `web/src/components/common/FilterBar.tsx`
- Create: `web/src/components/common/StatusBadge.tsx`
- Create: `web/src/components/common/ProgressDots.tsx`
- Create: `web/src/components/common/ProgressBar.tsx`
- Create: `web/src/components/common/FlashOverlay.tsx`

**Interfaces:**
- Consumes: `ui/Card`, `ui/Badge`, `ui/Button`, `ListPager`, `ClientPager`
- Produces: 7 reusable micro-components

- [ ] **Step 1: Create DataTable.tsx**

```tsx
// web/src/components/common/DataTable.tsx
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

- [ ] **Step 2: Create FilterBar.tsx**

```tsx
// web/src/components/common/FilterBar.tsx
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
// Renders: search input + filters + <ListPager pager={pager} />
```

- [ ] **Step 3: Create StatusBadge.tsx**

```tsx
// web/src/components/common/StatusBadge.tsx
type StatusVariant = 'green' | 'blue' | 'yellow' | 'red' | 'amber';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  variantMap?: Record<string, StatusVariant>;
  className?: string;
  dot?: boolean;
}
// Uses ui/Badge internally
```

- [ ] **Step 4: Create ProgressDots.tsx and ProgressBar.tsx**

```tsx
// web/src/components/common/ProgressDots.tsx
interface ProgressDotsProps { current: number; total: number; className?: string; }

// web/src/components/common/ProgressBar.tsx
interface ProgressBarProps { percent: number; animate?: boolean; variant?: 'dots' | 'bar'; className?: string; }
```

- [ ] **Step 5: Create FlashOverlay.tsx**

```tsx
// web/src/components/common/FlashOverlay.tsx
interface FlashOverlayProps {
  type: 'success' | 'error' | 'warning' | null;
  visible: boolean;
  onComplete?: () => void;
}
// Uses useScannerToasts + ScannerToastBar internally
```

- [ ] **Step 6: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add web/src/components/common/DataTable.tsx web/src/components/common/FilterBar.tsx web/src/components/common/StatusBadge.tsx web/src/components/common/ProgressDots.tsx web/src/components/common/ProgressBar.tsx web/src/components/common/FlashOverlay.tsx
git commit -m "feat: add micro-components (DataTable, FilterBar, StatusBadge, ProgressDots, ProgressBar, FlashOverlay)"
```

---

### Task 1.5: Build ListPage Template

**Files:**
- Create: `web/src/components/templates/ListPage.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `FilterBar`, `DataTable`, `EmptyState`, `ListPager`, `ui/Button`
- Produces: `ListPage<T>` template with optional slots

- [ ] **Step 1: Create ListPage.tsx**

```tsx
// web/src/components/templates/ListPage.tsx
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
  children?: ReactNode;
  detailPanel?: ReactNode;
  className?: string;
}
```

- [ ] **Step 2: Export Column, PagerInterface, FilterConfig from common components**

```tsx
// Export types for consumers
export type { Column, PagerInterface, FilterConfig, ListPageToolbarAction } from './common/...';
```

- [ ] **Step 3: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/templates/ListPage.tsx
git commit -m "feat: add ListPage template with optional slots"
```

---

## Phase 2: Prove It (Week 1-2)

### Task 2.1: Refactor Customers.tsx to ListPage

**Files:**
- Modify: `web/src/pages/Customers.tsx`

**Interfaces:**
- Consumes: `ListPage`, `api.customerList`, `useClientPager`

- [ ] **Step 1: Extract column definitions**

```tsx
const columns = [
  { key: 'code', header: 'Code', render: r => <span className="font-medium text-accent">{r.code}</span> },
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
];
```

- [ ] **Step 2: Replace page structure with ListPage**

```tsx
// Replace the 126-line page with ~40 lines using ListPage
<ListPage<Customer>
  title="Customers"
  description="Manage customer master data"
  columns={columns}
  data={customers}
  pager={pager}
  search={{ placeholder: 'Search customers…', value: search, onChange: setSearch }}
  actions={[{ label: '+ New Customer', onClick: () => setShowNew(true), variant: 'primary' }]}
  emptyState={{ icon: '👥', title: 'No customers', message: 'Create your first customer' }}
  onRowClick={r => openCustomer(r.id)}
/>
```

- [ ] **Step 3: Run build and visually verify**

```bash
cd web && npm run build
# Open /customers page, verify visual parity
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Customers.tsx
git commit -m "refactor: migrate Customers page to ListPage template"
```

---

### Task 2.2: Refactor Suppliers.tsx to ListPage

**Files:**
- Modify: `web/src/pages/Suppliers.tsx`

- [ ] **Step 1: Extract column definitions and migrate to ListPage**

```tsx
// Similar to Customers.tsx but for Suppliers (~165 lines)
```

- [ ] **Step 2: Run build and visually verify**

```bash
cd web && npm run build
# Open /suppliers page, verify visual parity
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Suppliers.tsx
git commit -m "refactor: migrate Suppliers page to ListPage template"
```

---

### Task 2.3: Review & Approve

**Files:** None (manual review)

- [ ] **Step 1: Present refactored pages for review**

```bash
# Start dev server
cd web && npm run dev
# Open /customers and /suppliers
# Verify: visual parity, search works, pagination works, empty state shows
```

- [ ] **Step 2: Get approval to proceed**

```bash
# Wait for "approved" or requested changes
```

---

## Phase 3: Scanner Template (Week 2)

### Task 3.1: Extract useScannerState Hook

**Files:**
- Create: `web/src/hooks/useScannerState.ts`

**Interfaces:**
- Consumes: PutawayWizard.tsx state logic
- Produces: `useScannerState()` base hook returning `BaseScannerState`

- [ ] **Step 1: Extract base scanner state from PutawayWizard.tsx**

```tsx
// web/src/hooks/useScannerState.ts
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

export function useScannerState(): BaseScannerState {
  const [cameraKey, setCameraKey] = useState(0);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [toasts, setToasts] = useState<ScannerToast[]>([]);
  // ... copy logic from PutawayWizard
  return { cameraKey, setCameraKey, flash, setFlash, toasts, toast, haptic, playBeep, triggerVibrate };
}
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useScannerState.ts
git commit -m "feat: extract useScannerState base hook from PutawayWizard"
```

---

### Task 3.2: Build ScannerPage Shell

**Files:**
- Create: `web/src/components/templates/ScannerPage.tsx`

**Interfaces:**
- Consumes: `ScannerLayout`, `ScanCard`, `VerificationHeader`, `ScanViewport`, `FlashOverlay`, `useScannerState`
- Produces: `ScannerPage` shell component

- [ ] **Step 1: Create ScannerPage.tsx**

```tsx
// web/src/components/templates/ScannerPage.tsx
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

export function ScannerPage({ title, step, totalSteps, progressVariant, flash, slots }: ScannerPageProps) {
  return (
    <ScannerLayout
      title={title}
      stat={step}
      statOf={totalSteps}
      progressVariant={progressVariant}
      flash={flash}
    >
      {slots.header}
      {slots.camera}
      {slots.verdict}
      {slots.progress}
      {slots.prompt}
      {slots.footer}
      <FlashOverlay type={flash} visible={!!flash} />
      <ScannerToastBar toasts={toasts} /> {/* from useScannerToasts in page */}
    </ScannerLayout>
  );
}
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/templates/ScannerPage.tsx
git commit -m "feat: add ScannerPage shell template"
```

---

### Task 3.3: Refactor PutawayWizard.tsx to ScannerPage

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx`

**Interfaces:**
- Consumes: `ScannerPage`, `useScannerState`, `api.putawaySuggest`, `api.putawayQueue`, etc.

- [ ] **Step 1: Replace ScannerLayout with ScannerPage**

```tsx
// Remove ScannerLayout import
// Import ScannerPage and useScannerState
import { ScannerPage } from '../components/templates/ScannerPage';
import { useScannerState } from '../hooks/useScannerState';
```

- [ ] **Step 2: Call useScannerState() and pass slots to ScannerPage**

```tsx
const scannerState = useScannerState();
// ... keep all existing page-specific state (queue, zones, toteItems, etc.)

return (
  <ScannerPage
    title="Putaway"
    step={currentStep}
    totalSteps={totalSteps}
    progressVariant="dots"
    flash={flash}
    slots={{
      header: <VerificationHeader ... />,
      camera: <ScanCard ... />,
      verdict: <ScanVerdict ... />,
      progress: <ProgressDots current={step} total={totalSteps} />,
      prompt: <ScanPrompt ... />,
      footer: <ScannerFooter ... />,
    }}
  >
    {/* page-specific content */}
  </ScannerPage>
);
```

- [ ] **Step 3: Run build and verify animations**

```bash
cd web && npm run build
# Open /putaway, verify sweep, halo, verdict, flash, progress dots work
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/PutawayWizard.tsx
git commit -m "refactor: migrate PutawayWizard to ScannerPage template"
```

---

### Task 3.4: Verify Animations

**Files:** None (manual verification)

- [ ] **Step 1: Test all RF animations**

```bash
cd web && npm run dev
# Open /putaway
# Test: sweep animation, halo, verdict pop, flash overlay, progress dots/bar, haptic, beep
```

- [ ] **Step 2: Commit if verified**

```bash
git commit -m "verify: RF animations working on ScannerPage"
```

---

## Phase 4: Wizard Template (Week 2-3)

### Task 4.1: Build WizardPage Template

**Files:**
- Create: `web/src/components/templates/WizardPage.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `WizardPageProps`, `rw-*` / `grn-*` classes
- Produces: Step-based shell for GRN/Receiving

- [ ] **Step 1: Create WizardPage.tsx**

```tsx
// web/src/components/templates/WizardPage.tsx
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

export function WizardPage({ title, subtitle, steps, currentStep, onStepChange, headerActions, panels, progress, className }: WizardPageProps) {
  return (
    <div className={`rw-page ${className}`}>
      <PageHeader title={title} description={subtitle} actions={headerActions} />
      <div className="rw-dash">
        {/* Step navigation tabs */}
        <div className="rw-phase-tabs">
          {steps.map((s, i) => (
            <button
              key={s.key}
              className={`rw-phase-tab ${i === currentStep ? 'is-current' : ''} ${i < currentStep ? 'is-done' : ''}`}
              onClick={() => onStepChange(i)}
              disabled={i > currentStep}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        {/* Current panel */}
        <div className="rw-dash-left">{panels[steps[currentStep].key]}</div>
        <div className="rw-dash-right">{panels[steps[currentStep].key]}</div>
        {/* Progress bar */}
        <div className="rw-progress-inline">
          <div className="rw-progress-track">
            <div className="rw-progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
          <span className="rw-progress-label">{progress.current}/{progress.total}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/templates/WizardPage.tsx
git commit -m "feat: add WizardPage template for GRN/Receiving wizards"
```

---

### Task 4.2: Refactor ReceivingWizard.tsx to WizardPage

**Files:**
- Modify: `web/src/pages/ReceivingWizard.tsx`

- [ ] **Step 1: Migrate to WizardPage**

```tsx
// Replace custom rw-page structure with WizardPage
// Map existing steps to panels
const panels = {
  select_po: <POSelectionPanel ... />,
  scan_box: <BoxScanPanel ... />,
  scan_items: <ItemScanPanel ... />,
  complete: <CompletePanel ... />,
};
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
# Open /receiving, verify step navigation, animations, class names
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/ReceivingWizard.tsx
git commit -m "refactor: migrate ReceivingWizard to WizardPage template"
```

---

### Task 4.3: Refactor GRN.tsx to WizardPage

**Files:**
- Modify: `web/src/pages/GRN.tsx`

- [ ] **Step 1: Migrate to WizardPage**

```tsx
// Similar to ReceivingWizard but with grn-page class
<WizardPage className="grn-page" ... />
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
# Open /grn, verify step navigation, grn-* classes work
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/GRN.tsx
git commit -m "refactor: migrate GRN to WizardPage template"
```

---

## Phase 5: Form Template (Week 3)

### Task 5.1: Build FormPage + Modal

**Files:**
- Create: `web/src/components/templates/FormPage.tsx`
- Create: `web/src/components/modal/Modal.tsx`

**Interfaces:**
- Consumes: `ui/Button`, `ui/Card`, `ui/Badge`
- Produces: `FormPage<TValues>`, `Modal`

- [ ] **Step 1: Create Modal.tsx**

```tsx
// web/src/components/modal/Modal.tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={e => e.stopPropagation()}>
        <div className="rw-modal-header">
          <h2>{title}</h2>
          <button className="rw-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="rw-modal-body">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create FormPage.tsx with generics**

```tsx
// web/src/components/templates/FormPage.tsx
interface FormFieldConfig<TValues> {
  name: keyof TValues;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'textarea' | 'autocomplete';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  autocomplete?: { api: (q: string) => Promise<unknown[]>; render: (item: unknown) => ReactNode };
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

export function FormPage<TValues extends Record<string, unknown>>({ ... }: FormPageProps<TValues>) {
  // Implementation with react-hook-form or controlled inputs
}
```

- [ ] **Step 3: Run build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/modal/Modal.tsx web/src/components/templates/FormPage.tsx
git commit -m "feat: add FormPage template with generics and Modal component"
```

---

### Task 5.2: Refactor Transfers.tsx Create Modal

**Files:**
- Modify: `web/src/pages/Transfers.tsx`

- [ ] **Step 1: Extract create modal to FormPage**

```tsx
// Define TValues interface for Transfer form
interface TransferFormValues {
  from_warehouse_id: number;
  to_warehouse_id: number;
  item_code: string;
  qty: number;
  batch_no: string;
  source_location_id?: number;
}

const fields: FormFieldConfig<TransferFormValues>[][] = [
  [
    { name: 'from_warehouse_id', label: 'From warehouse *', type: 'select', required: true, options: warehouses },
    { name: 'to_warehouse_id', label: 'To warehouse *', type: 'select', required: true, options: warehouses },
    { name: 'source_location_id', label: 'Source location (optional)', type: 'select', options: fromLocations },
  ],
  [
    { name: 'item_code', label: 'Item *', type: 'text', required: true },
    { name: 'qty', label: 'Qty *', type: 'number', required: true },
    { name: 'batch_no', label: 'Batch', type: 'text' },
  ],
];
```

- [ ] **Step 2: Replace inline modal with FormPage**

```tsx
<FormPage<TransferFormValues>
  title="Create Transfer"
  fields={fields}
  onSubmit={createTransfer}
  onCancel={() => setShowNew(false)}
  modal
  initialValues={{ from_warehouse_id: 0, to_warehouse_id: 0, item_code: '', qty: '', batch_no: '' }}
/>
```

- [ ] **Step 3: Run build and verify**

```bash
cd web && npm run build
# Open /transfers, test create modal
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Transfers.tsx
git commit -m "refactor: migrate Transfers create modal to FormPage template"
```

---

### Task 5.3: Refactor Batches.tsx Create Modal

**Files:**
- Modify: `web/src/pages/Batches.tsx`

- [ ] **Step 1: Migrate create modal to FormPage**

```tsx
// Similar to Transfers.tsx
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
# Open /batches, test create modal
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Batches.tsx
git commit -m "refactor: migrate Batches create modal to FormPage template"
```

---

## Phase 6: Expand (Week 3+)

### Task 6.1: Refactor Items.tsx to ListPage with Slots

**Files:**
- Modify: `web/src/pages/Items.tsx`

- [ ] **Step 1: Migrate to ListPage with slots**

```tsx
<ListPage<Item>
  title="Items"
  description="Manage item master data"
  columns={columns}
  data={items}
  pager={pager}
  search={{ placeholder: 'Search items…', value: search, onChange: setSearch }}
  toolbar={<ProductMasterFieldsForm />}  // inline create/edit
  detailPanel={<InventoryDetailPanel />}  // right-side drawer
  actions={[{ label: '+ New Item', onClick: () => setShowNew(true), variant: 'primary' }]}
  emptyState={{ icon: '📦', title: 'No items', message: 'Create your first item' }}
  onRowClick={r => openItem(r.id)}
/>
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
# Open /items, verify inline forms, detail panel, CSV import work
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Items.tsx
git commit -m "refactor: migrate Items to ListPage with slots"
```

---

### Task 6.2: Refactor Warehouses.tsx to ListPage with Slots

**Files:**
- Modify: `web/src/pages/Warehouses.tsx`

- [ ] **Step 1: Migrate to ListPage with slots**

```tsx
<ListPage<Warehouse>
  title="Warehouses"
  description="Manage warehouses and locations"
  columns={columns}
  data={warehouses}
  pager={pager}
  search={{ placeholder: 'Search warehouses…', value: search, onChange: setSearch }}
  children={<LocationManager />}  // inline location management
  detailPanel={<ReceivingHoursPanel />}  // right-side drawer
  actions={[{ label: '+ New Warehouse', onClick: () => setShowNew(true), variant: 'primary' }]}
  emptyState={{ icon: '🏭', title: 'No warehouses', message: 'Create your first warehouse' }}
  onRowClick={r => openWarehouse(r.id)}
/>
```

- [ ] **Step 2: Run build and verify**

```bash
cd web && npm run build
# Open /warehouses, verify locations, receiving hours, QR print work
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Warehouses.tsx
git commit -m "refactor: migrate Warehouses to ListPage with slots"
```

---

### Task 6.3: Refactor Remaining Pages

**Files:** Various pages in `web/src/pages/`

- [ ] **Step 1: Systematic migration**

```bash
# For each remaining page:
# 1. Identify template (ListPage, ScannerPage, WizardPage, FormPage, DetailPage)
# 2. Extract columns/fields/panels
# 3. Replace with template
# 4. Run build, verify
# 5. Commit
```

**Priority order:**
1. `StockEntries.tsx`, `StockReconciliations.tsx` → ListPage
2. `PurchaseOrders.tsx`, `SalesOrders.tsx` → ListPage + FormPage
3. `Batches.tsx` (list) → ListPage
4. `Transfers.tsx` (list) → ListPage
5. `InventoryHealth.tsx` → ListPage (tabs)
6. `Dashboard.tsx` → DetailPage
7. `Pick.tsx`, `Pack.tsx`, `Dispatch.tsx` → ScannerPage
8. `StockPeek.tsx` → ScannerPage
9. Remaining pages...

- [ ] **Step 2: Run full test suite**

```bash
cd web && npm run build
GOWMS_TEST_DSN="postgres://gowms:secret@localhost:5432/gowms" go test ./... -count=1
```

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "refactor: migrate all remaining pages to templates"
```

---

## Final Verification

### Task: Full Regression Test

- [ ] **Step 1: Build production bundle**

```bash
cd web && npm run build
```

- [ ] **Step 2: Run all backend tests**

```bash
GOWMS_TEST_DSN="postgres://gowms:secret@localhost:5432/gowms" go test ./... -count=1
```

- [ ] **Step 3: Visual smoke test**

```bash
cd web && npm run dev
# Test: /customers, /suppliers, /items, /warehouses, /transfers, /batches
# Test: /putaway, /receiving, /grn, /stock-peek
# Test: /inventory-health, /dashboard
# Verify: animations, responsive, reduced motion, touch targets
```

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete UI template system migration for all 52 pages"
```

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-29-ui-template-system.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**