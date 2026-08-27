# Exceptions (desk) — density

## Problems (pre-fix)
- Tall chrome: title + breadcrumb + long description
- Oversized pill buttons for Follow-Up + open/resolved/all
- Status filters separated from search/pager
- Resolve column clipped off the right edge

## Rules
- Title row: **Exceptions** + compact **Follow-ups** link only
- One toolbar row via `ListPager` `leading`: **desk-seg** (open|resolved|all) + search + pager
- Actions column sticky (`desk-table-sticky-actions`); horizontal scroll on table wrap
- Compact row actions: Notes input + Resolve + Later (not full “Supplier will send later” label)
- `text-xs` buttons force 26px height (global CSS)
