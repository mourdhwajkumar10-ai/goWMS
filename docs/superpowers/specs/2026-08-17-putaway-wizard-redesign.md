# Putaway Wizard Redesign Spec

**Date:** 2026-08-17
**Status:** Approved
**Design Direction:** Minimal/modern (Linear/Notion/Vercel style)

---

## 1. Overview

Complete visual and interaction redesign of the putaway wizard (`/putaway` route, `PutawayWizard.tsx`). Keep the existing 6-step flow but elevate to a professional, mobile-first warehouse-grade UI with Apple-quality micro-interactions and native camera QR scanning.

---

## 2. Goals

- **Mobile-first:** Works great on smartphone cameras for QR scanning
- **Scanner UX:** Native camera access, instant feedback, torch support
- **Micro-interactions:** Apple-style press feedback on every tappable element
- **Visual polish:** Minimal/modern aesthetic (Linear/Notion/Vercel style)
- **Counter feature:** "X of N items" in tote section + putaway progress header

---

## 3. Design System

### Typography
- Font: System stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- Scale: 12/13/14/15/16/18/20/24/28/32px
- Weight: 400 (body), 500 (medium), 600 (semibold), 700 (bold)

### Spacing (8px grid)
- xs: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px, 2xl: 48px

### Colors
- Background: `#fafafa` (page), `#ffffff` (cards)
- Border: `#e5e7eb` (default), `#2563eb` (focus/active)
- Text: `#111827` (primary), `#6b7280` (secondary), `#9ca3af` (muted)
- Accent: `#2563eb` (primary actions)
- Success: `#059669`
- Warning: `#d97706`
- Error: `#dc2626`
- Zone colors: A=#2563eb, B=#059669, C=#7c3aed, D=#db2777, E=#ea580c, F=#0891b2, G=#65a30d

### Elevation
- Card: `border: 1px solid #e5e7eb; border-radius: 12px; background: #fff`
- Hover: `border-color: #2563eb; box-shadow: 0 4px 12px rgba(37,99,235,0.1)`
- Active/Press: `transform: scale(0.98); box-shadow: 0 2px 6px rgba(37,99,235,0.15)`

---

## 4. Micro-Interactions (Apple-Style)

### Button Press Feedback
```css
.btn-press {
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}
.btn-press:active {
  transform: scale(0.96);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
/* Mobile: also trigger haptic */
```

### Screen Transitions
- Slide in from right (150ms ease-out) when advancing
- Slide out to left (100ms ease-in) when going back
- Fade for modals/dropdowns (100ms)

### Scanner Feedback
- Vibration: `navigator.vibrate(10)` on successful scan
- Visual: Green flash border on scan input (300ms)
- Audio: Optional subtle beep (user preference)

---

## 5. Screen Designs

### 5.1 Mode Select
- Two large cards side-by-side (desktop) / stacked (mobile)
- Card: 200px min-height, icon (📦 By Zone / 📍 By Item), title, subtitle
- Queue banner below: large count (32px bold), "items pending in staging"
- Top 5 items preview as clean list rows

### 5.2 Zone Select
- Grid: 2-col desktop, 1-col mobile
- Zone card: colored letter badge (28px circle), zone name, item count, chevron
- Back button in header (← Mode Select)

### 5.3 Item Pick
**Tote Section (top):**
- Border: 2px accent blue
- Header: "📦 Tote" + **"3 of 10 items"** counter badge
- Scanner input: camera icon + "Scan item" placeholder
- `capture="environment"` for rear camera
- Autocomplete dropdown on focus/type
- Tote items list: code, name, qty, status badge (picked/placed)
- "Start Putaway →" primary button (enabled when tote has items)

**Available Items Section (below):**
- Scan input with autocomplete
- Item rows: code, name, location, qty, "+" button to add to tote

### 5.4 Putaway (Core)
**Progress Header:**
- "Placing item 3 of 10" + progress bar (30% filled)
- Progress bar: 6px height, accent fill, rounded

**Current Item Card:**
- Large item code (24px mono), name, qty badge
- Flow: FROM [location code] → TO [suggested location code]
- Suggestion card: large location code (28px mono), velocity tier badge, shelf band tag
- Free capacity indicator

**Location Scan:**
- Camera input with torch toggle button
- Autocomplete suggestions dropdown
- "Confirm Placement" primary button

**Exception Button:**
- "Doesn't Fit" secondary button → opens fit exception modal

**Tote Progress Sidebar (desktop) / Bottom Sheet (mobile):**
- Shows all tote items with status
- Current item highlighted

### 5.5 Fit Exception
- Amber warning panel (not modal — inline in putaway screen)
- Message: "Suggested location A-01-02-M has 0 free capacity"
- Actions:
  - Override Location (scan input)
  - Adjust Quantity (number input)
  - Skip Item (destructive)
- "Continue" to return to putaway

### 5.6 Complete
- Green checkmark circle (64px)
- "Putaway Complete" heading
- "10 items placed successfully" subtext
- List: item code → final location (clean rows)
- "Start New Putaway" primary button
- "Back to Dashboard" secondary button

---

## 6. Scanner/Camera UX (Mobile-First)

```tsx
// Scanner input component
<input
  type="file"
  accept="image/*"
  capture="environment"
  className="scanner-input"
  onChange={handleScan}
  style={{ display: 'none' }}
/>
<button className="scanner-trigger" onClick={() => inputRef.current?.click()}>
  <CameraIcon /> Scan
</button>
```

- **Rear camera by default** (`capture="environment"`)
- **Torch button:** `<button onClick={toggleTorch}>🔦</button>` (uses `ImageCapture` API)
- **Auto-focus:** Continuous for QR codes
- **Fallback:** Manual text entry always visible below
- **PWA:** Works offline, `manifest.json` for home screen install

---

## 7. "X of N Items" Counter

**Location 1: Tote Section Header (Item Pick)**
```
📦 Tote    [3 of 10 items]    [Start Putaway →]
```

**Location 2: Putaway Progress Header**
```
Placing item 3 of 10    [████████░░░░░░░░░░] 30%
```

Updates in real-time as items are placed.

---

## 8. Responsive Breakpoints

- Mobile: ≤480px (single column, bottom sheets)
- Tablet: 481-768px (2-col zones, side-by-side cards)
- Desktop: >768px (full layout, sidebar)

---

## 9. Accessibility

- Focus visible: `outline: 2px solid #2563eb; outline-offset: 2px`
- ARIA labels on all icon-only buttons
- Sufficient contrast (WCAG AA)
- Keyboard navigable (Tab, Enter, Escape)
- Screen reader announcements for scan results, step changes

---

## 10. Implementation Notes

### Files to Modify
- `web/src/pages/PutawayWizard.tsx` — complete rewrite
- `web/src/styles/putaway-wizard.css` — complete rewrite
- `web/src/components/ScannerInput.tsx` — new reusable component
- `web/src/components/ButtonPress.tsx` — new reusable component
- `web/src/hooks/useHaptic.ts` — new hook for vibration

### API Integration
- No backend changes needed
- Uses existing endpoints: `/api/putaway/queue`, `/api/putaway/zones`, `/api/putaway/sessions`, `/api/putaway/suggest`, `/api/putaway/pick`, `/api/putaway/place`

### State Management
- Keep existing React state (useState/useRef)
- Add `useReducer` for complex tote/session state if needed
- Persist session to `localStorage` for crash recovery

---

## 11. Success Criteria

- [ ] All 6 screens redesigned with minimal/modern aesthetic
- [ ] Apple-style press feedback on every interactive element
- [ ] Native camera scanner works on iOS Safari + Chrome Android
- [ ] Torch toggle functional
- [ ] "X of N" counter visible in both locations
- [ ] Smooth 150ms screen transitions
- [ ] Haptic feedback on mobile
- [ ] Works offline (PWA)
- [ ] Keyboard + screen reader accessible
- [ ] No regression in existing putaway functionality

---

## 12. Out of Scope

- Backend API changes
- New database migrations
- Multi-user session conflicts
- Voice commands
- Barcode scanning via camera (QR only for v1)