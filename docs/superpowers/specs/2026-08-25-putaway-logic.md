# Putaway Logic

**Date:** 2026-08-25  
**Status:** Gap analysis / target design  
**Related:**  
- `docs/superpowers/specs/2026-08-17-putaway-wizard-redesign.md`  
- `docs/superpowers/plans/2026-08-17-putaway-wizard-redesign.md`  
- `docs/superpowers/plans/2026-08-17-partial-putaway-user-tracking.md`  
- Key code: `web/src/pages/PutawayWizard.tsx`, `web/src/pages/PutawayRunner.tsx`, `api/modules/putaway/handler.go`, `api/modules/putaway/session_handler.go`

---

## 1. Goal / intended process

Putaway should be a **two-phase, physical-tote RF workflow**:

1. **Pick phase** — Operator scans a physical tote, picks items from `INCOMING-01` (piece-by-piece), and stock temporarily moves to the **operator/user tote location** (cart / user ID location).
2. **Place phase** — System directs the operator to a destination bin; they scan the location, then scan and put items one by one; stock moves from the user tote location to the **final bin**.

Two entry modes share that model:

| Mode | How work is chosen | Physical tote |
|------|--------------------|---------------|
| **By zone** | System presents items to pick from a zone (source: INCOMING) | Required — scan tote before piece scans |
| **By item** | Operator scans tote first, then scans which items to pick | Required — tote is the cart |

---

## 2. Flow A — Putaway by zone

1. User selects **putaway by zone**.
2. System presents **item(s) to pick** from `INCOMING-01`.
3. User **scans the tote** (physical tote barcode).
4. System shows **item name + qty to scan**; user scans items **one by one**.
5. After completing the pick scan, system updates item location to the **user’s ID location** (operator / user tote / cart location).
6. System asks the user to **go to the destination location**.
7. User **scans the location barcode**.
8. System suggests **item name, code, qty** to put.
9. User scans and puts items **one by one**.
10. Putaway complete; item location updates to the **final bin**.

---

## 3. Flow B — Putaway by item

1. User **scans the tote**.
2. System prompts to **scan item**.
3. On pick confirmation, **item location updates to user ID** (operator tote location).
4. User picks **all items** (or up to capacity).
5. User clicks **Done**.
6. System **suggests location**.
7. User goes to that location and **scans the location**.
8. System prompts item; user **scans items and puts** to the location.
9. Location updates to the **final bin**.

---

## 4. Current implementation (what exists today)

### Desk wizard — `/putaway` (`PutawayWizard.tsx`)

- Modes: **By Zone** / **By Item**.
- “Tote” is a **logical session tote**, not a physical tote barcode scan.
- Pick step **reserves** quantity on the source (`INCOMING`); stock does **not** move to an operator location.
- **Start Putaway** → system suggests a bin → user scans location → **place** moves stock `INCOMING` → final bin.
- Zone means **HSN A–G** (velocity / HSN banding), not a physical aisle / warehouse zone.

### Floor runner — `/putaway-runner` (`PutawayRunner.tsx`)

- Scan item → suggest location → **Place** once.
- **No** two-phase pick-then-place.
- **No** physical tote / cart.

### Stock timing

- Stock stays on **INCOMING** during pick.
- Inventory location changes only on **place / confirm**.

### Zones

- Zone = **HSN A–G**, not physical aisle / rack zone.

### Missing inventory concepts

- **No** physical tote as an inventory-holding location.
- **No** operator / user-location stock (cart bin keyed to user ID).

### Backend

- Session and place APIs live under `api/modules/putaway/` (`handler.go`, `session_handler.go`).
- Sessions support desk wizard flow; they do not model move-to-user-on-pick or RF two-phase tote carts as inventory locations.

---

## 5. Gap analysis

| Expected (target) | Actual (today) |
|-------------------|----------------|
| Physical tote barcode scan binds work to a cart | Logical session “tote” only; no physical tote barcode as inventory |
| Stock moves to **user ID / operator tote location** on pick complete | Stock stays on `INCOMING` until place |
| Piece-by-piece item scans on pick | Desk: pick/reserve UX; floor: scan item then place — not full piece-by-piece two-phase |
| Piece-by-piece item scans on place | Desk place can move reserved qty; floor is single Place action |
| Explicit “go to destination” after pick, then scan location | Desk: suggest + scan location after Start Putaway; floor: suggest + Place in one step |
| Two-phase RF: pick → cart → place | Floor runner is single-phase; desk is reserve-then-place without cart location |
| Zone = physical putaway zone / aisle grouping | Zone = HSN A–G |
| Operator cart is a real inventory location | No user-location / cart bin stock model |
| By-item: tote first, then items, Done, then place | By-item exists on desk but without physical tote + move-to-user |

---

## 6. Bottom line — what to build

To match the target flows, build:

1. **Physical tote / cart location** — Treat scanned totes (and/or per-user cart bins) as inventory locations that can hold stock in transit.
2. **Move-to-user on pick** — On completed pick scans, move qty from `INCOMING-01` to the operator’s tote/user location (not merely reserve on INCOMING).
3. **Piece-by-piece scans** — Require per-unit (or per-scan) item confirmation on both pick and place phases.
4. **RF two-phase flow** — Unify desk and floor around: scan tote → pick to cart → navigate to suggested bin → scan location → scan/put pieces → final bin. Extend `/putaway-runner` (and align `/putaway`) so floor RF supports the full two-phase model, not Place-once.

Until those exist, current putaway is **logical session + reserve-on-INCOMING + place-to-bin**, with HSN zones and no operator-held stock.
