# Desk pages — density rules

> Applies to all desk/desktop windows under `.content`.

## Single-row rule
Any controls that fit on one row **must** stay on one row:
- Page title + primary actions → `.page-head` / `.page-actions` (`flex-wrap: nowrap` until ~720px)
- Status chips + search → `.desk-filter-bar` / `.desk-chip-row`
- List search + pager meta → `.list-pager.desk-filter-bar`
- Filter fields (item/date/user) → `.desk-field-inline` inside `.desk-filter-bar`

## Buttons
- Default height **32px**, padding `0 12px`, font 13px
- Do **not** stretch buttons to full width in toolbars (`flex: 0 0 auto; width: auto`)
- Prefer `text-xs` for secondary chip filters

## Spacing
- Page roots: `desk-page space-y-3` (not `space-y-6`)
- Card padding: 12px
- Table row ~36px
