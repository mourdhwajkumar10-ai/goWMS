# Putaway RF Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PutawayWizard`'s custom desk UI (`putaway-wizard.css`, `Pick` buttons, `ScannerInput`/`ButtonPress`) with the exact Receiving RF shell (`ScannerLayout` + `VerificationHeader` + `ScanCard` + `CameraScanner` + `scanner.css` oklch tokens), and fix the 5 gaps in `PutawayRunner` so both entrypoints are one scan-only flow: `mode_select` → `zone_select` → `scan_items` (x of n) → `suggest_location` (hard location) → `item_confirm` (re-scan item, qty progress) → `complete`.

**Architecture:** Keep `/putaway` (canonical) and `/putaway-runner` → redirect to `/putaway` per spec `2026-08-27-putaway-rf-session-consolidation-design.md:12-13`. Both render the same RF shell (`ScannerLayout` + `VerificationHeader` sticky header `VerificationHeader.tsx:32-108`, `ScanCard` `ScanCard.tsx:1-81`, `ScanViewport` `ScanViewport.tsx:1-38`, `ScanVerdict` `ScanVerdict.tsx:1-31`, `CameraScanner` `CameraScanner.tsx:1-408` embedded `minimal` + `continuous`, `scan-flash` `scanner.css:877-889`, `scan-progress-bar` `scanner.css:562-570`, `verdict` `scanner.css:73-76`). Remove unscanned controls: `Try next location` without scan `PutawayRunner.tsx:111-116`, quantity edit exceeding `picked_qty`, single-click `Place`. Reuse canonical session endpoints `spec:72-84` (`GET /putaway/queue`, `/putaway/queue/zones`, `GET /putaway/suggest`, `POST /putaway/sessions`, `POST /sessions/:id/pick`, `POST /sessions/:id/place/:itemId`, `POST /sessions/:id/complete`). No new backend.

**Tech Stack:** React 18 + TS, React Router, `scanner.css` + `receiving-wizard.css` tokens, `CameraScanner` (BarcodeDetector), `useScannerToasts` `ScannerLayout.tsx:40-47`, `useScanFeedback`.

---

## Global Constraints

- No new deps. 52px taps `scanner.css:55`, 1rem radius `scanner.css:32`, `verdict 0.28s cubic-bezier(0.22,1,0.36,1)` `scanner.css:665`.
- Camera-first: `CameraScanner` in `ScanCard.viewport` with crosshair/scan-line/flash `CameraScanner.tsx:118-140`.
- `scan-flash.show.ok|err` full-screen 400ms fade, `scan-toast` 2.2s. Hard location: reject anything not `suggestion.location_code` (case-insensitive). Item confirm: enable `Place` only after re-scan matches `currentItem.item_code`.

---

## File Map

| File | Action |
|---|---|
| `web/src/styles/putaway-wizard.css` | **Delete** `PutawayWizard.tsx:11` |
| `web/src/pages/PutawayWizard.tsx` | **Rewrite** (~650 lines, see tasks) |
| `web/src/pages/PutawayRunner.tsx` | **Modify** 5 fixes `PutawayRunner.tsx:227-268,111-116,244` |
| `web/src/__tests__/PutawayWizard.test.tsx` | **Rewrite** (scan-only assertions) |
| `web/src/__tests__/PutawayRunner.test.tsx` | **Create** |
| `web/src/App.tsx:130-132` | Add `Navigate /putaway-runner → /putaway` if not already |

---

## Task 1 — Delete `putaway-wizard.css`

**Files:**
- Delete: `web/src/styles/putaway-wizard.css`
- Modify: `web/src/pages/PutawayWizard.tsx:11` (remove import)
- Verify: `web/src/pages/PutawayRunner.tsx` imports `scanner.css`

**Interfaces:**
- Produces: Clean slate — no custom putaway styles, only `scanner.css` tokens

- [ ] **Step 1: Delete file and remove import**
```bash
rm web/src/styles/putaway-wizard.css
```
Edit `web/src/pages/PutawayWizard.tsx` line 11: remove `import '../styles/putaway-wizard.css'`

- [ ] **Step 2: Run build to verify no missing CSS**
```bash
cd web && npm run build
```
Expected: Build succeeds (CSS warning gone)

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "chore: remove putaway-wizard.css, use scanner.css"
```

---

## Task 2 — PutawayWizard: `mode_select` + `zone_select` in Receiving shell

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx` (replace lines 407-513 with ScannerLayout implementation)
- Test: `web/src/__tests__/PutawayWizard.test.tsx`

**Interfaces:**
- Consumes: `api.putawayQueue()`, `api.get('/putaway/queue/zones')`, `ScannerLayout`, `VerificationHeader`, `ScanCard`, `CameraScanner`, `ScannerToastBar`, `useScannerToasts`, `useScanFeedback`, `useHaptic`, `useRfUi`
- Produces: `mode_select` and `zone_select` steps with scan-select-card pattern

- [ ] **Step 1: Write failing tests for mode_select screen**
```tsx
// web/src/__tests__/PutawayWizard.test.tsx (replace entire file)
it('renders mode cards in ScannerLayout, no Pick buttons in queue preview', async () => {
  render(<PutawayWizard/>)
  expect(screen.getByText('By Zone')).toBeInTheDocument()
  expect(screen.queryByText('Pick')).not.toBeInTheDocument()
})
it('zone grid shows ZONE_LABELS and counts', async () => {
  mockApi.get.mockResolvedValue({ok:true,data:[{zone:'A',count:5}]})
  fireEvent.click(screen.getByText('By Zone'))
  await waitFor(()=>expect(screen.getByText('Bicycle/Motorcycle Parts')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: FAIL - elements not found

- [ ] **Step 3: Implement mode_select + zone_select using ScannerLayout**
```tsx
import ScannerLayout, {useScannerToasts, ScannerToastBar} from '../components/ScannerLayout'
import VerificationHeader from '../components/scan/VerificationHeader'
import ScanCard from '../components/scan/ScanCard'
import CameraScanner from '../components/CameraScanner'
import {useScanFeedback} from '../hooks/useScanFeedback'

// State
const [step, setStep] = useState<'mode_select'|'zone_select'|'scan_items'|'suggest_location'|'item_confirm'|'complete'>('mode_select')
const [mode, setMode] = useState<'zone'|'item'|null>(null)

// mode_select
if(step==='mode_select') return (
  <ScannerLayout title="Putaway" noBack flash={flash}>
    <ScannerToastBar toasts={toasts}/>
    <div className="scan-select-list">
      <button className="scan-select-card" onClick={()=>{setMode('zone');setStep('zone_select')}}>…By Zone…{queue.length} pending / {zones.length} zones</button>
      <button className="scan-select-card" onClick={()=>{setMode('item');setStep('scan_items')}}>…By Item…</button>
    </div>
    {queue.slice(0,5).map(q=> <div key={q.id} className="scan-row"><div className="scan-row-info"><div className="scan-row-code">{q.item_code}</div><div className="scan-row-desc">{q.location_code}</div></div><div className="scan-row-meta"><div className="scan-row-qty">{q.qty}</div></div></div>)}
  </ScannerLayout>
)

// zone_select
if(step==='zone_select') return (
  <ScannerLayout title="Select Zone" onBack={()=>setStep('mode_select')} flash={flash}>
    <ScannerToastBar toasts={toasts}/>
    <VerificationHeader counted={0} total={0} po="" pl="" grn="" tab="boxes" onTabChange={()=>{}} onBack={()=>setStep('mode_select')} title="Select Zone" />
    {dataLoading ? <SkeletonCards count={4} /> : (
      <div className="scan-select-list">
        {zones.map(z => (
          <button key={z.zone} className="scan-select-card" onClick={()=>{setSelectedZone(z.zone);setStep('scan_items')}}>
            <div className="scan-select-card-title">{ZONE_LABELS[z.zone]||`Zone ${z.zone}`}</div>
            <div className="scan-select-card-sub">{z.count} items ready for putaway</div>
          </button>
        ))}
      </div>
    )}
  </ScannerLayout>
)
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayWizard.tsx web/src/__tests__/PutawayWizard.test.tsx
git commit -m "feat(putaway): mode_select + zone_select with ScannerLayout"
```

---

## Task 3 — PutawayWizard: `scan_items` (scan-only tote build, x of n)

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx` (replace item_pick + handlePick + handleScanPick with scan_items)
- Test: `web/src/__tests__/PutawayWizard.test.tsx`

**Interfaces:**
- Consumes: Same as Task 2 + `api.putawaySuggest`, `api.post('/putaway/sessions')`, `api.post('/putaway/sessions/:id/pick')`
- Produces: Scan-only tote with x of n counter, VerificationHeader counted/total

- [ ] **Step 1: Write failing test for scan_items**
```tsx
it('scan item → calls pick API → shows x of n in VerificationHeader', async () => {
  mockApi.putawayQueue.mockResolvedValue({ok:true,data:[queuedItem]})
  mockApi.post.mockResolvedValue({ok:true,data:{id:100}})
  render(<PutawayWizard/>)
  fireEvent.click(screen.getByText('By Item'))
  await waitFor(()=>expect(screen.getByText('Scan Items')).toBeInTheDocument())
  // simulate scan
  const scanInput = screen.getByPlaceholderText(/scan item/i)
  fireEvent.change(scanInput, {target:{value:'ITEM-1'}})
  fireEvent.keyDown(scanInput, {key:'Enter'})
  await waitFor(()=>expect(screen.getByText(/1 of 1/)).toBeInTheDocument())
  expect(mockApi.post).toHaveBeenCalledWith('/putaway/sessions', expect.anything())
  expect(mockApi.post).toHaveBeenCalledWith('/putaway/sessions/1/pick', expect.anything())
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement scan_items step**
```tsx
// scan_items
if(step==='scan_items') {
  const zoneItems = selectedZone ? queue.filter(q=>q.zone===selectedZone) : queue
  const totePicked = toteItems.filter(i=>i.status==='picked')
  return (
    <ScannerLayout title="Scan Items" onBack={()=>setStep(mode==='zone'?'zone_select':'mode_select')} flash={flash}>
      <ScannerToastBar toasts={toasts}/>
      <VerificationHeader
        counted={totePicked.length}
        total={zoneItems.length}
        po="PUTAWAY"
        pl={selectedZone?`Zone ${selectedZone}`:'All'}
        grn={session?.id?`#${session.id}`:'—'}
        tab="boxes"
        onTabChange={()=>{}}
        onBack={()=>setStep(mode==='zone'?'zone_select':'mode_select')}
        title="Scan Items"
      />
      <ScanCard
        state={scanState}
        code={lastScanCode}
        reason={scanReason}
        onRestart={restartScanner}
        onManualEntry={onItemScan}
        placeholder="Scan item barcode..."
        viewport={
          <CameraScanner embedded minimal continuous onClose={restartScanner} onScan={onItemScan} />
        }
      />
      {/* Tote list */}
      {toteItems.length>0 && (
        <div className="scan-section-title">Tote ({totePicked.length} of {zoneItems.length})</div>
      )}
      {/* Available queue - scan rows only, no Pick button */}
      <div className="scan-section-title">Available ({zoneItems.length})</div>
      {zoneItems.map(q => {
        const inTote = toteItems.some(t=>t.item_code===q.item_code && t.status==='picked')
        return (
          <div key={q.id} className={`scan-row ${inTote?'ring-accent':''}`}>
            <div className="scan-row-info">
              <div className="scan-row-code">{q.item_code}</div>
              <div className="scan-row-desc">{q.item_name||''} · {q.location_code}</div>
            </div>
            <div className="scan-row-meta">
              <div className="scan-row-qty">{q.qty}</div>
              <div className="scan-row-label">{inTote?'Scanned':'Pending'}</div>
            </div>
          </div>
        )
      })}
      <div style={{padding:'12px 16px',marginTop:'auto'}}>
        <button className="scan-btn scan-btn-primary" style={{width:'100%',minHeight:52}} disabled={totePicked.length===0} onClick={()=>setStep('suggest_location')}>
          Start Putaway →
        </button>
      </div>
    </ScannerLayout>
  )
}

// onItemScan: match queue, ensureSession, POST /pick, append to toteItems, fb.ok/fb.warn, doFlash
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayWizard.tsx web/src/__tests__/PutawayWizard.test.tsx
git commit -m "feat(putaway): scan_items step - scan-only tote with x of n"
```

---

## Task 4 — PutawayWizard: `suggest_location` (hard location scan)

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx` (replace putaway step with suggest_location)
- Test: `web/src/__tests__/PutawayWizard.test.tsx`

**Interfaces:**
- Consumes: `api.putawaySuggest` (auto-fetched on entering step)
- Produces: Suggestion card + ScanCard with hard location validation

- [ ] **Step 1: Write failing test for hard location validation**
```tsx
it('wrong bin scan → rejected verdict, no place call', async () => {
  // setup to suggest_location step
  mockApi.putawaySuggest.mockResolvedValue({ok:true,data:{location_id:2,location_code:'BIN-2',reason:'Velocity',free_capacity:100,on_hand_qty:0,candidates:[],velocity_tier:'A',shelf_band:'1'}})
  // scan wrong location
  const scanInput = screen.getByPlaceholderText(/scan destination bin/i)
  fireEvent.change(scanInput, {target:{value:'WRONG-BIN'}})
  fireEvent.keyDown(scanInput, {key:'Enter'})
  await waitFor(()=>expect(screen.getByText(/rejected/i)).toBeInTheDocument())
  expect(mockApi.post).not.toHaveBeenCalledWith(expect.stringContaining('/place'))
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement suggest_location with hard validation**
```tsx
// On entering suggest_location, fetch suggestion for current tote item
useEffect(() => {
  if(step==='suggest_location' && currentToteItem()) {
    void api.putawaySuggest(cti.item_code, cti.qty, session?.warehouse_id, {excludeLocationIds: usedLocationIds})
      .then(r=>r.ok&&setSuggestion(r.data))
  }
}, [step, currentToteItem, usedLocationIds])

// suggest_location step
if(step==='suggest_location' && suggestion) return (
  <ScannerLayout title="Putaway" onBack={()=>setStep('scan_items')} flash={flash}>
    <ScannerToastBar toasts={toasts}/>
    <VerificationHeader counted={placedCount} total={totalCount} po="PUTAWAY" pl="" grn="" tab="boxes" onTabChange={()=>{}} onBack={()=>setStep('scan_items')} title={`Place ${cti.item_code}`} />
    <div className="pw-suggestion-card">
      <div className="pw-location-code">{suggestion.location_code}</div>
      <div className="pw-suggestion-meta">Reason: {suggestion.reason} · Velocity: {suggestion.velocity_tier} · Shelf: {suggestion.shelf_band} · Free: {suggestion.free_capacity}</div>
    </div>
    <ScanCard
      state={scanState}
      code={lastScanCode}
      reason={scanReason}
      onRestart={restartScanner}
      onManualEntry={onLocationScan}
      placeholder="Scan destination bin..."
      viewport={<CameraScanner embedded minimal continuous onClose={restartScanner} onScan={onLocationScan} />}
    />
  </ScannerLayout>
)

// onLocationScan:
const clean = code.trim().toUpperCase()
if(clean !== suggestion.location_code.toUpperCase()) {
  const cand = suggestion.candidates?.find(c=>c.location_code.toUpperCase()===clean)
  if(!cand) { setScanState('rejected'); fb.warn(); doFlash('error'); toast(`Must scan ${suggestion.location_code}`,'error'); return }
  // candidate match → treat as override
}
setScannedLocation({id:suggestion.location_id, code:suggestion.location_code})
setScanState('accepted')
fb.ok()
doFlash('success')
setStep('item_confirm')
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayWizard.tsx web/src/__tests__/PutawayWizard.test.tsx
git commit -m "feat(putaway): suggest_location with hard location validation"
```

---

## Task 5 — PutawayWizard: `item_confirm` (re-scan item, one-by-one, next location)

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx` (add item_confirm step, replace doPlace logic)
- Test: `web/src/__tests__/PutawayWizard.test.tsx`

**Interfaces:**
- Consumes: `api.post('/putaway/sessions/:id/place/:itemId')`, suggestion for next location
- Produces: Item re-scan flow with qty progress, auto-advance to next location

- [ ] **Step 1: Write failing test for item confirm flow**
```tsx
it('after location accept → re-scan item → place → next location suggested', async () => {
  // setup: at item_confirm with cti.qty=10
  // scan wrong item → rejected
  // scan correct item → accepted → POST /place called with qty:1
  // progress 1/10 shown
  // when all 10 placed → next suggestion auto-fetched
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement item_confirm with qty loop**
```tsx
// item_confirm step
if(step==='item_confirm' && cti && scannedLocation) return (
  <ScannerLayout title="Confirm Placement" onBack={()=>setStep('suggest_location')} flash={flash}>
    <ScannerToastBar toasts={toasts}/>
    <VerificationHeader counted={placedAtBin} total={cti.qty} po="PUTAWAY" pl={scannedLocation.code} grn="" tab="boxes" onTabChange={()=>{}} onBack={()=>setStep('suggest_location')} title={`Place ${cti.item_code} at ${scannedLocation.code}`} />
    <div className="pw-bin-progress">Placed {placedAtBin} of {cti.qty} at {scannedLocation.code}</div>
    <ScanCard
      state={scanState}
      code={lastScanCode}
      reason={scanReason}
      onRestart={restartScanner}
      onManualEntry={onItemConfirm}
      placeholder={`Scan ${cti.item_code} to place...`}
      viewport={<CameraScanner embedded minimal continuous onClose={restartScanner} onScan={onItemConfirm} />}
    />
  </ScannerLayout>
)

// onItemConfirm:
const clean = code.trim().toUpperCase()
if(clean !== cti.item_code.toUpperCase()) { setScanState('rejected'); fb.warn(); doFlash('error'); return }
const r = await api.post(`/putaway/sessions/${session.id}/place/${cti.id}`, {target_location_id:scannedLocation.id, qty:1})
if(r.ok) {
  fb.ok(); doFlash('success'); setPlacedAtBin(p=>p+1)
  if(placedAtBin >= cti.qty) {
    // item done, check for more tote items
    const next = toteItems.find(i=>i.status==='picked' && i.id!==cti.id)
    if(next) { setSelectedToteItemId(next.id); setStep('suggest_location'); setScannedLocation(null); setPlacedAtBin(0) }
    else { setStep('complete') }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayWizard.tsx web/src/__tests__/PutawayWizard.test.tsx
git commit -m "feat(putaway): item_confirm with re-scan and qty progress"
```

---

## Task 6 — PutawayWizard: `complete` + ScannerLayout polish

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx` (replace complete screen with rw-complete pattern)
- Test: `web/src/__tests__/PutawayWizard.test.tsx`

**Interfaces:**
- Produces: Complete screen with check circle, stats, placed items list

- [ ] **Step 1: Write failing test for complete screen**
```tsx
it('complete screen shows check circle, count, item→location list', async () => {
  // complete putaway
  await waitFor(()=>expect(screen.getByText(/putaway complete/i)).toBeInTheDocument())
  expect(screen.getByText(/✓/)).toBeInTheDocument()
  expect(screen.getByText(/placed successfully/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Implement complete screen using rw-complete pattern**
```tsx
// complete step
if(step==='complete') return (
  <ScannerLayout title="Putaway Complete" noBack flash={flash}>
    <ScannerToastBar toasts={toasts}/>
    <div className="rw-complete" style={{padding:16}}>
      <div className="rw-complete-icon">✓</div>
      <div className="rw-complete-title">Putaway Complete!</div>
      <div className="rw-complete-stats">
        <div className="rw-complete-stat"><div className="rw-complete-stat-value">{placedItems.length}</div><div className="rw-complete-stat-label">Items placed</div></div>
        <div className="rw-complete-stat"><div className="rw-complete-stat-value">{usedLocationIds.length}</div><div className="rw-complete-stat-label">Bins used</div></div>
      </div>
      <div className="scan-section-title">Placed Items</div>
      {placedItems.map(item=>(
        <div key={item.id} className="scan-row">
          <div className="scan-row-info">
            <div className="scan-row-code">{item.item_code}</div>
            <div className="scan-row-desc">{item.item_name||''} → {item.target_location_code}</div>
          </div>
          <div className="scan-row-meta"><div className="scan-row-qty">{item.qty}</div></div>
        </div>
      ))}
      <div style={{padding:'12px 16px',marginTop:'auto'}}>
        <button className="scan-btn scan-btn-primary" style={{width:'100%',minHeight:52}} onClick={()=>{resetWizard();setStep('mode_select')}}>New Putaway</button>
      </div>
    </div>
  </ScannerLayout>
)
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayWizard.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayWizard.tsx web/src/__tests__/PutawayWizard.test.tsx
git commit -m "feat(putaway): complete screen with rw-complete pattern"
```

---

## Task 7 — PutawayRunner fix 1: Hard location validation

**Files:**
- Modify: `web/src/pages/PutawayRunner.tsx:227-237` (suggest_location handler)

**Interfaces:**
- Consumes: `suggestion.location_code`, `suggestion.candidates`
- Produces: Rejected verdict for non-matching scans

- [ ] **Step 1: Write failing test for hard location**
```tsx
// web/src/__tests__/PutawayRunner.test.tsx
it('wrong bin scan → rejected, correct bin → accepted', async () => {
  // setup to suggest_location
  fireEvent.change(scanInput, {target:{value:'WRONG'}})
  fireEvent.keyDown(scanInput, {key:'Enter'})
  await waitFor(()=>expect(screen.getByText(/rejected/i)).toBeInTheDocument())
  fireEvent.change(scanInput, {target:{value:'BIN-2'}})
  fireEvent.keyDown(scanInput, {key:'Enter'})
  await waitFor(()=>expect(screen.getByText(/accepted/i)).toBeInTheDocument())
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayRunner.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Apply fix**
```tsx
// PutawayRunner.tsx:227-237
if(step === 'suggest_location') {
  const clean = code.trim().toUpperCase()
  const targetCode = suggestion.location_code.toUpperCase()
  if(clean !== targetCode) {
    const cand = suggestion.candidates?.find(c=>c.location_code.toUpperCase()===clean)
    if(!cand) { doFlash('error'); toast(`Scan ${suggestion.location_code}`, 'error'); return }
    // candidate match allowed as override
  }
  setScannedLocation({id:suggestion.location_id, code:suggestion.location_code})
  doFlash('success')
  toast(`✓ Bin ${suggestion.location_code} confirmed`, 'success')
  setStep('item_confirm')
  return
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayRunner.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayRunner.tsx web/src/__tests__/PutawayRunner.test.tsx
git commit -m "fix(putaway-runner): hard location validation"
```

---

## Task 8 — PutawayRunner fix 2: Remove `Try next →` button

**Files:**
- Modify: `web/src/pages/PutawayRunner.tsx` lines 98-120 (SuggestionCard) and 111-116
- Test: `web/src/__tests__/PutawayRunner.test.tsx`

- [ ] **Step 1: Write failing test**
```tsx
it('no Try next button in SuggestionCard', () => {
  expect(screen.queryByText(/try next/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayRunner.test.tsx
```
Expected: FAIL (button exists)

- [ ] **Step 3: Remove Try next button and onTryNext prop**
```tsx
// Delete SuggestionCard onTryNext and button at lines 111-116
// Alternative bin only via physical scan matching a candidate
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayRunner.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayRunner.tsx web/src/__tests__/PutawayRunner.test.tsx
git commit -m "fix(putaway-runner): remove Try next location button"
```

---

## Task 9 — PutawayRunner fix 3: Qty handling + zone tabs for Item mode

**Files:**
- Modify: `web/src/pages/PutawayRunner.tsx` (place_items qty loop, add zone tabs for Item mode)
- Test: `web/src/__tests__/PutawayRunner.test.tsx`

- [ ] **Step 1: Write failing tests**
```tsx
it('place_items scans each unit, progress increments', async () => {
  // at place_items with qty=3
  fireEvent.change(scanInput, {target:{value:currentItem.item_code}})
  fireEvent.keyDown(scanInput, {key:'Enter'})
  await waitFor(()=>expect(screen.getByText(/1 of 3/)).toBeInTheDocument())
  // repeat 2 more times → complete
})
it('Item mode shows zone filter tabs', async () => {
  setMode('item')
  await waitFor(()=>expect(screen.getByText('Zone A')).toBeInTheDocument())
})
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd web && npm test -- src/__tests__/PutawayRunner.test.tsx
```
Expected: FAIL

- [ ] **Step 3: Fix place_items qty loop (already mostly correct at 242-268), add zone tabs to ProgressHeader for Item mode**
```tsx
// In ProgressHeader, add zone tabs when mode==='item' (chips/dots pattern)
{mode==='item' && zones.map(z=>(
  <button key={z.zone} className={`scan-tab ${zone===z.zone?'active':''}`} onClick={()=>{setZone(z.zone);refreshQueue()}}>
    {z.zone} ({z.count})
  </button>
))}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd web && npm test -- src/__tests__/PutawayRunner.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add web/src/pages/PutawayRunner.tsx web/src/__tests__/PutawayRunner.test.tsx
git commit -m "fix(putaway-runner): qty handling + zone tabs for Item mode"
```

---

## Task 10 — Tests: Rewrite PutawayWizard.test.tsx + Create PutawayRunner.test.tsx

**Files:**
- Rewrite: `web/src/__tests__/PutawayWizard.test.tsx` (all scan-only assertions)
- Create: `web/src/__tests__/PutawayRunner.test.tsx`

**Interfaces:**
- Mock: `api`, `CameraScanner`, `useRfUi`, `useScanFeedback`, `useHaptic`, `ScannerLayout`, `VerificationHeader`, `ScanCard`, `ScannerToastBar`

- [ ] **Step 1: Full rewrite of PutawayWizard.test.tsx** covering:
  - mode_select renders ScannerLayout, no Pick buttons
  - zone_select shows ZONE_LABELS
  - scan_items: scan → pick API → x of n counter
  - suggest_location: wrong bin rejected, correct bin accepted
  - item_confirm: wrong item rejected, correct item → place → next location
  - complete: check circle, stats, item list

- [ ] **Step 2: Create PutawayRunner.test.tsx** covering:
  - mode_select
  - scan_items
  - suggest_location hard validation
  - item_confirm re-scan
  - complete
  - fixes: no Try next, zone tabs in Item mode

- [ ] **Step 3: Run all tests**
```bash
cd web && npm test
```
Expected: 78+ tests pass

- [ ] **Step 4: Commit**
```bash
git add web/src/__tests__/PutawayWizard.test.tsx web/src/__tests__/PutawayRunner.test.tsx
git commit -m "test(putaway): full test coverage for RF parity"
```

---

## Task 11 — Build + Manual Verify

- [ ] **Step 1: Build**
```bash
cd web && npm run build
```
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 2: Run tests**
```bash
cd web && npm test
```
Expected: All tests pass

- [ ] **Step 3: Manual E2E verification**
1. Start server: `go run cmd/server/main.go`
2. Navigate to `/putaway` (desk) → By Zone → Zone A → scan items (camera + type) → verify `1 of N` increments, no Pick buttons, progress bar fills, green flash → suggestion → scan wrong bin (red flash, rejected) → scan correct bin (green) → scan item again → place → progress `1/10` → repeat → next location auto-suggested → complete screen
3. Navigate to `/putaway-runner` → redirects to `/putaway` → same flow
4. Verify Item mode: zone tabs, scan item → place immediately (no tote batching if per-item choice)

- [ ] **Step 4: Final commit**
```bash
git add -A
git commit -m "feat(putaway): RF parity complete - Receiving UI patterns across Wizard + Runner"
```