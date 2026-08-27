# Outbound UI Test Plan — 100 Manual Test Cases

**Date:** 2026-08-26 · **Environment:** local dev — web `http://localhost:5173`, API `http://localhost:8080`, DB `gowms@localhost:5432`
**Tester:** Buffy (driving the real UI via browser automation)
**Login:** `qatester / Test1234!` (role admin)

## Fixtures

| Fixture | Value |
|---|---|
| WH | 1 — Main warehouse |
| Stocked items | `36001055` ×50 @ bin `A-02-02-01`; `item` ×150 @ `A-02-02-03`; `BA102003` ×5 @ `A-03-01-01` |
| Scan simulation | type codes into scan inputs (camera not available headless) |

## Coverage areas

A. Auth & navigation (1–8) · B. Counter sale M1 (9–34) · C. Single-order M2 incl. SO/pick/pack/dispatch (35–66) · D. Wave + consolidation M3 (67–86) · E. Shortage "can't find it" flow (87–94) · F. Cross-cutting UX/console/RF (95–100)

---

### A. Auth & navigation

| # | Case | Expected |
|---|------|----------|
| 1 | Open `/` unauthenticated | Login page renders, no console errors |
| 2 | Login with wrong password | Error message shown, stays on login |
| 3 | Login `qatester/Test1234!` | Redirects to dashboard/home |
| 4 | Outbound nav section visible | Sales Order, Counter Sale, Pick, Pack, Dispatch, Consolidate, Shortage review present |
| 5 | Navigate to `/counter-sale` | Page renders cart step |
| 6 | Navigate to `/shortage-review` | Page renders pending tab |
| 7 | Navigate to `/consolidate` | Page renders wave input/status |
| 8 | Logout → protected route blocked | Redirects to login |

### B. Counter sale (M1)

| # | Case | Expected |
|---|------|----------|
| 9 | Cart defaults | Customer=Walk-in, one empty line, payment Cash |
| 10 | Find stock w/o item | "Cart empty" error toast |
| 11 | Item autocomplete suggests `36001055` | Suggestions appear on typing |
| 12 | Select item shows name/rate/GST | Line enriched from master |
| 13 | Qty edit updates total live | Total = rate×qty×(1−disc)+tax |
| 14 | Discount % reduces line amount | Amount reflects discount |
| 15 | Add second line | New empty row appears |
| 16 | Remove line | Row disappears, totals update |
| 17 | Allocate (Find stock) success | Step → pick; session created |
| 18 | Allocation reserves stock | DB reserved_qty ↑ for picked bins |
| 19 | Unknown item allocation | Rejected with clear error |
| 20 | Item with zero stock | Shortage warning toast lists shortfall |
| 21 | Guided pick prompts location | Shows bin + item + remaining qty |
| 22 | Scan correct location | Prompt advances to item scan |
| 23 | Scan correct item ×qty | Line completes, next prompt or done |
| 24 | Scan wrong item at location | Rejected, no progress |
| 25 | Over-scan beyond allocated qty | Blocked (over-pick) |
| 26 | Cant-find flag on a line | Line leaves queue, flag created (SF-) |
| 27 | Override scan w/o reason | Blocked: reason required |
| 28 | Override with reason (admin) | Accepted (has picking.override) |
| 29 | Complete before finishing picks | Blocked or warns appropriately |
| 30 | Complete sale w/ Cash | Receipt step; invoice no shown; success toast |
| 31 | Payment mode switch UPI/Card/Credit | Completes and records mode |
| 32 | Invoice PDF endpoint | PDF URL returns 200 application/pdf |
| 33 | Cancel session mid-flow | Reservations released |
| 34 | Totals on receipt = cart totals | Net/tax/grand consistent |

### C. Single order fulfillment (M2)

| # | Case | Expected |
|---|------|----------|
| 35 | `/sales-orders` list renders | Existing rows visible |
| 36 | New SO validation (no lines/item) | Inline error, no create |
| 37 | Create SO with stocked item ×2 | SO appears, status draft/open |
| 38 | Confirm SO | wms_status → confirmed |
| 39 | Set priority | Priority saved + label |
| 40 | Create pick from SO | Success; pick list id returned |
| 41 | Double create-pick same SO | Guarded (conflict) OR net-open only remainder |
| 42 | Redirect/deep-link to pick job | Pick UI opens for that list |
| 43 | Job header shows SO/customer/lines | Correct data |
| 44 | Prompt shows location code | Matches FEFO bin |
| 45 | Scan wrong location | Drift warn/reject per config |
| 46 | Scan location then item | Progress increments |
| 47 | Repeat-scan ×qty completes line | Status picked at target |
| 48 | Typed qty entry path | Works for large qty |
| 49 | Over-pick attempt | Blocked with message |
| 50 | Partial pick leaves line open | List stays in progress |
| 51 | All lines picked → list completed | Status auto-completes |
| 52 | SO line picked_qty synced | DB sales_order_items.picked_qty ↑ |
| 53 | SO header per_picked % | Updates (e.g., 100%) |
| 54 | Pack page opens w/ pick_list_id | Box create UI ready |
| 55 | Create box linked to pick list | Box label generated |
| 56 | Scan items into box one-by-one | box_items rows accumulate; UI count ↑ |
| 57 | Over-pack beyond picked qty | Blocked (gate B3) if enforced |
| 58 | Wrong SKU into box | Blocked/warned vs pick lines |
| 59 | Reverse item from box | Quantity removed |
| 60 | Close/load box | Loaded state set |
| 61 | Create trip (dispatch) | Trip no DT-… draft/scheduled |
| 62 | Load boxes onto trip | Load log; stock consume path fires |
| 63 | Start trip | in_transit |
| 64 | POD capture on stop | Signature/text stored |
| 65 | Complete trip | DN generated; appears in Delivery Notes |
| 66 | Cancel pick persists 'cancelled' | DB status = cancelled (B4 fix) |

### D. Wave + consolidation (M3)

| # | Case | Expected |
|---|------|----------|
| 67 | Create wave from ≥2 confirmed SOs | Wave pick list created (mode wave) |
| 68 | Wave aggregates demand by item | Aggregated qty = sum of SO lines |
| 69 | wave_order_lines attribution rows | Per-SO shares recorded |
| 70 | Wave lines ordered by location | Walk sequence sorted by bin code |
| 71 | Pick wave line scans | Aggregate qty counts up |
| 72 | Consolidate page loads wave | Status board renders (poll 5s) |
| 73 | Scan unknown item | Error verdict, no placement |
| 74 | Scan known wave item | Instruction: order + suggested box |
| 75 | Place into suggested box | Placed; returns to item phase |
| 76 | Place into new box label | Auto-creates box for that order |
| 77 | Placement quantity editable | Qty respected within remaining |
| 78 | Over-place beyond picked share | Blocked |
| 79 | Second box when first fills | Sibling box suggested/created |
| 80 | Per-order separation | Different orders → different boxes |
| 81 | Status board progress | Orders show packed/remaining |
| 82 | Reconcile clean wave | Success, leftover 0 |
| 83 | Reconcile with leftover → force panel | Panel opens w/ reason+resolution |
| 84 | Force return_to_stock | Leftover returned; audit row |
| 85 | Reconciliations history listed | GET reconciliations renders rows |
| 86 | Wave cancel/blocked states | Sensible errors, no partial junk |

### E. Shortage review (can't-find-it)

| # | Case | Expected |
|---|------|----------|
| 87 | Flag from pick job appears pending | Row in /shortage-review pending tab |
| 88 | Flag detail fields | SO, item, bin, qty, reason, SF-no |
| 89 | Approve flag | Backorder BO2-… created; toast |
| 90 | Backorder visible in Backorders page | New v2 backorder listed |
| 91 | Re-review approved flag | Conflict "already reviewed" |
| 92 | Reject without note | Note-required error |
| 93 | Reject with note | Line re-enters queue; reservation restored |
| 94 | All-tab shows reviewed history | Approved/rejected rows visible |

### F. Cross-cutting

| # | Case | Expected |
|---|------|----------|
| 95 | Console clean on all outbound pages | No uncaught errors |
| 96 | Failed API surfaces toast | e.g., consolidate bad wave id |
| 97 | RF layout ≤768px viewport | Scanner layout used |
| 98 | Desk layout >768px | Table/forms layout |
| 99 | Refresh mid-session keeps route | Same page reloads cleanly |
| 100 | Notifications emitted on events | Bell/toast on flag/approve/backorder |

## Execution notes

Results are recorded in `docs/QA_OUTBOUND_100_RESULTS.md` as cases are executed. API-level checks
(DB state assertions, PDF fetch) supplement UI observation where the UI cannot display internals;
every functional step itself is driven through the real UI.
