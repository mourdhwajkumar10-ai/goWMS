# Outbound Fulfillment — Business Guide

**Audience:** Warehouse managers, ops leads, sales desk, and floor teams  
**Date:** 2026-08-25  
**Companion:** Technical map exists for IT; this guide is for day-to-day work.

This document explains how goWMS moves a **sales order** from order entry to delivery, who does what, and when stock is held vs when it actually leaves the warehouse.

Throughout, labels mean:

| Label | Meaning |
|-------|---------|
| **How the system works today** | What goWMS already does |
| **Recommended practice** | Preferred way of working (SOP); may include small improvements not fully automated yet |

---

## 1. Who does what

| Role | Typical work | Main screens |
|------|----------------|--------------|
| **Sales desk** | Create and confirm sales orders, set priority, import orders | Sales Orders, Customers |
| **Warehouse desk** | Create pick lists from orders, print pick slips, run waves, cancel picks, manage backorders | Sales Orders, Picking, Backorders, Delivery Notes |
| **Floor picker** | Walk locations, scan bins/items, confirm quantities | Picking (handheld / floor view) |
| **Packer** | Put picked goods into boxes, print labels, mark boxes ready to ship | Packing |
| **Dispatcher** | Build delivery trips, load boxes, start the trip, capture POD, complete delivery | Dispatch, Delivery Notes |

Supervisors and warehouse managers can use the full outbound section. Billing-focused users typically work Sales Orders and Delivery Notes.

---

## 2. When stock is reserved vs when it leaves

Think of stock in two stages:

1. **Reserved (held for an order)** — The system earmarks quantity on a bin for a pick list. Other orders should not use that quantity. The goods are **still on the shelf**.
2. **Consumed (left the warehouse on the books)** — When a box or trip is **loaded**, reserved stock is reduced and on-hand quantity drops. That is when goWMS treats the goods as shipped from inventory.

| Moment | Stock still on bin? | Business meaning |
|--------|---------------------|------------------|
| Sales order created / confirmed | Yes | Order exists; nothing held yet |
| Pick list created (from order, free-form, or wave) | Yes | **Reserved** — FEFO chooses batches/locations |
| Picker scans and confirms pick | Yes | Progress only; stock stays on the bin |
| Packer puts items in a box | Yes | Box contents recorded; still reserved |
| Packer **Load** or Dispatcher **Load** on trip | No (for shipped qty) | **Leaves warehouse** on the books |
| Pick cancelled before load | Yes | Reservation released; stock free again |

**How the system works today:** Stock is reserved when the pick list is created. It leaves inventory on the **first** Load action (Packing Load or Dispatch trip Load). If the picker never finished scanning, Load can ship the originally reserved quantity (treat as auto-picked). If they did scan, Load ships what was actually picked and frees unused reserve.

**Recommended practice:** Prefer **Pack Load** when packing finishes at the station, so Dispatch only moves boxes onto the vehicle. Use trip Load only when packing skipped Load.

---

## 3. Happy path — recommended default flow

**Recommended practice:** One sales order → one pick list → pick → pack → load → dispatch. Best fit for typical spare-parts volume and clear order ownership.

### Step-by-step

1. **Sales desk — Create the order**  
   Open **Sales Orders**. Enter customer, lines, warehouse, and delivery date (or import a file). Save as draft.

2. **Sales desk — Set priority if needed**  
   Raise priority for urgent or SLA-sensitive orders so the warehouse desk knows what to release first.

3. **Sales desk — Confirm**  
   Confirm the order. Confirmed orders are ready for warehouse release.  
   *Stock is still not reserved.*

4. **Warehouse desk — Create Pick from the sales order**  
   On the order, use **Create Pick**. goWMS allocates stock using **FEFO** (earliest expiry / batch first) and reserves those bins.  
   *If some lines cannot be fully allocated, shortage lines may appear; follow the short-pick / backorder section below.*

5. **Warehouse desk — Hand off to the floor**  
   Print the pick slip if needed. Floor picker opens the pick on **Picking**.

6. **Floor picker — Pick**  
   Work lines in location order. Scan bin (optional) and item, confirm quantity. Complete all lines or leave a short as agreed with the desk.  
   *Stock remains reserved on the bin until Load.*

7. **Packer — Pack**  
   Open **Packing** for that pick list. Create one or more boxes, pack the picked items, print labels as needed.

8. **Packer — Load (consume stock)**  
   **Recommended practice:** Use Pack **Load** when the station is done so inventory is reduced before the truck is staged.  
   **How the system works today:** Load may also happen later on the trip if packing did not Load.

9. **Dispatcher — Trip and delivery**  
   On **Dispatch**, create a trip, load the boxes (if not already loaded), start the trip, generate **delivery notes**, capture **POD** (signature) at stops as required, then complete the trip.

10. **Sales / warehouse desk — Follow up**  
    Review **Delivery Notes** for proof of what shipped. Resolve shortages via **Backorders** and re-release when stock arrives.

---

## 4. Wave / batch picking — when to use

**How the system works today:** Warehouse desk can create a **wave** pick that combines several confirmed sales orders into one pick list by item. The picker pulls aggregated quantities. Order numbers are listed together on the pick; there is **no** automatic sort-to-order after pick.

**Recommended practice:**

| Use wave when… | Avoid wave when… |
|----------------|-------------------|
| Many small orders, same day | Order identity must stay clear through pack |
| Same SKUs appear on many orders | You lack a sort/pack step after pick |
| You have pack labor to sort by customer/order | You are training a new team (use single-order first) |

**Do not make wave the default** until the team has a clear “sort then pack by order” habit. Prefer the single-order happy path as the standard SOP.

---

## 5. Exceptions — what to do

### Short pick (could not find full quantity)

**How the system works today:** You can leave lines unpicked. At Load, the system ships what was picked (or the reserved qty if nothing was scanned). Shortage can be recorded when the pick is created; free-form pick create may auto-open a backorder. Creating a pick from a sales order does **not** always auto-create a backorder the same way.

**Recommended practice:**

1. Confirm the short with warehouse desk.  
2. Finish pick for what you have.  
3. Ensure a **backorder** exists for the missing qty.  
4. Pack and ship the available goods if the customer accepts partial.  
5. When stock arrives, fulfill the backorder and create a **new pick** for remaining lines.

### Partial ship

**How the system works today:** Partial pick + Load ships picked quantity; leftovers need a new pick later.

**Recommended practice:** Ship packed boxes for what is ready. Keep the sales order open for remaining lines. Communicate partial delivery to the customer. Create a follow-up pick when stock or priority allows.

### Cancel order or cancel pick (before ship)

**How the system works today:** Cancel a pick **before** Load to release reserved stock back to available. You cannot cancel a pick the same way after stock has already been consumed on Load.

**Recommended practice:**

- If nothing loaded: cancel the pick (releases hold), then cancel or adjust the sales order as policy requires.  
- If boxes already loaded / stock consumed: do **not** try a normal pick cancel — escalate to warehouse desk for returns / reverse process as appropriate.

### Backorder

**How the system works today:** Backorders track shortages. Fulfilling a backorder in the system is mainly a status change — it does **not** automatically create the next pick.

**Recommended practice:** Treat backorder fulfill as a signal to **create a new pick** (or include those lines in the next wave). Check **Backorders** daily with open sales orders.

### Wrong item or overpack

**How the system works today:** Packing does not strictly block packing more than was picked; weight warnings may appear.

**Recommended practice:** Pack only from the pick list. If a wrong SKU was packed, reverse the pack line with a reason before Load. After Load, use the returns / correction process with the desk.

### Trip complete without all signatures

**How the system works today:** Dispatch can complete a trip simply, or with a gated complete that expects POD where configured.

**Recommended practice:** For customer delivery, prefer gated complete with POD. For carrier handoff where the carrier signs for the load, simple complete may be enough — agree the rule with ops.

---

## 6. Screens at a glance

| Screen | Purpose |
|--------|---------|
| **Sales Orders** | Create, import, priority, confirm, create pick from order |
| **Picking** | Pick lists, wave create, floor scan pick, print slip, cancel pick |
| **Packing** | Boxes, pack items, labels, Load (stock leave) |
| **Dispatch** | Trips, load boxes, start, delivery notes, POD, complete |
| **Delivery Notes** | View ship documents created from dispatch |
| **Backorders** | Track and fulfill shortages |
| **Returns** | Customer returns: receive, inspect, restock or scrap |
| **Customers** | Customer master used with orders |

**Note:** Inbound “packing list” receiving is a **supplier** process — not the same as outbound **Packing**.

---

## 7. Recommended daily operating rhythm

Simple checklist for a warehouse day:

**Morning (Sales + Warehouse desk)**

- [ ] Confirm overnight / new sales orders  
- [ ] Set or review priorities and delivery dates  
- [ ] Create picks for today’s confirmed orders (single-order first)  
- [ ] Review open **Backorders**; plan re-picks when stock is available  
- [ ] Decide if a **wave** is needed for a cluster of small orders (optional)

**Floor shift**

- [ ] Pickers clear open pick lists in priority order  
- [ ] Flag shorts early to the desk  
- [ ] Packers pack completed picks into boxes and **Load** when the station is done  
- [ ] Dispatchers build trips, load remaining boxes, start routes

**End of day**

- [ ] Complete trips; ensure delivery notes and POD where required  
- [ ] Cancel unused picks that will not ship (to free reserved stock)  
- [ ] Leave a short note on open shorts / partials for the next shift  
- [ ] Spot-check Delivery Notes against trips that completed

---

## 8. Glossary

| Term | Plain meaning |
|------|----------------|
| **SO (Sales Order)** | Customer order for goods from the warehouse |
| **Pick list** | Work list telling the picker what to take from which locations |
| **Wave / batch** | One pick list that combines demand from several sales orders |
| **Reserve / allocation** | Holding bin quantity for a pick so others cannot take it |
| **FEFO** | First Expired, First Out — ship nearer-expiry batches first |
| **Box / pack** | Shipping carton filled for a pick / order |
| **Load** | Action that consumes reserved stock (goods leave inventory) |
| **Trip** | Delivery run: vehicle, stops, boxes |
| **DN (Delivery Note)** | Ship document created when goods go out on a trip |
| **POD (Proof of Delivery)** | Signature / confirmation that the stop received goods |
| **Backorder** | Record of quantity not shipped, waiting for stock or a new pick |
| **Short pick** | Picked less than ordered / allocated |
| **Partial ship** | Send available lines/qty; remainder later |

---

## 9. Current vs recommended (one-page summary)

| Topic | How the system works today | Recommended practice |
|-------|----------------------------|----------------------|
| Default release | Create pick from SO, free-form pick, or wave | **Create Pick from each SO** as standard |
| When stock holds | At pick create | Same — confirm only when ready to pick soon |
| When stock leaves | Pack Load **or** trip Load | Prefer **Pack Load**, then trip moves boxes |
| Wave | Available; weak order separation after pick | Peak days only + sort/pack by order |
| Short / BO | Mixed auto-BO behavior by create path | Always open BO for shorts; re-pick later |
| Pack accuracy | Soft controls | Pack only picked qty; reverse mistakes before Load |
| Progress on the SO | Pick progress on the order may look stale | Desk uses pick list status; treat SO % as secondary until improved |

---

## Appendix — For IT

Related technical map: `docs/superpowers/specs/2026-08-25-outbound-sales-order-fulfillment.md`  
Original product intent: `docs/spec/SPEC_03_OUTBOUND.md`

No configuration or API detail is required for business users; escalate process gaps (double picks, pack validation, SO progress sync) to IT using that technical document.
