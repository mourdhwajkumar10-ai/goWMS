# Receiving Page Overrides

> **PROJECT:** goWMS  
> **Page Type:** Dashboard / Data View  
> Overrides `design-system/gowms/MASTER.md` for desk Receiving (`ReceivingManagement`).

---

## Layout

- **Max width:** full content column (`desk-page`, no 1200px center rail)
- **Density:** High (UI UX Pro Max data-dense dashboard) — 8–12px gaps, 34px controls, 36px table rows
- **Viewport:** filter + table share one card; table scrolls in `desk-table-scroll` so the page fits one window

## Toolbar

- Status select + search + session count must stay on **one row** (`.desk-filter-bar`)
- Do **not** use `width: 100%` on filter select/search (that stacks them)
- Classes: `desk-filter-status`, `desk-filter-search`, `desk-filter-meta`

## Avoid

- Separate full-width cards for filter vs table
- Giant page titles (36px) on ops list pages
- Emoji as primary icons in page chrome
