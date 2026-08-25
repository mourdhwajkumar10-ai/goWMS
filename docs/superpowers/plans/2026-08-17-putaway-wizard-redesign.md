# Putaway Wizard Redesign — Implementation Plan

**Date:** 2026-08-17
**Spec:** `docs/superpowers/specs/2026-08-16-putaway-rules-velocity-ui-design.md`
**Design Direction:** Minimal/modern (Linear/Notion/Vercel style)

---

## Overview

Redesign the putaway wizard UI for a professional, mobile-first warehouse experience with Apple-quality micro-interactions and native camera QR scanning.

**Key deliverables:**
1. Reusable `ScannerInput` component (native camera + manual fallback)
2. `useHaptic` hook for vibration feedback
3. Complete rewrite of `PutawayWizard.tsx` (6 screens, ~800 lines)
4. Complete rewrite of `putaway-wizard.css` (~600 lines)

---

## Task 1: Create ScannerInput Component

**File:** `web/src/components/ScannerInput.tsx`

**What:**
- Reusable camera scan component using `<input type="file" accept="image/*" capture="environment">`
- Hidden file input triggered by a styled button
- Autocomplete suggestions dropdown (type-ahead)
- Torch toggle button (uses `ImageCapture` API when available)
- Haptic feedback on scan success (`navigator.vibrate(10)`)
- Manual text fallback always visible

**Props:**
```typescript
interface ScannerInputProps {
  onScan: (value: string) => void
  placeholder?: string
  suggestions?: Array<{ code: string; name: string; qty?: number }>
  onSelectSuggestion?: (code: string) => void
  showTorch?: boolean
  autoFocus?: boolean
}
```

**CSS classes:**
- `.scanner-trigger` — tap-to-scan button with camera icon
- `.scanner-field` — manual text input fallback
- `.scanner-suggestions` — autocomplete dropdown

**Verification:**
- Component renders camera button
- Click opens native camera (rear lens)
- Manual input works as fallback
- Suggestions dropdown filters on type
- Haptic triggers on scan (mobile)

---

## Task 2: Create useHaptic Hook

**File:** `web/src/hooks/useHaptic.ts`

**What:**
- Simple hook wrapping `navigator.vibrate(10)`
- Falls back gracefully on desktop (no-op)
- Optional intensity parameter

**Implementation:**
```typescript
import { useCallback } from 'react'
export function useHaptic() {
  const trigger = useCallback((ms = 10) => {
    navigator.vibrate?.(ms)
  }, [])
  return trigger
}
```

**Verification:**
- Hook returns a function
- Calling it vibrates on mobile
- No-op on desktop (no errors)

---

## Task 3: Create ButtonPress Wrapper Component

**File:** `web/src/components/ButtonPress.tsx`

**What:**
- Wrapper for any tappable element that adds Apple-style press feedback
- Applies `transform: scale(0.96)` on `:active` state
- Subtle shadow reduction on press
- 120ms ease-out transition
- Triggers haptic on mobile

**Props:**
```typescript
interface ButtonPressProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  as?: 'button' | 'div' | 'a'
}
```

**Verification:**
- Visual squeeze effect on press
- Haptic feedback on mobile
- Works as button/div/a

---

## Task 4: Rewrite putaway-wizard.css

**File:** `web/src/styles/putaway-wizard.css`

**What:**
Complete rewrite with minimal/modern aesthetic:

- **Design tokens:** CSS custom properties for colors, spacing, typography
- **8px grid:** All spacing uses multiples of 8
- **Card styles:** Subtle borders, 12px radius, hover states with blue accent
- **Button press states:** `scale(0.96)` on `:active`, 120ms transitions
- **Zone cards:** Colored letter badges (28px circle), hover translateX
- **Tote section:** Accent blue border, counter badge, clean rows
- **Progress bar:** 6px height, accent fill, smooth transition
- **Suggestion card:** Large location code (28px mono), velocity tier badge
- **Scanner input:** Camera icon button, suggestions dropdown, torch toggle
- **Exception panel:** Amber/orange warning, clear action buttons
- **Complete screen:** Green checkmark, success state, clean list
- **Animations:** Slide-in (150ms), fade (100ms), pulse for loading
- **Responsive:** Mobile-first, breakpoint at 480px/768px

**Key CSS patterns:**
```css
/* Press feedback */
.btn-press {
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}
.btn-press:active {
  transform: scale(0.96);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

/* Screen transitions */
@keyframes pw-slide-in {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Zone letter badges */
.pw-zone-letter {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
}
```

**Verification:**
- All existing CSS classes preserved (no breaking changes)
- New classes added for redesign elements
- Press feedback works on all interactive elements
- Responsive breakpoints work (test at 320px, 768px, 1024px)

---

## Task 5: Rewrite PutawayWizard.tsx — Mode Select Screen

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Mode select screen (first screen of wizard):

- Two large cards: "By Zone" / "By Item"
- Each card: icon, title, subtitle, arrow indicator
- Uses `ButtonPress` wrapper for squeeze feedback
- Queue summary banner: large count (32px bold), "items pending in staging"
- Top 5 items preview as clean list rows
- Loading state with skeleton

**State:** `step === 'mode_select'`

**API calls:**
- `GET /putaway/queue` on mount (fetch queue items)

**Verification:**
- Two cards render with press feedback
- Queue count displays correctly
- Click advances to zone_select or item_pick
- Loading state shows before data loads

---

## Task 6: Rewrite PutawayWizard.tsx — Zone Select Screen

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Zone selection screen:

- Grid of zone cards (2-col desktop, 1-col mobile)
- Each card: colored letter badge, zone name, item count, chevron
- Uses `ButtonPress` wrapper
- Back button in header (← Mode Select)
- Empty state: "No items by zone"

**State:** `step === 'zone_select'`

**API calls:**
- `GET /putaway/queue/zones` on mount (fetch zone counts)

**Verification:**
- Zones display with correct colors (A=blue, B=green, etc.)
- Item counts match queue data
- Click selects zone and advances to item_pick
- Back button returns to mode_select

---

## Task 7: Rewrite PutawayWizard.tsx — Item Pick Screen (Tote Section)

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Item picking screen — tote section:

- Tote header: "📦 Tote" + **"3 of 10 items"** counter badge
- `ScannerInput` component for camera scanning
- Tote items list: code, name, qty, status badge (picked/placed)
- Remove button per item (with confirmation)
- "Start Putaway →" primary button (enabled when tote has items)
- Uses `ButtonPress` wrapper for all buttons

**State:** `step === 'item_pick'`

**API calls:**
- `POST /putaway/sessions` — create session on first pick
- `POST /putaway/sessions/:id/pick` — scan item into session
- `DELETE /putaway/sessions/:id/items/:itemId` — remove from tote

**Verification:**
- Counter shows "X of N items" in tote header
- Camera scan works on mobile
- Manual scan works on desktop
- Items added to tote with "picked" status
- Remove button removes item from tote
- "Start Putaway" enables when tote has items

---

## Task 8: Rewrite PutawayWizard.tsx — Item Pick Screen (Available Items)

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Item picking screen — available items section:

- Scan input with autocomplete suggestions
- Item rows: code, name, location, qty, "+" button to add to tote
- Filter by selected zone (if in zone mode)
- Empty state: "No items in this zone"

**State:** `step === 'item_pick'`

**API calls:**
- `GET /putaway/queue?zone=X` — fetch items for selected zone

**Verification:**
- Items filtered by zone
- Scan input finds items by code
- "+" button adds item to tote
- Empty state displays when no items

---

## Task 9: Rewrite PutawayWizard.tsx — Putaway Screen (Progress Header)

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Putaway action screen — progress header:

- "Placing item 3 of 10" + progress bar (30% filled)
- Progress bar: 6px height, accent fill, rounded
- Updates in real-time as items are placed

**State:** `step === 'putaway'`

**Verification:**
- Progress shows correct count
- Progress bar fills proportionally
- Updates when item placed

---

## Task 10: Rewrite PutawayWizard.tsx — Putaway Screen (Current Item)

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Putaway action screen — current item card:

- Large item code (24px mono), name, qty badge
- Flow diagram: FROM [location code] → TO [suggested location code]
- Suggestion card: large location code (28px mono), velocity tier badge, shelf band tag
- Free capacity indicator
- Loading state while fetching suggestion

**API calls:**
- `GET /putaway/suggest?item_code=X&qty=Y` — fetch suggestion

**Verification:**
- Current item displays with correct code/name/qty
- Flow diagram shows FROM → TO locations
- Suggestion card shows location, velocity tier, shelf band
- Loading state shows while fetching

---

## Task 11: Rewrite PutawayWizard.tsx — Putaway Screen (Scan + Confirm)

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Putaway action screen — scan and confirm:

- Location scan input with torch toggle button
- Autocomplete suggestions dropdown
- "Confirm Placement" primary button
- Exception button: "Doesn't Fit" secondary button

**API calls:**
- `POST /putaway/sessions/:id/place/:itemId` — confirm placement
- `POST /putaway/fit-exception` — open exception modal

**Verification:**
- Camera scan works for location
- Torch toggle works (if supported)
- Confirm placement works
- Exception button opens fit exception screen

---

## Task 12: Rewrite PutawayWizard.tsx — Fit Exception Screen

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Fit exception screen (inline in putaway screen, not modal):

- Amber warning panel
- Message: "Suggested location A-01-02-M has 0 free capacity"
- Override Location (scan input)
- Adjust Quantity (number input)
- Skip Item (destructive button)
- "Continue" to return to putaway

**API calls:**
- `POST /putaway/fit-exception` — submit exception

**Verification:**
- Warning panel displays with correct message
- Override location input works
- Quantity input works
- Skip item removes item from tote
- Continue returns to putaway

---

## Task 13: Rewrite PutawayWizard.tsx — Complete Screen

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
Complete screen:

- Green checkmark circle (64px)
- "Putaway Complete" heading
- "10 items placed successfully" subtext
- List: item code → final location (clean rows)
- "Start New Putaway" primary button
- "Back to Dashboard" secondary button

**Verification:**
- Success state displays with checkmark
- Count shows correct number of items
- List shows all placed items with locations
- "Start New Putaway" resets wizard
- "Back to Dashboard" navigates to home

---

## Task 14: Screen Transitions + Polish

**File:** `web/src/pages/PutawayWizard.tsx`

**What:**
- Add slide-in animation when advancing screens (150ms ease-out)
- Add slide-out animation when going back (100ms ease-in)
- Add fade animation for modals/dropdowns
- Add loading skeletons for async data
- Add error toasts for failed operations
- Add empty states with illustrations

**Verification:**
- Smooth screen transitions
- Loading states display correctly
- Error toasts appear and auto-dismiss
- Empty states display with helpful messages

---

## Task 15: Integration Tests

**File:** `web/src/__tests__/PutawayWizard.test.tsx`

**What:**
- Test mode select screen renders
- Test zone select screen renders with zones
- Test item pick screen adds items to tote
- Test counter updates correctly
- Test putaway screen displays suggestion
- Test fit exception submits correctly
- Test complete screen displays results

**Verification:**
- All tests pass
- No TypeScript errors

---

## Task 16: Build + Manual E2E

**What:**
- Run `npm run build` in `web/`
- Start Go server: `go run cmd/server/main.go`
- Manual E2E test:
  1. Navigate to `/putaway`
  2. Select "By Zone"
  3. Select Zone A
  4. Scan item into tote
  5. Verify counter shows "1 of N"
  6. Add more items
  7. Start putaway
  8. Scan location
  9. Confirm placement
  10. Verify progress updates
  11. Complete putaway
  12. Verify success screen

**Verification:**
- Build succeeds
- Server starts
- All screens work in browser
- Camera scan works on mobile
- Haptic feedback works on mobile
- Press feedback works on all buttons
- Counter updates correctly

---

## File Summary

| File | Action | Lines (est.) |
|------|--------|-------------|
| `web/src/components/ScannerInput.tsx` | Create | ~120 |
| `web/src/hooks/useHaptic.ts` | Create | ~10 |
| `web/src/components/ButtonPress.tsx` | Create | ~40 |
| `web/src/styles/putaway-wizard.css` | Rewrite | ~600 |
| `web/src/pages/PutawayWizard.tsx` | Rewrite | ~800 |
| `web/src/__tests__/PutawayWizard.test.tsx` | Create | ~200 |

**Total estimated:** ~1,770 lines

---

## Dependencies

- No new npm packages required
- Uses native browser APIs: `navigator.vibrate`, `ImageCapture`, `<input capture>`
- Existing API endpoints unchanged

---

## Success Criteria

- [ ] All 6 screens redesigned with minimal/modern aesthetic
- [ ] Apple-style press feedback on every interactive element
- [ ] Native camera scanner works on iOS Safari + Chrome Android
- [ ] Torch toggle functional
- [ ] "X of N" counter visible in tote header + putaway progress
- [ ] Smooth 150ms screen transitions
- [ ] Haptic feedback on mobile
- [ ] Keyboard + screen reader accessible
- [ ] No regression in existing putaway functionality
- [ ] Build succeeds, no TypeScript errors
