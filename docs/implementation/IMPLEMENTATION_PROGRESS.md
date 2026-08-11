# Implementation Progress — goWMS

**Updated:** 2026-08-12 (remaining gaps: import, returns workflow, carriers, events, analytics, putaway rules)  
**Rule:** Extend integer/ERPNext schema only. Protect FEFO reserve→consume. Conflict designs in separate files.

---

## Done (remaining gaps — this session)

- [x] `POST /masterdata/items/import` + Items UI CSV import/export
- [x] `POST /employees/import` + Employees UI CSV import
- [x] Returns: receive / decide (restock|scrap|rts) + migration `014_return_claim_lines.sql`
- [x] Carriers: `GET|POST /masterdata/carriers` + `/api/carriers`; trip `carrier_id`
- [x] Supplier `GET|PUT /masterdata/suppliers/:id`; item-groups CRUD
- [x] Event notifications: GRN close, pick create, trip complete, shortage/BO, GRN→open BO alert
- [x] Auto backorder v2 on pick shortage at create time
- [x] Putaway suggest consults `putaway_rules` (capacity + priority)
- [x] Outbound analytics: fulfillment %, dispatch SLA %, avg pick mins, priority distribution + UI tab

## Done (QA P0 — prior)

- [x] Trip complete auto-generates delivery notes
- [x] `POST /qi/:id/reject` + `/accept` aliases
- [x] `POST /picking/generate-wave` alias
- [x] `POST /grn/:id/import-packing-list` aliases
- [x] Docs path corrections

---

## Still deferred (intentionally)

- Email/SMS push / WebSocket realtime
- Full canvas POD + photo capture polish
- True PDF label printing (HTML print exists)
- Delivery date/route fields on trip form
