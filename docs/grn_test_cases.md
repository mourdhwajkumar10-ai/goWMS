# GRN UI Test Suite — 290 Test Cases
> Generated for AI Agent execution via `agent-browser`
> Login: admin / admin123 | Base URL: http://34.93.122.213:8080

---

## A. GRN Dashboard & Navigation

### TC-001: Dashboard loads correctly after login

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User is on login page |

**Steps:**
1. `agent-browser open http://34.93.122.213:8080/login` — Navigate to login page
2. `agent-browser snapshot -i` — Capture login form elements
3. `agent-browser fill @e5 "admin"` — Enter username
4. `agent-browser fill @e6 "admin123"` — Enter password
5. `agent-browser click @e7` — Click Login button
6. `agent-browser wait --load networkidle` — Wait for dashboard to load
7. `agent-browser screenshot TC-001_dashboard.png` — Capture dashboard

**Expected Result:**
- Dashboard page loads at URL `/` (root)
- Page title is "goWMS"
- Navigation sidebar is visible
- Home section is displayed with quick-access cards

---

### TC-002: GRN list displays correct columns

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User logged in, on GRN list page |

**Steps:**
1. `agent-browser click @e13` — Click GRN link in sidebar
2. `agent-browser wait --load networkidle` — Wait for GRN page
3. `agent-browser snapshot -i` — Capture GRN list elements
4. `agent-browser screenshot TC-002_grn_list.png` — Capture GRN list

**Expected Result:**
- GRN list displays columns: GRN No., Supplier, Truck, Date, Status, Action
- Table is populated or shows empty state message
- Column headers are clickable for sorting

---

### TC-003: Filter/search GRN by status

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P2 |
| **Preconditions** | User on GRN list page with existing GRNs |

**Steps:**
1. `agent-browser snapshot -i` — Capture filter elements
2. `agent-browser click @e_status_filter` — Click status filter dropdown
3. `agent-browser select @e_status_filter "RECEIVING"` — Select RECEIVING status
4. `agent-browser wait --load networkidle` — Wait for filtered results
5. `agent-browser snapshot -i` — Capture filtered list
6. `agent-browser screenshot TC-003_filter_status.png` — Capture result

**Expected Result:**
- Only GRNs with "RECEIVING" status are displayed
- Filter indicator shows active filter
- Clear filter option is available

---

### TC-004: Filter/search GRN by supplier

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P2 |
| **Preconditions** | User on GRN list page |

**Steps:**
1. `agent-browser snapshot -i` — Capture search elements
2. `agent-browser fill @e_search "SupplierA"` — Enter supplier name in search
3. `agent-browser press Enter` — Submit search
4. `agent-browser wait --load networkidle` — Wait for results
5. `agent-browser screenshot TC-004_filter_supplier.png` — Capture result

**Expected Result:**
- Only GRNs matching "SupplierA" are displayed
- Search results highlight matching text

---

### TC-005: Filter/search GRN by date range

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P2 |
| **Preconditions** | User on GRN list page |

**Steps:**
1. `agent-browser snapshot -i` — Capture date filter elements
2. `agent-browser fill @e_date_from "2024-01-01"` — Set start date
3. `agent-browser fill @e_date_to "2024-12-31"` — Set end date
4. `agent-browser click @e_apply_filter` — Apply date filter
5. `agent-browser wait --load networkidle` — Wait for results
6. `agent-browser screenshot TC-005_filter_date.png` — Capture result

**Expected Result:**
- Only GRNs within the date range are displayed
- Date picker UI works correctly

---

### TC-006: Navigate to GRN workspace from dashboard

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User logged in, on dashboard |

**Steps:**
1. `agent-browser snapshot -i` — Capture dashboard elements
2. `agent-browser click @e13` — Click GRN in sidebar
3. `agent-browser wait --load networkidle` — Wait for GRN page
4. `agent-browser snapshot -i` — Capture GRN workspace
5. `agent-browser screenshot TC-006_grn_workspace.png` — Capture result

**Expected Result:**
- GRN workspace loads successfully
- URL changes to GRN section
- GRN list or dashboard is displayed

---

### TC-007: GRN workflow progress bar displays correctly

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User has opened a GRN workspace |

**Steps:**
1. `agent-browser snapshot -i` — Capture GRN workspace
2. `agent-browser screenshot TC-007_progress_bar.png` — Capture progress bar

**Expected Result:**
- Workflow progress bar shows all stages: Truck → GRN → Box Receiving → Box Reconciliation → Item Verification → Exceptions → Put-Away → Complete
- Current stage is highlighted
- Completed stages show checkmarks

---

### TC-008: GRN tabs are accessible

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User has opened a GRN workspace |

**Steps:**
1. `agent-browser snapshot -i` — Capture tab elements
2. `agent-browser click @e_tab_overview` — Click Overview tab
3. `agent-browser screenshot TC-008_overview.png` — Capture Overview
4. `agent-browser click @e_tab_boxes` — Click Boxes tab
5. `agent-browser screenshot TC-008_boxes.png` — Capture Boxes
6. `agent-browser click @e_tab_items` — Click Items tab
7. `agent-browser screenshot TC-008_items.png` — Capture Items
8. `agent-browser click @e_tab_exceptions` — Click Exceptions tab
9. `agent-browser screenshot TC-008_exceptions.png` — Capture Exceptions
10. `agent-browser click @e_tab_audit` — Click Audit tab
11. `agent-browser screenshot TC-008_audit.png` — Capture Audit
12. `agent-browser click @e_tab_activity` — Click Activity tab
13. `agent-browser screenshot TC-008_activity.png` — Capture Activity

**Expected Result:**
- All 6 tabs are clickable and load their content
- Each tab displays relevant data
- Active tab is visually highlighted

---

### TC-009: Sidebar navigation to Inward > GRN works

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User logged in |

**Steps:**
1. `agent-browser snapshot -i` — Capture sidebar
2. `agent-browser click @e13` — Click GRN link
3. `agent-browser wait --load networkidle` — Wait for page
4. `agent-browser get url` — Verify URL
5. `agent-browser screenshot TC-009_nav_grn.png` — Capture result

**Expected Result:**
- GRN page loads
- Sidebar highlights GRN as active
- URL contains GRN path

---

### TC-010: Sidebar navigation to Exceptions works

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User logged in |

**Steps:**
1. `agent-browser click @e14` — Click Exceptions link
2. `agent-browser wait --load networkidle` — Wait for page
3. `agent-browser snapshot -i` — Capture Exceptions page
4. `agent-browser screenshot TC-010_exceptions.png` — Capture result

**Expected Result:**
- Exceptions page loads
- Exception list or empty state is displayed

---

### TC-011: Sidebar navigation to Follow-Up Receipts works

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P1 |
| **Preconditions** | User logged in |

**Steps:**
1. `agent-browser click @e15` — Click Follow-Up Receipts link
2. `agent-browser wait --load networkidle` — Wait for page
3. `agent-browser snapshot -i` — Capture page
4. `agent-browser screenshot TC-011_followup.png` — Capture result

**Expected Result:**
- Follow-Up Receipts page loads
- List or empty state is displayed

---

### TC-012: Dashboard shows correct counts

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P2 |
| **Preconditions** | User logged in, GRNs exist in system |

**Steps:**
1. `agent-browser click @e10` — Click Dashboard
2. `agent-browser wait --load networkidle` — Wait for dashboard
3. `agent-browser snapshot -i` — Capture dashboard counts
4. `agent-browser screenshot TC-012_counts.png` — Capture result

**Expected Result:**
- Dashboard shows counts for: In Progress, Awaiting Verification, Exceptions, Follow-ups, Completed
- Counts match actual data

---

### TC-013: Responsive layout check

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P3 |
| **Preconditions** | User logged in |

**Steps:**
1. `agent-browser screenshot TC-013_desktop.png` — Capture desktop view
2. `agent-browser eval "window.innerWidth = 768; window.dispatchEvent(new Event('resize'))"` — Set tablet width
3. `agent-browser screenshot TC-013_tablet.png` — Capture tablet view
4. `agent-browser eval "window.innerWidth = 375; window.dispatchEvent(new Event('resize'))"` — Set mobile width
5. `agent-browser screenshot TC-013_mobile.png` — Capture mobile view

**Expected Result:**
- Layout adapts to different screen sizes
- Navigation remains accessible
- Content is readable at all sizes

---

### TC-014: Breadcrumb navigation

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P2 |
| **Preconditions** | User navigated deep into GRN workflow |

**Steps:**
1. `agent-browser snapshot -i` — Capture breadcrumb elements
2. `agent-browser screenshot TC-014_breadcrumb.png` — Capture breadcrumb

**Expected Result:**
- Breadcrumb shows navigation path
- Each breadcrumb item is clickable
- Clicking navigates back to that level

---

### TC-015: Back navigation preserves state

| Field | Value |
|-------|-------|
| **Category** | Dashboard & Navigation |
| **Priority** | P2 |
| **Preconditions** | User on GRN detail page |

**Steps:**
1. `agent-browser snapshot -i` — Capture current state
2. `agent-browser click @e_back` — Click back button
3. `agent-browser wait --load networkidle` — Wait for page
4. `agent-browser snapshot -i` — Capture returned state
5. `agent-browser screenshot TC-015_back_nav.png` — Capture result

**Expected Result:**
- Previous page loads correctly
- Filters/search state is preserved
- Scroll position is maintained where possible

---

## B. Truck Arrival / Create GRN

### TC-016: Create new GRN with all required fields

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User logged in, on GRN creation page |

**Steps:**
1. `agent-browser click @e13` — Navigate to GRN section
2. `agent-browser wait --load networkidle` — Wait for page
3. `agent-browser click @e_new_grn` — Click New GRN button
4. `agent-browser snapshot -i` — Capture GRN form
5. `agent-browser fill @e_supplier "Supplier Alpha"` — Enter supplier
6. `agent-browser fill @e_truck "TRK-001"` — Enter truck number
7. `agent-browser fill @e_driver "John Doe"` — Enter driver name
8. `agent-browser fill @e_boxes "10"` — Enter number of boxes
9. `agent-browser fill @e_invoice "INV-001"` — Enter invoice number
10. `agent-browser select @e_receiving_mode "Packing List"` — Select receiving mode
11. `agent-browser click @e_save_grn` — Save GRN
12. `agent-browser wait --load networkidle` — Wait for save
13. `agent-browser screenshot TC-016_create_grn.png` — Capture result

**Expected Result:**
- GRN is created successfully
- GRN ID is auto-generated (format GRN-XXXXXX)
- Success message is displayed
- Redirects to GRN workspace

---

### TC-017: Supplier field validation (required)

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser snapshot -i` — Capture form
2. `agent-browser fill @e_truck "TRK-002"` — Fill other fields
3. `agent-browser click @e_save_grn` — Try to save without supplier
4. `agent-browser snapshot -i` — Capture validation error
5. `agent-browser screenshot TC-017_supplier_required.png` — Capture error

**Expected Result:**
- Validation error displayed: "Supplier is required"
- Form is not submitted
- Supplier field is highlighted

---

### TC-018: Truck number field validation

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_supplier "Supplier B"` — Fill supplier
2. `agent-browser click @e_save_grn` — Try to save without truck
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-018_truck_validation.png` — Capture error

**Expected Result:**
- Validation error for missing truck number
- Or truck number is optional (verify spec)

---

### TC-019: Driver details capture

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P3 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_driver "Driver Name"` — Enter driver details
2. `agent-browser snapshot -i` — Verify field populated
3. `agent-browser screenshot TC-019_driver.png` — Capture result

**Expected Result:**
- Driver field accepts text input
- Character limits are enforced
- Field is optional if not required

---

### TC-020: Arrival date/time auto-populated

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser snapshot -i` — Capture date field
2. `agent-browser get value @e_arrival_date` — Get date value
3. `agent-browser screenshot TC-020_auto_date.png` — Capture result

**Expected Result:**
- Arrival date is auto-populated with current date
- Time is auto-populated with current time
- Field is editable

---

### TC-021: Number of boxes field validation

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_boxes "abc"` — Enter non-numeric value
2. `agent-browser click @e_save_grn` — Try to save
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-021_boxes_validation.png` — Capture error

**Expected Result:**
- Non-numeric input is rejected or shows validation error
- Only numeric values are accepted

---

### TC-022: Invoice number entry

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_invoice "INV-2024-001"` — Enter invoice number
2. `agent-browser snapshot -i` — Verify entry
3. `agent-browser screenshot TC-022_invoice.png` — Capture result

**Expected Result:**
- Invoice field accepts text
- Multiple invoices can be added
- Invoice format is validated

---

### TC-023: Packing list availability toggle

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser snapshot -i` — Capture toggle element
2. `agent-browser click @e_packing_list_toggle` — Toggle packing list on
3. `agent-browser screenshot TC-023_toggle_on.png` — Capture toggle on
4. `agent-browser click @e_packing_list_toggle` — Toggle packing list off
5. `agent-browser screenshot TC-023_toggle_off.png` — Capture toggle off

**Expected Result:**
- Toggle switches between Packing List and Invoice-Only mode
- UI updates to reflect selected mode
- Import section appears/disappears based on toggle

---

### TC-024: Receiving mode selection

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser snapshot -i` — Capture mode selection
2. `agent-browser select @e_receiving_mode "Packing List"` — Select Packing List mode
3. `agent-browser screenshot TC-024_packing_mode.png` — Capture Packing List mode
4. `agent-browser select @e_receiving_mode "Invoice-Only"` — Select Invoice-Only mode
5. `agent-browser screenshot TC-024_invoice_mode.png` — Capture Invoice-Only mode

**Expected Result:**
- Both modes are selectable
- Form adapts based on selected mode
- Packing List mode shows import option
- Invoice-Only mode shows invoice assignment

---

### TC-025: Supporting documents upload

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P3 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser snapshot -i` — Capture upload element
2. `agent-browser upload @e_documents "test_doc.pdf"` — Upload document
3. `agent-browser screenshot TC-025_upload.png` — Capture result

**Expected Result:**
- Document upload works
- File name is displayed after upload
- File size/type validation is enforced

---

### TC-026: GRN ID auto-generated

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | GRN created successfully |

**Steps:**
1. `agent-browser snapshot -i` — Capture GRN detail
2. `agent-browser get text @e_grn_id` — Get GRN ID value
3. `agent-browser screenshot TC-026_grn_id.png` — Capture result

**Expected Result:**
- GRN ID follows format GRN-XXXXXX
- ID is unique
- ID is displayed prominently

---

### TC-027: Initial status set to RECEIVING

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | GRN just created |

**Steps:**
1. `agent-browser get text @e_status` — Get GRN status
2. `agent-browser screenshot TC-027_status.png` — Capture status

**Expected Result:**
- Status shows "RECEIVING"
- Status badge is correctly styled

---

### TC-028: Cancel GRN creation

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form with some fields filled |

**Steps:**
1. `agent-browser fill @e_supplier "Test Supplier"` — Fill some fields
2. `agent-browser click @e_cancel` — Click cancel button
3. `agent-browser wait --load networkidle` — Wait for navigation
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-028_cancel.png` — Capture result

**Expected Result:**
- Form is closed without saving
- User returns to previous page
- Confirmation dialog may appear

---

### TC-029: Save GRN as draft

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_supplier "Draft Supplier"` — Fill supplier
2. `agent-browser click @e_save_draft` — Save as draft
3. `agent-browser wait --load networkidle` — Wait for save
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-029_draft.png` — Capture result

**Expected Result:**
- GRN saved with DRAFT status
- Can be edited later
- Appears in GRN list with DRAFT status

---

### TC-030: Edit GRN before receiving starts

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | Draft GRN exists |

**Steps:**
1. `agent-browser click @e_edit_grn` — Click edit button
2. `agent-browser snapshot -i` — Capture edit form
3. `agent-browser fill @e_supplier "Updated Supplier"` — Update supplier
4. `agent-browser click @e_save` — Save changes
5. `agent-browser screenshot TC-030_edit.png` — Capture result

**Expected Result:**
- GRN fields are editable
- Changes are saved successfully
- Updated values are displayed

---

### TC-031: Duplicate GRN prevention

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | GRN with specific invoice exists |

**Steps:**
1. `agent-browser click @e_new_grn` — Create new GRN
2. `agent-browser fill @e_invoice "EXISTING-INV-001"` — Enter duplicate invoice
3. `agent-browser click @e_save_grn` — Try to save
4. `agent-browser snapshot -i` — Capture validation
5. `agent-browser screenshot TC-031_duplicate.png` — Capture error

**Expected Result:**
- Duplicate GRN is prevented
- Error message displayed
- User prompted to resolve conflict

---

### TC-032: Supplier dropdown/search functionality

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser click @e_supplier_dropdown` — Open supplier dropdown
2. `agent-browser snapshot -i` — Capture dropdown options
3. `agent-browser fill @e_supplier_search "Alpha"` — Search for supplier
4. `agent-browser snapshot -i` — Capture filtered results
5. `agent-browser screenshot TC-032_supplier_search.png` — Capture result

**Expected Result:**
- Dropdown shows available suppliers
- Search filters results in real-time
- Selecting a supplier fills the field

---

### TC-033: Date picker functionality

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P3 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser click @e_date_picker` — Open date picker
2. `agent-browser snapshot -i` — Capture calendar
3. `agent-browser screenshot TC-033_datepicker.png` — Capture date picker

**Expected Result:**
- Calendar popup appears
- Dates are selectable
- Selected date fills the field

---

### TC-034: Number of boxes - numeric validation

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_boxes "-5"` — Enter negative number
2. `agent-browser click @e_save_grn` — Try to save
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser fill @e_boxes "0"` — Enter zero
5. `agent-browser click @e_save_grn` — Try to save
6. `agent-browser snapshot -i` — Capture validation
7. `agent-browser screenshot TC-034_boxes_numeric.png` — Capture result

**Expected Result:**
- Negative numbers are rejected
- Zero may be rejected depending on business rules
- Validation message is clear

---

### TC-035: Required field error messages display

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User on empty GRN form |

**Steps:**
1. `agent-browser click @e_save_grn` — Try to save empty form
2. `agent-browser snapshot -i` — Capture all validation errors
3. `agent-browser screenshot TC-035_required_errors.png` — Capture errors

**Expected Result:**
- All required field errors are displayed
- Error messages are clear and specific
- Fields with errors are highlighted

---

### TC-036: Form reset functionality

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P3 |
| **Preconditions** | User on GRN form with filled fields |

**Steps:**
1. `agent-browser fill @e_supplier "Test"` — Fill field
2. `agent-browser click @e_reset` — Click reset/clear
3. `agent-browser snapshot -i` — Capture cleared form
4. `agent-browser screenshot TC-036_reset.png` — Capture result

**Expected Result:**
- All fields are cleared to default values
- Validation errors are removed

---

### TC-037: GRN creation success message

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User submits valid GRN form |

**Steps:**
1. `agent-browser fill @e_supplier "Success Supplier"` — Fill form
2. `agent-browser fill @e_truck "TRK-037"` — Fill truck
3. `agent-browser click @e_save_grn` — Save
4. `agent-browser wait --text "success"` — Wait for message
5. `agent-browser snapshot -i` — Capture success message
6. `agent-browser screenshot TC-037_success.png` — Capture result

**Expected Result:**
- Success toast/message is displayed
- Message includes GRN ID
- Message auto-dismisses or has close button

---

### TC-038: GRN appears in dashboard after creation

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | GRN just created |

**Steps:**
1. `agent-browser click @e13` — Navigate to GRN list
2. `agent-browser wait --load networkidle` — Wait for page
3. `agent-browser snapshot -i` — Capture GRN list
4. `agent-browser screenshot TC-038_in_list.png` — Capture result

**Expected Result:**
- New GRN appears in the list
- Correct data is displayed in columns
- Status shows RECEIVING

---

### TC-039: Multiple invoice assignment to single GRN

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P2 |
| **Preconditions** | User on GRN creation form |

**Steps:**
1. `agent-browser fill @e_invoice "INV-001"` — Add first invoice
2. `agent-browser click @e_add_invoice` — Click add another
3. `agent-browser fill @e_invoice_2 "INV-002"` — Add second invoice
4. `agent-browser snapshot -i` — Capture multiple invoices
5. `agent-browser screenshot TC-039_multi_invoice.png` — Capture result

**Expected Result:**
- Multiple invoices can be assigned
- Each invoice is listed separately
- Remove option available for each

---

### TC-040: GRN with no invoices - validation error

| Field | Value |
|-------|-------|
| **Category** | Truck Arrival / Create GRN |
| **Priority** | P1 |
| **Preconditions** | User on GRN form |

**Steps:**
1. `agent-browser fill @e_supplier "No Invoice Supplier"` — Fill supplier only
2. `agent-browser click @e_save_grn` — Save without invoice
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-040_no_invoice.png` — Capture error

**Expected Result:**
- Validation error: invoice is required
- GRN is not created

---

## C. Packing List Import

### TC-041: Import valid XLSX packing list

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN created in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import button
2. `agent-browser upload @e_file_upload "valid_packing.xlsx"` — Upload XLSX
3. `agent-browser wait --load networkidle` — Wait for processing
4. `agent-browser snapshot -i` — Capture import result
5. `agent-browser screenshot TC-041_import_xlsx.png` — Capture result

**Expected Result:**
- File uploads successfully
- Import summary shows row count
- Data is associated with GRN

---

### TC-042: Import valid CSV packing list

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN created in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import button
2. `agent-browser upload @e_file_upload "valid_packing.csv"` — Upload CSV
3. `agent-browser wait --load networkidle` — Wait for processing
4. `agent-browser snapshot -i` — Capture import result
5. `agent-browser screenshot TC-042_import_csv.png` — Capture result

**Expected Result:**
- CSV file uploads successfully
- Data parsed correctly
- Import summary displayed

---

### TC-043: Import with required columns validation

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "correct_columns.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture column mapping
4. `agent-browser screenshot TC-043_columns.png` — Capture result

**Expected Result:**
- System recognizes: Invoice, Box No., Part No., Quantity
- Column mapping is automatic or configurable

---

### TC-044: Import validation - missing Invoice column

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "no_invoice_col.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture error
4. `agent-browser screenshot TC-044_no_invoice.png` — Capture error

**Expected Result:**
- Error: "Invoice column is required"
- Import is rejected

---

### TC-045: Import validation - missing Box No. column

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "no_box_col.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture error
4. `agent-browser screenshot TC-045_no_box.png` — Capture error

**Expected Result:**
- Error: "Box No. column is required"
- Import is rejected

---

### TC-046: Import validation - missing Part No. column

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "no_part_col.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture error
4. `agent-browser screenshot TC-046_no_part.png` — Capture error

**Expected Result:**
- Error: "Part No. column is required"

---

### TC-047: Import validation - missing Quantity column

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "no_qty_col.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture error
4. `agent-browser screenshot TC-047_no_qty.png` — Capture error

**Expected Result:**
- Error: "Quantity column is required"

---

### TC-048: Import with duplicate box numbers

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "dup_boxes.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture warning/error
4. `agent-browser screenshot TC-048_dup_boxes.png` — Capture result

**Expected Result:**
- Warning about duplicate box numbers
- Import may proceed with warning or be rejected

---

### TC-049: Import with invalid quantity (zero)

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "zero_qty.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-049_zero_qty.png` — Capture result

**Expected Result:**
- Validation error for zero quantity rows
- Error includes line numbers

---

### TC-050: Import with invalid quantity (negative)

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "neg_qty.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-050_neg_qty.png` — Capture result

**Expected Result:**
- Validation error for negative quantities

---

### TC-051: Import with empty rows

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P3 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "empty_rows.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-051_empty_rows.png` — Capture result

**Expected Result:**
- Empty rows are skipped or flagged
- Import continues with valid rows

---

### TC-052: Import with special characters in part numbers

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "special_chars.xlsx"` — Upload file
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-052_special.png` — Capture result

**Expected Result:**
- Special characters are handled correctly
- Part numbers are preserved as-is

---

### TC-053: Import large file (1000+ rows)

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | GRN in Packing List mode |

**Steps:**
1. `agent-browser click @e_import` — Click import
2. `agent-browser upload @e_file_upload "large_packing.xlsx"` — Upload large file
3. `agent-browser wait --load networkidle` — Wait for processing
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-053_large.png` — Capture result

**Expected Result:**
- Large file processes without timeout
- Progress indicator is shown
- All rows are imported

---

### TC-054: Import progress indicator

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P3 |
| **Preconditions** | Import in progress |

**Steps:**
1. `agent-browser upload @e_file_upload "medium_file.xlsx"` — Start import
2. `agent-browser snapshot -i` — Capture progress
3. `agent-browser screenshot TC-054_progress.png` — Capture progress

**Expected Result:**
- Progress bar or spinner is shown
- Percentage or status text is displayed

---

### TC-055: Import success message with summary

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P1 |
| **Preconditions** | Import completed successfully |

**Steps:**
1. `agent-browser snapshot -i` — Capture success message
2. `agent-browser screenshot TC-055_import_success.png` — Capture result

**Expected Result:**
- Success message shows: rows imported, boxes found, parts found
- Summary is accurate

---

### TC-056: Import error report with line numbers

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | Import with errors |

**Steps:**
1. `agent-browser upload @e_file_upload "errors.xlsx"` — Upload file with errors
2. `agent-browser snapshot -i` — Capture error report
3. `agent-browser screenshot TC-056_error_report.png` — Capture result

**Expected Result:**
- Error report shows line numbers with issues
- Each error is described clearly

---

### TC-057: Re-import packing list (overwrite)

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | GRN already has imported packing list |

**Steps:**
1. `agent-browser click @e_import` — Click import again
2. `agent-browser snapshot -i` — Capture overwrite warning
3. `agent-browser upload @e_file_upload "new_packing.xlsx"` — Upload new file
4. `agent-browser click @e_confirm_overwrite` — Confirm overwrite
5. `agent-browser snapshot -i` — Capture result
6. `agent-browser screenshot TC-057_overwrite.png` — Capture result

**Expected Result:**
- Warning about overwriting existing data
- Confirmation required
- New data replaces old data

---

### TC-058: Import preview before confirmation

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P2 |
| **Preconditions** | File selected for import |

**Steps:**
1. `agent-browser upload @e_file_upload "preview.xlsx"` — Select file
2. `agent-browser snapshot -i` — Capture preview table
3. `agent-browser screenshot TC-058_preview.png` — Capture preview

**Expected Result:**
- Preview shows first N rows
- Columns are correctly mapped
- Confirm/Cancel buttons available

---

### TC-059: Cancel import

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P3 |
| **Preconditions** | Import dialog open |

**Steps:**
1. `agent-browser click @e_cancel_import` — Cancel import
2. `agent-browser snapshot -i` — Capture result
3. `agent-browser screenshot TC-059_cancel.png` — Capture result

**Expected Result:**
- Import is cancelled
- No data is changed
- Dialog closes

---

### TC-060: Download import template

| Field | Value |
|-------|-------|
| **Category** | Packing List Import |
| **Priority** | P3 |
| **Preconditions** | On import page |

**Steps:**
1. `agent-browser click @e_download_template` — Download template
2. `agent-browser snapshot -i` — Capture result
3. `agent-browser screenshot TC-060_template.png` — Capture result

**Expected Result:**
- Template file downloads
- Template has correct column headers

---

## D. Invoice-Only Mode Assignment

### TC-061: Assign single invoice to GRN

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P1 |
| **Preconditions** | GRN in Invoice-Only mode |

**Steps:**
1. `agent-browser snapshot -i` — Capture invoice section
2. `agent-browser fill @e_invoice "INV-SINGLE-001"` — Enter invoice
3. `agent-browser click @e_assign_invoice` — Assign invoice
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-061_single_invoice.png` — Capture result

**Expected Result:**
- Invoice is assigned to GRN
- Invoice appears in assigned list

---

### TC-062: Assign multiple invoices to GRN

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P1 |
| **Preconditions** | GRN in Invoice-Only mode |

**Steps:**
1. `agent-browser fill @e_invoice "INV-MULTI-001"` — Enter first invoice
2. `agent-browser click @e_assign_invoice` — Assign
3. `agent-browser fill @e_invoice "INV-MULTI-002"` — Enter second invoice
4. `agent-browser click @e_assign_invoice` — Assign
5. `agent-browser snapshot -i` — Capture both invoices
6. `agent-browser screenshot TC-062_multi_invoice.png` — Capture result

**Expected Result:**
- Both invoices are assigned
- Each shows its parts and quantities

---

### TC-063: Invoice with multiple parts and quantities

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P1 |
| **Preconditions** | Invoice assigned to GRN |

**Steps:**
1. `agent-browser snapshot -i` — Capture invoice details
2. `agent-browser screenshot TC-063_invoice_parts.png` — Capture parts list

**Expected Result:**
- All parts from invoice are listed
- Quantities are correct
- Part numbers are displayed

---

### TC-064: Remove assigned invoice

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P2 |
| **Preconditions** | Invoice assigned to GRN |

**Steps:**
1. `agent-browser click @e_remove_invoice` — Click remove button
2. `agent-browser snapshot -i` — Capture confirmation
3. `agent-browser click @e_confirm_remove` — Confirm removal
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-064_remove.png` — Capture result

**Expected Result:**
- Invoice is removed from GRN
- Parts list is updated

---

### TC-065: Edit invoice quantities after assignment

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P2 |
| **Preconditions** | Invoice assigned to GRN |

**Steps:**
1. `agent-browser click @e_edit_invoice` — Click edit
2. `agent-browser fill @e_qty_field "200"` — Update quantity
3. `agent-browser click @e_save_invoice` — Save changes
4. `agent-browser snapshot -i` — Capture updated quantity
5. `agent-browser screenshot TC-065_edit_qty.png` — Capture result

**Expected Result:**
- Quantity is updated
- Total is recalculated

---

### TC-066: Invoice validation - duplicate assignment

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P2 |
| **Preconditions** | Invoice already assigned |

**Steps:**
1. `agent-browser fill @e_invoice "ALREADY-ASSIGNED-INV"` — Enter duplicate
2. `agent-browser click @e_assign_invoice` — Try to assign
3. `agent-browser snapshot -i` — Capture error
4. `agent-browser screenshot TC-066_dup_invoice.png` — Capture error

**Expected Result:**
- Error: invoice already assigned to this GRN

---

### TC-067: Invoice summary display

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P2 |
| **Preconditions** | Multiple invoices assigned |

**Steps:**
1. `agent-browser snapshot -i` — Capture invoice summary
2. `agent-browser screenshot TC-067_summary.png` — Capture summary

**Expected Result:**
- Summary shows total invoices, total parts, total quantities
- Data is accurate

---

### TC-068: Invoice total quantity calculation

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P2 |
| **Preconditions** | Invoices with parts assigned |

**Steps:**
1. `agent-browser get text @e_total_qty` — Get total quantity
2. `agent-browser snapshot -i` — Capture calculation
3. `agent-browser screenshot TC-068_total_calc.png` — Capture result

**Expected Result:**
- Total quantity matches sum of all invoice quantities

---

### TC-069: No invoice assigned - validation error

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P1 |
| **Preconditions** | GRN in Invoice-Only mode, no invoices assigned |

**Steps:**
1. `agent-browser click @e_proceed` — Try to proceed without invoices
2. `agent-browser snapshot -i` — Capture validation
3. `agent-browser screenshot TC-069_no_invoice.png` — Capture error

**Expected Result:**
- Validation error: at least one invoice is required

---

### TC-070: Invoice with zero quantity - validation

| Field | Value |
|-------|-------|
| **Category** | Invoice-Only Assignment |
| **Priority** | P2 |
| **Preconditions** | On invoice assignment page |

**Steps:**
1. `agent-browser fill @e_qty_field "0"` — Enter zero quantity
2. `agent-browser click @e_save_invoice` — Try to save
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-070_zero_qty.png` — Capture error

**Expected Result:**
- Validation error: quantity must be greater than zero

---

## E. Box Receiving

### TC-071: Scan expected box - success

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | GRN with packing list imported, box receiving active |

**Steps:**
1. `agent-browser snapshot -i` — Capture box receiving screen
2. `agent-browser fill @e_box_scan "BOX-001"` — Enter box ID
3. `agent-browser press Enter` — Submit scan
4. `agent-browser wait --load networkidle` — Wait for validation
5. `agent-browser snapshot -i` — Capture scan result
6. `agent-browser screenshot TC-071_box_success.png` — Capture result

**Expected Result:**
- Box is marked as "Received"
- Success indicator displayed (green checkmark)
- Received count increments by 1
- Scan field clears for next box

---

### TC-072: Scan duplicate box - warning displayed

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | BOX-001 already scanned |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Enter duplicate box
2. `agent-browser press Enter` — Submit scan
3. `agent-browser snapshot -i` — Capture warning
4. `agent-browser screenshot TC-072_dup_box.png` — Capture warning

**Expected Result:**
- Warning: "BOX ALREADY SCANNED"
- Duplicate scan event is recorded
- Received count does NOT increment
- Warning is visual (yellow/orange indicator)

---

### TC-073: Scan excess/unexpected box - exception created

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-999"` — Enter unexpected box
2. `agent-browser press Enter` — Submit scan
3. `agent-browser snapshot -i` — Capture excess warning
4. `agent-browser screenshot TC-073_excess_box.png` — Capture result

**Expected Result:**
- Warning: "EXCESS BOX" or "UNEXPECTED BOX"
- Exception is created
- Box is flagged for review
- Does NOT silently become accepted stock

---

### TC-074: Box scan count updates in real-time

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser get text @e_received_count` — Get initial count
2. `agent-browser fill @e_box_scan "BOX-002"` — Scan box
3. `agent-browser press Enter` — Submit
4. `agent-browser get text @e_received_count` — Get updated count
5. `agent-browser screenshot TC-074_count_update.png` — Capture result

**Expected Result:**
- Count increments from N to N+1
- Update happens immediately without page refresh

---

### TC-075: Box receiving progress indicator

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving in progress |

**Steps:**
1. `agent-browser snapshot -i` — Capture progress bar
2. `agent-browser screenshot TC-075_progress.png` — Capture progress

**Expected Result:**
- Progress bar shows received/expected ratio
- Percentage is displayed
- Bar fills as boxes are scanned

---

### TC-076: Box receiving summary after completion

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | All boxes scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture summary
2. `agent-browser screenshot TC-076_summary.png` — Capture summary

**Expected Result:**
- Summary shows: Expected, Received, Excess, Missing
- Numbers are accurate
- Option to proceed to reconciliation

---

### TC-077: Missing boxes identified correctly

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | Box receiving completed with missing boxes |

**Steps:**
1. `agent-browser snapshot -i` — Capture missing boxes list
2. `agent-browser screenshot TC-077_missing.png` — Capture result

**Expected Result:**
- Missing boxes are listed by ID
- Count matches expected minus received
- Missing boxes are highlighted (red indicator)

---

### TC-078: Expected vs received count display

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | Box receiving in progress or complete |

**Steps:**
1. `agent-browser snapshot -i` — Capture count display
2. `agent-browser get text @e_expected_count` — Get expected count
3. `agent-browser get text @e_received_count` — Get received count
4. `agent-browser screenshot TC-078_counts.png` — Capture result

**Expected Result:**
- Expected count matches GRN configuration
- Received count matches actual scans
- Difference is calculated correctly

---

### TC-079: Manual box ID entry (fallback)

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving active, scanner unavailable |

**Steps:**
1. `agent-browser snapshot -i` — Capture scan field
2. `agent-browser fill @e_box_scan "BOX-MANUAL-001"` — Enter box ID manually
3. `agent-browser press Enter` — Submit
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-079_manual.png` — Capture result

**Expected Result:**
- Manual entry works same as scan
- Box is validated against GRN

---

### TC-080: Box scan with leading/trailing spaces

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "  BOX-003  "` — Enter box with spaces
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-080_spaces.png` — Capture result

**Expected Result:**
- Spaces are trimmed automatically
- Box is recognized correctly
- Or validation error if not trimmed

---

### TC-081: Box scan case sensitivity

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P3 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "box-001"` — Enter lowercase
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-081_case.png` — Capture result

**Expected Result:**
- Case-insensitive matching (box-001 = BOX-001)
- Or case-sensitive with clear error message

---

### TC-082: Rapid consecutive box scans

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-004"` — Enter box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_box_scan "BOX-005"` — Enter next box immediately
4. `agent-browser press Enter` — Submit
5. `agent-browser fill @e_box_scan "BOX-006"` — Enter third box
6. `agent-browser press Enter` — Submit
7. `agent-browser snapshot -i` — Capture all results
8. `agent-browser screenshot TC-082_rapid.png` — Capture result

**Expected Result:**
- All three boxes are recorded
- No scans are lost
- Count reflects all scans

---

### TC-083: Box receiving with 1 box

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | GRN with 1 expected box |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-SINGLE"` — Scan the one box
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-083_single_box.png` — Capture result

**Expected Result:**
- 1/1 boxes received
- Reconciliation shows no missing boxes

---

### TC-084: Box receiving with all boxes present

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | GRN with N expected boxes |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Scan first box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_box_scan "BOX-002"` — Scan second box
4. `agent-browser press Enter` — Submit
5. `agent-browser fill @e_box_scan "BOX-003"` — Scan third box
6. `agent-browser press Enter` — Submit
7. `agent-browser snapshot -i` — Capture completion
8. `agent-browser screenshot TC-084_all_boxes.png` — Capture result

**Expected Result:**
- All boxes received
- Missing count = 0
- Ready for reconciliation

---

### TC-085: Box receiving with partial boxes

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | GRN with 3 expected boxes, only 2 available |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Scan first box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_box_scan "BOX-002"` — Scan second box
4. `agent-browser press Enter` — Submit
5. `agent-browser click @e_complete_receiving` — Complete receiving
6. `agent-browser snapshot -i` — Capture missing boxes
7. `agent-browser screenshot TC-085_partial.png` — Capture result

**Expected Result:**
- 2/3 received
- BOX-003 listed as missing
- Exception created for missing box

---

### TC-086: Box receiving completion triggers reconciliation

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | All boxes scanned or receiving completed |

**Steps:**
1. `agent-browser click @e_complete_receiving` — Complete receiving
2. `agent-browser wait --load networkidle` — Wait for transition
3. `agent-browser snapshot -i` — Capture reconciliation screen
4. `agent-browser screenshot TC-086_triggers_recon.png` — Capture result

**Expected Result:**
- System transitions to Box Reconciliation
- Reconciliation data is displayed

---

### TC-087: Duplicate scan event recorded

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Duplicate scan performed |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity tab
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-087_dup_event.png` — Capture result

**Expected Result:**
- Event "BOX_DUPLICATE_SCANNED" is logged
- Event includes box ID, timestamp, user

---

### TC-088: Excess box event recorded

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Excess box scanned |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity tab
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-088_excess_event.png` — Capture result

**Expected Result:**
- Event "BOX_EXCESS_DETECTED" is logged
- Event includes box ID, timestamp, user

---

### TC-089: Box scan timestamp recorded

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box scanned |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity tab
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-089_timestamp.png` — Capture result

**Expected Result:**
- Each box scan event has timestamp
- Timestamp format is ISO 8601 or readable format

---

### TC-090: Box scan user recorded

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box scanned by logged-in user |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity tab
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-090_user.png` — Capture result

**Expected Result:**
- Each event shows the user who performed the scan
- User matches logged-in user

---

### TC-091: Cancel box receiving mid-process

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving in progress, some boxes scanned |

**Steps:**
1. `agent-browser click @e_cancel_receiving` — Cancel receiving
2. `agent-browser snapshot -i` — Capture confirmation
3. `agent-browser click @e_confirm_cancel` — Confirm cancel
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-091_cancel.png` — Capture result

**Expected Result:**
- Confirmation dialog appears
- Scanned boxes are preserved
- Can resume later

---

### TC-092: Resume box receiving after interruption

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving was cancelled/interrupted |

**Steps:**
1. `agent-browser click @e_resume_receiving` — Resume receiving
2. `agent-browser snapshot -i` — Capture resumed state
3. `agent-browser screenshot TC-092_resume.png` — Capture result

**Expected Result:**
- Previously scanned boxes are still recorded
- Count continues from where it left off
- Missing boxes are still identified

---

### TC-093: Box receiving sound/visual feedback on scan

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P3 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture visual feedback
4. `agent-browser screenshot TC-093_feedback.png` — Capture result

**Expected Result:**
- Visual feedback: green indicator, checkmark, or animation
- Audio feedback: beep or success sound (if applicable)

---

### TC-094: Box receiving - scan same box 3 times

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-010"` — First scan
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_box_scan "BOX-010"` — Second scan
4. `agent-browser press Enter` — Submit
5. `agent-browser fill @e_box_scan "BOX-010"` — Third scan
6. `agent-browser press Enter` — Submit
7. `agent-browser snapshot -i` — Capture warnings
8. `agent-browser screenshot TC-094_triple_scan.png` — Capture result

**Expected Result:**
- First scan: success
- Second scan: duplicate warning
- Third scan: duplicate warning
- Only 1 receipt recorded for BOX-010
- 2 duplicate events logged

---

### TC-095: Box receiving with zero boxes scanned

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | GRN created but no boxes scanned |

**Steps:**
1. `agent-browser click @e_complete_receiving` — Try to complete with 0 boxes
2. `agent-browser snapshot -i` — Capture validation
3. `agent-browser screenshot TC-095_zero_boxes.png` — Capture result

**Expected Result:**
- Warning: no boxes received
- Or confirmation dialog before proceeding

---

### TC-096: Box receiving with already-received box from different GRN

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | BOX-XYZ received in different GRN |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-XYZ"` — Scan box from different GRN
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-096_diff_grn.png` — Capture result

**Expected Result:**
- Warning: box belongs to different GRN
- Or excess box exception created

---

### TC-097: Box scan device recorded

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P3 |
| **Preconditions** | Box scanned from specific device |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity tab
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-097_device.png` — Capture result

**Expected Result:**
- Event includes device identifier
- Device matches current browser/device

---

### TC-098: Box receiving with special characters in box ID

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P3 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001/SPECIAL#1"` — Enter special chars
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-098_special.png` — Capture result

**Expected Result:**
- Special characters handled correctly
- Box is validated or rejected appropriately

---

### TC-099: Box receiving summary accuracy

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P1 |
| **Preconditions** | Multiple boxes scanned |

**Steps:**
1. `agent-browser get text @e_expected_count` — Get expected
2. `agent-browser get text @e_received_count` — Get received
3. `agent-browser get text @e_missing_count` — Get missing
4. `agent-browser get text @e_excess_count` — Get excess
5. `agent-browser screenshot TC-099_accuracy.png` — Capture result

**Expected Result:**
- Expected = GRN configured boxes
- Received = unique boxes scanned
- Missing = Expected - Received (if positive)
- Excess = boxes not in expected list

---

### TC-100: Box receiving page refresh preserves state

| Field | Value |
|-------|-------|
| **Category** | Box Receiving |
| **Priority** | P2 |
| **Preconditions** | Some boxes scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture current state
2. `agent-browser refresh` — Refresh page
3. `agent-browser wait --load networkidle` — Wait for reload
4. `agent-browser snapshot -i` — Capture refreshed state
5. `agent-browser screenshot TC-100_refresh.png` — Capture result

**Expected Result:**
- Previously scanned boxes are preserved
- Count is correct after refresh
- Can continue scanning

---

## F. Box Reconciliation

### TC-101: Reconciliation screen shows correct totals

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Box receiving completed |

**Steps:**
1. `agent-browser snapshot -i` — Capture reconciliation screen
2. `agent-browser screenshot TC-101_recon_totals.png` — Capture result

**Expected Result:**
- Shows: Expected Boxes, Received Boxes, Excess Boxes, Missing Boxes
- Totals are accurate

---

### TC-102: Missing boxes listed with correct IDs

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Box receiving completed with missing boxes |

**Steps:**
1. `agent-browser snapshot -i` — Capture missing boxes table
2. `agent-browser screenshot TC-102_missing_list.png` — Capture result

**Expected Result:**
- Each missing box has its ID listed
- Status column shows "Missing"
- Count matches expected minus received

---

### TC-103: Excess boxes listed with correct IDs

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Excess boxes scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture excess boxes
2. `agent-browser screenshot TC-103_excess_list.png` — Capture result

**Expected Result:**
- Excess boxes listed with IDs
- Status shows "Excess"

---

### TC-104: All boxes received - no discrepancies

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | All expected boxes scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture reconciliation
2. `agent-browser screenshot TC-104_clean_recon.png` — Capture result

**Expected Result:**
- Missing = 0, Excess = 0
- All boxes show "Received" status
- Green indicator for clean reconciliation

---

### TC-105: Partial receive - missing boxes highlighted

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Some boxes missing |

**Steps:**
1. `agent-browser snapshot -i` — Capture reconciliation
2. `agent-browser screenshot TC-105_partial.png` — Capture result

**Expected Result:**
- Missing boxes are highlighted in red/warning color
- Clear visual distinction from received boxes

---

### TC-106: Reconciliation table sortable

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P3 |
| **Preconditions** | Reconciliation table displayed |

**Steps:**
1. `agent-browser click @e_sort_by_box` — Sort by box ID
2. `agent-browser snapshot -i` — Capture sorted table
3. `agent-browser click @e_sort_by_status` — Sort by status
4. `agent-browser snapshot -i` — Capture sorted table
5. `agent-browser screenshot TC-106_sort.png` — Capture result

**Expected Result:**
- Table sorts by clicked column
- Sort direction toggles (asc/desc)

---

### TC-107: Approve reconciliation

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Reconciliation reviewed |

**Steps:**
1. `agent-browser click @e_approve_recon` — Click approve
2. `agent-browser snapshot -i` — Capture confirmation
3. `agent-browser click @e_confirm_approve` — Confirm
4. `agent-browser wait --load networkidle` — Wait for transition
5. `agent-browser snapshot -i` — Capture result
6. `agent-browser screenshot TC-107_approve.png` — Capture result

**Expected Result:**
- Reconciliation is approved
- Workflow advances to next step
- Status updates

---

### TC-108: Reject reconciliation and re-scan

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P2 |
| **Preconditions** | Reconciliation displayed |

**Steps:**
1. `agent-browser click @e_reject_recon` — Click reject
2. `agent-browser snapshot -i` — Capture rejection form
3. `agent-browser fill @e_reject_reason "Missing boxes found"` — Enter reason
4. `agent-browser click @e_confirm_reject` — Confirm rejection
5. `agent-browser wait --load networkidle` — Wait
6. `agent-browser snapshot -i` — Capture result
7. `agent-browser screenshot TC-108_reject.png` — Capture result

**Expected Result:**
- Reconciliation is rejected
- Returns to box receiving for re-scan
- Rejection reason is recorded

---

### TC-109: Reconciliation summary exportable

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P3 |
| **Preconditions** | Reconciliation complete |

**Steps:**
1. `agent-browser click @e_export_recon` — Click export
2. `agent-browser snapshot -i` — Capture export options
3. `agent-browser screenshot TC-109_export.png` — Capture result

**Expected Result:**
- Export button available
- Downloads CSV/Excel/PDF with reconciliation data

---

### TC-110: Reconciliation data persists after navigation

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P2 |
| **Preconditions** | Reconciliation displayed |

**Steps:**
1. `agent-browser snapshot -i` — Capture current reconciliation
2. `agent-browser click @e_tab_overview` — Navigate away
3. `agent-browser click @e_tab_boxes` — Navigate back to boxes
4. `agent-browser snapshot -i` — Capture reconciliation
5. `agent-browser screenshot TC-110_persist.png` — Capture result

**Expected Result:**
- Reconciliation data is preserved
- No data loss after navigation

---

### TC-111: Expected boxes count correct

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Reconciliation displayed |

**Steps:**
1. `agent-browser get text @e_expected_count` — Get expected count
2. `agent-browser screenshot TC-111_expected.png` — Capture result

**Expected Result:**
- Expected count matches GRN configuration

---

### TC-112: Received boxes count correct

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Reconciliation displayed |

**Steps:**
1. `agent-browser get text @e_received_count` — Get received count
2. `agent-browser screenshot TC-112_received.png` — Capture result

**Expected Result:**
- Received count matches unique boxes scanned

---

### TC-113: Excess boxes count correct

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Reconciliation displayed |

**Steps:**
1. `agent-browser get text @e_excess_count` — Get excess count
2. `agent-browser screenshot TC-113_excess.png` — Capture result

**Expected Result:**
- Excess count = boxes scanned that were not in expected list

---

### TC-114: Missing boxes count correct

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P1 |
| **Preconditions** | Reconciliation displayed |

**Steps:**
1. `agent-browser get text @e_missing_count` — Get missing count
2. `agent-browser screenshot TC-114_missing.png` — Capture result

**Expected Result:**
- Missing count = expected boxes not scanned

---

### TC-115: Supervisor review workflow

| Field | Value |
|-------|-------|
| **Category** | Box Reconciliation |
| **Priority** | P2 |
| **Preconditions** | Reconciliation with discrepancies |

**Steps:**
1. `agent-browser snapshot -i` — Capture reconciliation
2. `agent-browser click @e_request_review` — Request supervisor review
3. `agent-browser snapshot -i` — Capture review request
4. `agent-browser screenshot TC-115_review.png` — Capture result

**Expected Result:**
- Review request is sent
- Reconciliation status shows "Pending Review"
- Supervisor can approve/reject

---

## G. POD (Proof of Delivery)

### TC-116: POD capture available after box reconciliation

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P1 |
| **Preconditions** | Box reconciliation completed |

**Steps:**
1. `agent-browser snapshot -i` — Capture POD section
2. `agent-browser screenshot TC-116_pod_available.png` — Capture result

**Expected Result:**
- POD section is accessible
- Upload button is available

---

### TC-117: Upload POD image/file

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P1 |
| **Preconditions** | POD section accessible |

**Steps:**
1. `agent-browser upload @e_pod_upload "pod_photo.jpg"` — Upload POD
2. `agent-browser wait --load networkidle` — Wait for upload
3. `agent-browser snapshot -i` — Capture uploaded POD
4. `agent-browser screenshot TC-117_pod_upload.png` — Capture result

**Expected Result:**
- File uploads successfully
- Preview is shown
- File name and size displayed

---

### TC-118: POD timestamp recorded

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P2 |
| **Preconditions** | POD uploaded |

**Steps:**
1. `agent-browser snapshot -i` — Capture POD details
2. `agent-browser get text @e_pod_timestamp` — Get timestamp
3. `agent-browser screenshot TC-118_pod_time.png` — Capture result

**Expected Result:**
- Timestamp shows when POD was uploaded
- Format is ISO 8601 or readable

---

### TC-119: POD user recorded

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P2 |
| **Preconditions** | POD uploaded |

**Steps:**
1. `agent-browser get text @e_pod_user` — Get user
2. `agent-browser screenshot TC-119_pod_user.png` — Capture result

**Expected Result:**
- User matches logged-in user

---

### TC-120: POD linked to correct GRN

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P1 |
| **Preconditions** | POD uploaded |

**Steps:**
1. `agent-browser get text @e_pod_grn` — Get linked GRN
2. `agent-browser screenshot TC-120_pod_grn.png` — Capture result

**Expected Result:**
- POD is associated with correct GRN ID

---

### TC-121: POD summary shows box receipt details

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P2 |
| **Preconditions** | POD uploaded |

**Steps:**
1. `agent-browser snapshot -i` — Capture POD summary
2. `agent-browser screenshot TC-121_pod_summary.png` — Capture result

**Expected Result:**
- Summary shows boxes received count
- Summary shows date and user

---

### TC-122: POD does not represent missing boxes as received

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P1 |
| **Preconditions** | GRN with missing boxes, POD uploaded |

**Steps:**
1. `agent-browser snapshot -i` — Capture POD and reconciliation
2. `agent-browser screenshot TC-122_pod_no_fraud.png` — Capture result

**Expected Result:**
- POD only represents physically received boxes
- Missing boxes are NOT shown as received in POD

---

### TC-123: Multiple POD files upload

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P2 |
| **Preconditions** | POD section accessible |

**Steps:**
1. `agent-browser upload @e_pod_upload "pod1.jpg"` — Upload first POD
2. `agent-browser upload @e_pod_upload "pod2.pdf"` — Upload second POD
3. `agent-browser snapshot -i` — Capture multiple PODs
4. `agent-browser screenshot TC-123_multi_pod.png` — Capture result

**Expected Result:**
- Multiple files are uploaded
- Each is listed separately

---

### TC-124: Delete POD file

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P3 |
| **Preconditions** | POD uploaded |

**Steps:**
1. `agent-browser click @e_delete_pod` — Click delete
2. `agent-browser snapshot -i` — Capture confirmation
3. `agent-browser click @e_confirm_delete_pod` — Confirm
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-124_delete_pod.png` — Capture result

**Expected Result:**
- POD file is deleted
- Confirmation dialog appeared

---

### TC-125: POD file preview

| Field | Value |
|-------|-------|
| **Category** | POD |
| **Priority** | P3 |
| **Preconditions** | POD image uploaded |

**Steps:**
1. `agent-browser click @e_preview_pod` — Click preview
2. `agent-browser snapshot -i` — Capture preview
3. `agent-browser screenshot TC-125_pod_preview.png` — Capture result

**Expected Result:**
- Image preview is shown
- Full-size view available

---

## H. Item Verification - Packing List Mode

### TC-126: Scan box to start verification

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box reconciliation complete, item verification active |

**Steps:**
1. `agent-browser snapshot -i` — Capture verification screen
2. `agent-browser fill @e_box_scan "BOX-001"` — Scan box
3. `agent-browser press Enter` — Submit
4. `agent-browser wait --load networkidle` — Wait for contents to load
5. `agent-browser snapshot -i` — Capture expected contents
6. `agent-browser screenshot TC-126_scan_box.png` — Capture result

**Expected Result:**
- Box contents are loaded and displayed
- Expected parts and quantities shown
- Scan field ready for items

---

### TC-127: Expected contents loaded after box scan

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box scanned for verification |

**Steps:**
1. `agent-browser snapshot -i` — Capture contents table
2. `agent-browser screenshot TC-127_contents.png` — Capture result

**Expected Result:**
- Table shows: Part No., Expected Qty, Scanned Qty, Status
- All expected parts are listed
- Scanned Qty starts at 0

---

### TC-128: Scan item - correct match

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box contents loaded |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture match result
4. `agent-browser screenshot TC-128_item_match.png` — Capture result

**Expected Result:**
- Item matches expected part
- Scanned qty increments
- Success indicator displayed

---

### TC-129: Scan item - correct quantity reached

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Items being scanned |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan final item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture quantity reached
4. `agent-browser screenshot TC-129_qty_reached.png` — Capture result

**Expected Result:**
- Scanned qty = Expected qty for that part
- Status changes to "Complete" or checkmark

---

### TC-130: Auto-close box when all items verified

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | All expected items scanned for a box |

**Steps:**
1. `agent-browser snapshot -i` — Capture box completion
2. `agent-browser screenshot TC-130_auto_close.png` — Capture result

**Expected Result:**
- Box is automatically closed (no Close Box button needed)
- "BOX VERIFIED" message displayed
- Next box scan field is immediately ready
- This is a key speed optimization per spec

---

### TC-131: Scan wrong item - warning displayed

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | BOX-001 expects parts 12345, 67890, 45678 |

**Steps:**
1. `agent-browser fill @e_item_scan "99999"` — Scan wrong item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture warning
4. `agent-browser screenshot TC-131_wrong_item.png` — Capture warning

**Expected Result:**
- Warning: "WRONG ITEM - This item is not expected in BOX-001"
- Item is NOT accepted against the box
- Scan event is recorded

---

### TC-132: Wrong item not accepted against box

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Wrong item scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture quantities
2. `agent-browser screenshot TC-132_not_accepted.png` — Capture result

**Expected Result:**
- No expected qty is incremented
- Wrong item is logged as exception
- Box remains open

---

### TC-133: Scan excess item beyond expected quantity

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Part 12345 expected qty already reached |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan excess item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture excess warning
4. `agent-browser screenshot TC-133_excess_item.png` — Capture warning

**Expected Result:**
- Warning: "EXCESS ITEM"
- Excess does NOT silently become accepted stock
- Exception is created

---

### TC-134: Shortage detected - box not auto-closed

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box with items not fully scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture box status
2. `agent-browser screenshot TC-134_shortage.png` — Capture result

**Expected Result:**
- Box is NOT auto-closed
- Shortage is recorded
- Exception created: Expected 20, Scanned 18, Short 2

---

### TC-135: Same part in multiple boxes - independent verification

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Part 12345 appears in BOX-001, BOX-002, BOX-003 |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Scan first box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "12345"` — Scan 20 items
4. `agent-browser press Enter` — Submit (x20)
5. `agent-browser fill @e_box_scan "BOX-002"` — Scan second box
6. `agent-browser press Enter` — Submit
7. `agent-browser fill @e_item_scan "12345"` — Scan 15 items
8. `agent-browser press Enter` — Submit (x15)
9. `agent-browser snapshot -i` — Capture verification
10. `agent-browser screenshot TC-135_multi_box.png` — Capture result

**Expected Result:**
- Each box verified independently
- BOX-001: 20/20 ✓
- BOX-002: 15/15 ✓
- Part-level reconciliation shows correct totals

---

### TC-136: Part-level reconciliation across boxes

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Multiple boxes verified with same part |

**Steps:**
1. `agent-browser click @e_tab_items` — Go to Items tab
2. `agent-browser snapshot -i` — Capture part reconciliation
3. `agent-browser screenshot TC-136_part_recon.png` — Capture result

**Expected Result:**
- Shows part-level totals across all boxes
- BOX-001 → 20/20 ✓
- BOX-002 → 15/15 ✓
- TOTAL → 35/35 ✓

---

### TC-137: Box verification progress display

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Item verification in progress |

**Steps:**
1. `agent-browser snapshot -i` — Capture progress
2. `agent-browser screenshot TC-137_progress.png` — Capture result

**Expected Result:**
- Progress shows boxes verified / total boxes
- Current box progress shows items scanned / expected

---

### TC-138: Item scan timestamp recorded

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Items scanned |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-138_item_time.png` — Capture result

**Expected Result:**
- Each item scan has timestamp
- Format is correct

---

### TC-139: Item scan user recorded

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Items scanned |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-139_item_user.png` — Capture result

**Expected Result:**
- User matches logged-in user

---

### TC-140: Item scan event logged

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Items scanned |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-140_item_event.png` — Capture result

**Expected Result:**
- Events include: ITEM_SCANNED, ITEM_WRONG_SCANNED, ITEM_EXCESS_DETECTED, ITEM_SHORT_RECORDED
- Each event has GRN, Invoice, Box, Part, Quantity, User, Device, Timestamp

---

### TC-141: Re-scan item after correction

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Wrong item was scanned, correction needed |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan correct item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture correction
4. `agent-browser screenshot TC-141_rescan.png` — Capture result

**Expected Result:**
- Correct item is now counted
- Previous wrong item remains logged

---

### TC-142: Verify box with single item type

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box with only one part type |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-SINGLE"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "PART-001"` — Scan items
4. `agent-browser press Enter` — Submit (x10)
5. `agent-browser snapshot -i` — Capture completion
6. `agent-browser screenshot TC-142_single_type.png` — Capture result

**Expected Result:**
- Single part type verified
- Box auto-closes when qty reached

---

### TC-143: Verify box with multiple item types (5+)

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box with 5+ different parts |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-MULTI"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture 5+ parts listed
4. `agent-browser screenshot TC-143_multi_types.png` — Capture result

**Expected Result:**
- All 5+ parts are listed
- Each has its own expected qty
- Scanning any of them increments the correct row

---

### TC-144: Item quantity counter updates live

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box contents loaded |

**Steps:**
1. `agent-browser get text @e_scanned_qty` — Get initial qty
2. `agent-browser fill @e_item_scan "12345"` — Scan item
3. `agent-browser press Enter` — Submit
4. `agent-browser get text @e_scanned_qty` — Get updated qty
5. `agent-browser screenshot TC-144_live_counter.png` — Capture result

**Expected Result:**
- Counter increments from N to N+1
- Update is immediate (no page refresh)

---

### TC-145: Box auto-close notification

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | All items in box verified |

**Steps:**
1. `agent-browser snapshot -i` — Capture notification
2. `agent-browser screenshot TC-145_auto_close_notif.png` — Capture result

**Expected Result:**
- Notification: "BOX-XXX VERIFIED - XX/XX ITEMS - NO DISCREPANCY - NEXT BOX READY"
- Notification is visible and clear

---

### TC-146: Next box ready after auto-close

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box just auto-closed |

**Steps:**
1. `agent-browser snapshot -i` — Capture scan field
2. `agent-browser screenshot TC-146_next_box.png` — Capture result

**Expected Result:**
- Box scan field is immediately ready
- No manual "Next Box" action needed
- Operator can scan next box right away

---

### TC-147: Excess item creates exception

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Excess item scanned |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture exceptions
3. `agent-browser screenshot TC-147_excess_exception.png` — Capture result

**Expected Result:**
- Exception created for excess item
- Type: "Excess"
- Includes Part, Box, Expected Qty, Scanned Qty, Variance

---

### TC-148: Shortage creates exception

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box with shortage |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture exceptions
3. `agent-browser screenshot TC-148_shortage_exception.png` — Capture result

**Expected Result:**
- Exception created for shortage
- Type: "Shortage"
- Includes variance details

---

### TC-149: Wrong item creates exception

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Wrong item scanned |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture exceptions
3. `agent-browser screenshot TC-149_wrong_exception.png` — Capture result

**Expected Result:**
- Exception created for wrong item
- Type: "Wrong Item"
- Includes scanned part and expected parts

---

### TC-150: Cancel box verification mid-process

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box partially verified |

**Steps:**
1. `agent-browser click @e_cancel_verification` — Cancel verification
2. `agent-browser snapshot -i` — Capture confirmation
3. `agent-browser click @e_confirm_cancel` — Confirm
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-150_cancel.png` — Capture result

**Expected Result:**
- Partial progress is saved
- Can resume later
- Box remains in verification state

---

### TC-151: Resume box verification

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box verification was cancelled |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-PAUSED"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture resumed state
4. `agent-browser screenshot TC-151_resume.png` — Capture result

**Expected Result:**
- Previous scanned items are preserved
- Can continue from where left off

---

### TC-152: Verify box with 100+ items

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box with 100+ items |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-LARGE"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture contents
4. `agent-browser screenshot TC-152_large_box.png` — Capture result

**Expected Result:**
- All 100+ items are listed
- Scanning works for all items
- Performance remains acceptable

---

### TC-153: Item scan feedback (visual)

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box contents loaded |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture feedback
4. `agent-browser screenshot TC-153_visual.png` — Capture result

**Expected Result:**
- Visual feedback: green flash, checkmark, or counter animation
- Clear indication of success

---

### TC-154: Box with no discrepancies has clean status

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box fully verified with no issues |

**Steps:**
1. `agent-browser snapshot -i` — Capture box status
2. `agent-browser screenshot TC-154_clean_box.png` — Capture result

**Expected Result:**
- Status: "VERIFIED" or checkmark
- "NO DISCREPANCY" message
- All items show green status

---

### TC-155: Box verification with items in random order

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Box with multiple parts |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-RANDOM"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "45678"` — Scan third part first
4. `agent-browser press Enter` — Submit
5. `agent-browser fill @e_item_scan "12345"` — Scan first part second
6. `agent-browser press Enter` — Submit
7. `agent-browser fill @e_item_scan "67890"` — Scan second part third
8. `agent-browser press Enter` — Submit
9. `agent-browser snapshot -i` — Capture result
10. `agent-browser screenshot TC-155_random_order.png` — Capture result

**Expected Result:**
- Order doesn't matter
- Each item is counted toward its correct part
- Box verifies correctly regardless of scan order

---

### TC-156: GRN overview shows item verification progress

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Item verification in progress |

**Steps:**
1. `agent-browser click @e_tab_overview` — Go to Overview
2. `agent-browser snapshot -i` — Capture progress
3. `agent-browser screenshot TC-156_overview_progress.png` — Capture result

**Expected Result:**
- Overview shows item verification progress
- Boxes verified count
- Items verified count

---

### TC-157: Wrong item exception includes expected parts list

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Wrong item exception exists |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser click @e_exception_detail` — Click exception detail
3. `agent-browser snapshot -i` — Capture detail
4. `agent-browser screenshot TC-157_wrong_detail.png` — Capture result

**Expected Result:**
- Shows what was scanned (wrong part)
- Shows what was expected (list of valid parts)
- Includes box ID

---

### TC-158: Item verification completion in PL mode

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | All boxes verified |

**Steps:**
1. `agent-browser snapshot -i` — Capture completion status
2. `agent-browser screenshot TC-158_pl_complete.png` — Capture result

**Expected Result:**
- All boxes show verified status
- Summary: total items verified, total exceptions
- Option to proceed to next workflow step

---

### TC-159: Box verification with all parts at exact qty

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P1 |
| **Preconditions** | Box with exact quantities scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture verification
2. `agent-browser screenshot TC-159_exact.png` — Capture result

**Expected Result:**
- All parts show: Expected = Scanned
- All green checkmarks
- Box auto-closed

---

### TC-160: Item scan includes device and timestamp context

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Packing List |
| **Priority** | P2 |
| **Preconditions** | Items scanned |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity
2. `agent-browser snapshot -i` — Capture event details
3. `agent-browser screenshot TC-160_event_context.png` — Capture result

**Expected Result:**
- Each item scan event includes: GRN, Invoice, Box, Part, Quantity, User, Device, Timestamp
- All fields are populated

---

## I. Item Verification - Invoice-Only Mode

### TC-161: Consolidated item verification screen loads

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | GRN in Invoice-Only mode, box receiving complete |

**Steps:**
1. `agent-browser snapshot -i` — Capture consolidated verification
2. `agent-browser screenshot TC-161_consolidated.png` — Capture result

**Expected Result:**
- Consolidated view shows all parts from all invoices
- No box-level verification required
- Table shows: Part, Expected Qty, Scanned Qty, Difference

---

### TC-162: Scan items against invoice quantities

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | Consolidated verification screen loaded |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture scan result
4. `agent-browser screenshot TC-162_scan_item.png` — Capture result

**Expected Result:**
- Item is matched to invoice part
- Scanned qty increments
- No box context needed

---

### TC-163: Part-level quantity tracking

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | Items being scanned |

**Steps:**
1. `agent-browser snapshot -i` — Capture quantities
2. `agent-browser screenshot TC-163_part_tracking.png` — Capture result

**Expected Result:**
- Each part shows expected vs scanned
- Running totals are accurate

---

### TC-164: Shortage identified at part level

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | Fewer items scanned than expected |

**Steps:**
1. `agent-browser snapshot -i` — Capture shortage
2. `agent-browser screenshot TC-164_shortage.png` — Capture result

**Expected Result:**
- Difference column shows negative number
- Shortage is highlighted
- Exception created

---

### TC-165: Excess identified at part level

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | More items scanned than expected |

**Steps:**
1. `agent-browser snapshot -i` — Capture excess
2. `agent-browser screenshot TC-165_excess.png` — Capture result

**Expected Result:**
- Difference column shows positive number
- Excess is highlighted
- Exception created

---

### TC-166: Cannot identify box-level discrepancy

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | Invoice-Only mode with discrepancy |

**Steps:**
1. `agent-browser snapshot -i` — Capture verification
2. `agent-browser screenshot TC-166_no_box_level.png` — Capture result

**Expected Result:**
- System correctly notes that box-level attribution is not possible
- Discrepancy is at part/invoice level only

---

### TC-167: Invoice-Only mode - no box scan required

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | Invoice-Only GRN |

**Steps:**
1. `agent-browser snapshot -i` — Capture screen
2. `agent-browser screenshot TC-167_no_box_scan.png` — Capture result

**Expected Result:**
- No box scan field is presented
- Direct item scanning available

---

### TC-168: Consolidated reconciliation display

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P2 |
| **Preconditions** | Item verification complete |

**Steps:**
1. `agent-browser snapshot -i` — Capture reconciliation
2. `agent-browser screenshot TC-168_recon.png` — Capture result

**Expected Result:**
- Shows: Part, Expected, Scanned, Difference
- All parts listed
- Totals accurate

---

### TC-169: Multiple invoices - consolidated view

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P2 |
| **Preconditions** | Multiple invoices assigned |

**Steps:**
1. `agent-browser snapshot -i` — Capture consolidated view
2. `agent-browser screenshot TC-169_multi_invoice.png` — Capture result

**Expected Result:**
- Parts from all invoices are consolidated
- Same part from different invoices are summed

---

### TC-170: Item verification completion in invoice-only mode

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | All items verified |

**Steps:**
1. `agent-browser snapshot -i` — Capture completion
2. `agent-browser screenshot TC-170_io_complete.png` — Capture result

**Expected Result:**
- Verification marked complete
- Summary displayed
- Option to proceed to next step

---

### TC-171: Switch between invoice views

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P3 |
| **Preconditions** | Multiple invoices assigned |

**Steps:**
1. `agent-browser select @e_invoice_filter "INV-001"` — Filter by invoice
2. `agent-browser snapshot -i` — Capture filtered view
3. `agent-browser select @e_invoice_filter "INV-002"` — Switch invoice
4. `agent-browser snapshot -i` — Capture different view
5. `agent-browser screenshot TC-171_switch.png` — Capture result

**Expected Result:**
- Can view by individual invoice or all consolidated

---

### TC-172: Total expected vs scanned summary

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | Verification in progress |

**Steps:**
1. `agent-browser get text @e_total_expected` — Get total expected
2. `agent-browser get text @e_total_scanned` — Get total scanned
3. `agent-browser screenshot TC-172_totals.png` — Capture result

**Expected Result:**
- Totals match sum of all parts
- Difference is calculated

---

### TC-173: Invoice-only verification progress

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P2 |
| **Preconditions** | Verification in progress |

**Steps:**
1. `agent-browser snapshot -i` — Capture progress
2. `agent-browser screenshot TC-173_progress.png` — Capture result

**Expected Result:**
- Progress indicator shows completion percentage

---

### TC-174: Partial verification - save and resume

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P2 |
| **Preconditions** | Verification partially complete |

**Steps:**
1. `agent-browser click @e_save_progress` — Save progress
2. `agent-browser snapshot -i` — Capture save confirmation
3. `agent-browser click @e_resume_later` — Resume later
4. `agent-browser snapshot -i` — Capture resumed state
5. `agent-browser screenshot TC-174_resume.png` — Capture result

**Expected Result:**
- Progress is saved
- Can resume from where left off

---

### TC-175: Invoice-only completion triggers next workflow step

| Field | Value |
|-------|-------|
| **Category** | Item Verification - Invoice-Only |
| **Priority** | P1 |
| **Preconditions** | All items verified |

**Steps:**
1. `agent-browser click @e_complete_verification` — Complete verification
2. `agent-browser wait --load networkidle` — Wait for transition
3. `agent-browser snapshot -i` — Capture next step
4. `agent-browser screenshot TC-175_next_step.png` — Capture result

**Expected Result:**
- Workflow advances to next stage
- Status updates accordingly

---

## J. Exception Handling

### TC-176: Exception list accessible from GRN workspace

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | GRN with exceptions |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Click Exceptions tab
2. `agent-browser wait --load networkidle` — Wait for load
3. `agent-browser snapshot -i` — Capture exception list
4. `agent-browser screenshot TC-176_exception_list.png` — Capture result

**Expected Result:**
- Exception list is displayed
- Shows all exception types

---

### TC-177: Exception details show all required fields

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Exception exists |

**Steps:**
1. `agent-browser click @e_exception_row` — Click exception
2. `agent-browser snapshot -i` — Capture detail
3. `agent-browser screenshot TC-177_exception_detail.png` — Capture result

**Expected Result:**
- Shows: GRN, Invoice, Box, Part, Expected Qty, Scanned Qty, Variance, User, Device, Timestamp, Status, Resolution, Resolved By, Resolution Timestamp

---

### TC-178: Shortage exception created correctly

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Shortage detected during verification |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture shortage exception
3. `agent-browser screenshot TC-178_shortage_exc.png` — Capture result

**Expected Result:**
- Type: Shortage
- Correct expected/scanned/variance values
- Status: Open/Pending

---

### TC-179: Excess exception created correctly

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Excess detected |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture excess exception
3. `agent-browser screenshot TC-179_excess_exc.png` — Capture result

**Expected Result:**
- Type: Excess
- Variance is positive number

---

### TC-180: Wrong item exception created correctly

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Wrong item scanned |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture wrong item exception
3. `agent-browser screenshot TC-180_wrong_exc.png` — Capture result

**Expected Result:**
- Type: Wrong Item
- Shows scanned part (wrong) and expected parts

---

### TC-181: Duplicate scan exception created correctly

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P2 |
| **Preconditions** | Duplicate box scan performed |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture duplicate exception
3. `agent-browser screenshot TC-181_dup_exc.png` — Capture result

**Expected Result:**
- Type: Duplicate Scan
- Box ID is recorded

---

### TC-182: Unexpected box exception created correctly

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Excess box scanned |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture unexpected box exception
3. `agent-browser screenshot TC-182_unexpected_exc.png` — Capture result

**Expected Result:**
- Type: Unexpected Box
- Box ID is recorded

---

### TC-183: Missing box exception created correctly

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Box receiving completed with missing boxes |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions
2. `agent-browser snapshot -i` — Capture missing box exception
3. `agent-browser screenshot TC-183_missing_exc.png` — Capture result

**Expected Result:**
- Type: Missing Box
- Each missing box has its own exception
- Box IDs are listed

---

### TC-184: Exception status field present

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Exception exists |

**Steps:**
1. `agent-browser click @e_exception_row` — Click exception
2. `agent-browser snapshot -i` — Capture status field
3. `agent-browser screenshot TC-184_status.png` — Capture result

**Expected Result:**
- Status field is present
- Values: Open, In Progress, Resolved, Closed

---

### TC-185: Resolve exception - fill resolution

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Open exception exists |

**Steps:**
1. `agent-browser click @e_exception_row` — Click exception
2. `agent-browser click @e_resolve` — Click resolve
3. `agent-browser fill @e_resolution "Supplier confirmed excess, accepted"` — Enter resolution
4. `agent-browser click @e_save_resolution` — Save
5. `agent-browser snapshot -i` — Capture resolved exception
6. `agent-browser screenshot TC-185_resolve.png` — Capture result

**Expected Result:**
- Exception status changes to "Resolved"
- Resolution text is saved
- Resolved By and timestamp are recorded

---

### TC-186: Exception resolved by and timestamp recorded

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Exception just resolved |

**Steps:**
1. `agent-browser snapshot -i` — Capture resolution details
2. `agent-browser get text @e_resolved_by` — Get resolver
3. `agent-browser get text @e_resolved_time` — Get timestamp
4. `agent-browser screenshot TC-186_resolve_meta.png` — Capture result

**Expected Result:**
- Resolved By matches current user
- Timestamp is accurate

---

### TC-187: Exception filter by type

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P2 |
| **Preconditions** | Multiple exception types exist |

**Steps:**
1. `agent-browser select @e_type_filter "Shortage"` — Filter by type
2. `agent-browser snapshot -i` — Capture filtered list
3. `agent-browser screenshot TC-187_filter_type.png` — Capture result

**Expected Result:**
- Only shortage exceptions shown
- Filter can be cleared

---

### TC-188: Exception filter by status

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P2 |
| **Preconditions** | Exceptions with different statuses |

**Steps:**
1. `agent-browser select @e_status_filter "Open"` — Filter by status
2. `agent-browser snapshot -i` — Capture filtered list
3. `agent-browser screenshot TC-188_filter_status.png` — Capture result

**Expected Result:**
- Only open exceptions shown

---

### TC-189: Exception sorting

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P3 |
| **Preconditions** | Multiple exceptions |

**Steps:**
1. `agent-browser click @e_sort_type` — Sort by type
2. `agent-browser snapshot -i` — Capture sorted
3. `agent-browser click @e_sort_status` — Sort by status
4. `agent-browser snapshot -i` — Capture sorted
5. `agent-browser screenshot TC-189_sort.png` — Capture result

**Expected Result:**
- Sorting works on all columns

---

### TC-190: Exception does not interrupt normal scanning flow

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Exception created during scanning |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Continue scanning
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture continued scanning
4. `agent-browser screenshot TC-190_no_interrupt.png` — Capture result

**Expected Result:**
- Scanning continues without interruption
- Exception is recorded silently
- Operator can keep working

---

### TC-191: Exception count on dashboard

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P2 |
| **Preconditions** | GRN with exceptions |

**Steps:**
1. `agent-browser click @e10` — Go to Dashboard
2. `agent-browser snapshot -i` — Capture exception count
3. `agent-browser screenshot TC-191_dash_exc.png` — Capture result

**Expected Result:**
- Dashboard shows exception count
- Count matches actual exceptions

---

### TC-192: Navigate to exception from GRN

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P2 |
| **Preconditions** | Exception exists in GRN |

**Steps:**
1. `agent-browser click @e_tab_exceptions` — Go to Exceptions tab
2. `agent-browser click @e_exception_row` — Click exception
3. `agent-browser snapshot -i` — Capture exception detail
4. `agent-browser screenshot TC-192_nav_exc.png` — Capture result

**Expected Result:**
- Exception detail is displayed
- All fields are populated

---

### TC-193: Exception detail view completeness

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P1 |
| **Preconditions** | Exception detail open |

**Steps:**
1. `agent-browser snapshot -i` — Capture all fields
2. `agent-browser screenshot TC-193_detail_complete.png` — Capture result

**Expected Result:**
- All required fields present:
  - GRN, Invoice, Box (if applicable), Part
  - Expected Qty, Scanned Qty, Variance
  - User, Device, Timestamp
  - Status, Resolution, Resolved By, Resolution Timestamp

---

### TC-194: Bulk exception resolution

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P3 |
| **Preconditions** | Multiple open exceptions |

**Steps:**
1. `agent-browser check @e_exc_1` — Select first exception
2. `agent-browser check @e_exc_2` — Select second exception
3. `agent-browser click @e_bulk_resolve` — Click bulk resolve
4. `agent-browser fill @e_bulk_resolution "Bulk resolved - supplier confirmed"` — Enter resolution
5. `agent-browser click @e_save_bulk` — Save
6. `agent-browser snapshot -i` — Capture result
7. `agent-browser screenshot TC-194_bulk.png` — Capture result

**Expected Result:**
- Both exceptions resolved
- Same resolution applied
- Individual timestamps recorded

---

### TC-195: Exception export

| Field | Value |
|-------|-------|
| **Category** | Exception Handling |
| **Priority** | P3 |
| **Preconditions** | Exceptions exist |

**Steps:**
1. `agent-browser click @e_export_exceptions` — Click export
2. `agent-browser snapshot -i` — Capture export options
3. `agent-browser screenshot TC-195_export.png` — Capture result

**Expected Result:**
- Export downloads CSV/Excel
- All exception data included

---

## K. Audit

### TC-196: Audit option accessible

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | GRN with verified items |

**Steps:**
1. `agent-browser click @e_tab_audit` — Click Audit tab
2. `agent-browser snapshot -i` — Capture audit screen
3. `agent-browser screenshot TC-196_audit_access.png` — Capture result

**Expected Result:**
- Audit section loads
- Audit options are available

---

### TC-197: Audit random selection (5/10/20 items)

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | Audit section accessible |

**Steps:**
1. `agent-browser select @e_audit_count "5"` — Select 5 items
2. `agent-browser click @e_start_audit` — Start audit
3. `agent-browser snapshot -i` — Capture selected items
4. `agent-browser screenshot TC-197_random_5.png` — Capture result

**Expected Result:**
- 5 random items selected for audit
- Each shows part number and system quantity

---

### TC-198: Audit custom selection

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P2 |
| **Preconditions** | Audit section accessible |

**Steps:**
1. `agent-browser select @e_audit_count "Custom"` — Select custom
2. `agent-browser fill @e_custom_count "3"` — Enter custom count
3. `agent-browser click @e_start_audit` — Start audit
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-198_custom.png` — Capture result

**Expected Result:**
- Custom number of items selected

---

### TC-199: Audit start button works

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | Audit options configured |

**Steps:**
1. `agent-browser click @e_start_audit` — Start audit
2. `agent-browser wait --load networkidle` — Wait
3. `agent-browser snapshot -i` — Capture audit started
4. `agent-browser screenshot TC-199_start.png` — Capture result

**Expected Result:**
- Audit begins
- Items are selected and displayed
- Audit event is logged

---

### TC-200: Audit item - system quantity displayed

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | Audit in progress |

**Steps:**
1. `agent-browser snapshot -i` — Capture audit item
2. `agent-browser get text @e_system_qty` — Get system quantity
3. `agent-browser screenshot TC-200_sys_qty.png` — Capture result

**Expected Result:**
- System quantity is displayed for each audit item
- Quantity matches verification records

---

### TC-201: Audit item - enter physical quantity

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | Audit item displayed |

**Steps:**
1. `agent-browser fill @e_physical_qty "20"` — Enter physical count
2. `agent-browser snapshot -i` — Capture entry
3. `agent-browser screenshot TC-201_phys_qty.png` — Capture result

**Expected Result:**
- Physical quantity field accepts numeric input
- Can submit for each audit item

---

### TC-202: Audit PASS when quantities match

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | System qty = 20, entered physical qty = 20 |

**Steps:**
1. `agent-browser fill @e_physical_qty "20"` — Enter matching qty
2. `agent-browser click @e_submit_audit` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-202_pass.png` — Capture result

**Expected Result:**
- Result: PASS (green checkmark)
- Audit event logged

---

### TC-203: Audit FAIL when quantities mismatch

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | System qty = 20, entered physical qty = 18 |

**Steps:**
1. `agent-browser fill @e_physical_qty "18"` — Enter mismatched qty
2. `agent-browser click @e_submit_audit` — Submit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-203_fail.png` — Capture result

**Expected Result:**
- Result: FAIL (red warning)
- Discrepancy recorded: 20 vs 18

---

### TC-204: Audit discrepancy recorded

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | Audit failed |

**Steps:**
1. `agent-browser snapshot -i` — Capture discrepancy record
2. `agent-browser screenshot TC-204_discrepancy.png` — Capture result

**Expected Result:**
- Discrepancy is recorded with details
- Part, System Qty, Physical Qty, Variance

---

### TC-205: Audit event logged

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P2 |
| **Preconditions** | Audit completed |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity
2. `agent-browser snapshot -i` — Capture audit events
3. `agent-browser screenshot TC-205_audit_event.png` — Capture result

**Expected Result:**
- Events: AUDIT_STARTED, AUDIT_ITEM_CHECKED, AUDIT_DISCREPANCY_FOUND (if applicable)

---

### TC-206: Audit completion summary

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P1 |
| **Preconditions** | All audit items checked |

**Steps:**
1. `agent-browser snapshot -i` — Capture summary
2. `agent-browser screenshot TC-206_audit_summary.png` — Capture result

**Expected Result:**
- Summary: Total audited, Passed, Failed
- Completion status displayed

---

### TC-207: Audit on specific items

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P2 |
| **Preconditions** | Audit in progress |

**Steps:**
1. `agent-browser fill @e_audit_part "12345"` — Enter specific part
2. `agent-browser click @e_add_to_audit` — Add to audit
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-207_specific.png` — Capture result

**Expected Result:**
- Specific part added to audit list

---

### TC-208: Audit history accessible

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P2 |
| **Preconditions** | Previous audits exist |

**Steps:**
1. `agent-browser click @e_audit_history` — Click history
2. `agent-browser snapshot -i` — Capture history
3. `agent-browser screenshot TC-208_history.png` — Capture result

**Expected Result:**
- History shows past audits
- Each audit has date, items, results

---

### TC-209: Audit report generation

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P3 |
| **Preconditions** | Audit completed |

**Steps:**
1. `agent-browser click @e_audit_report` — Click generate report
2. `agent-browser snapshot -i` — Capture report
3. `agent-browser screenshot TC-209_report.png` — Capture result

**Expected Result:**
- Report is generated
- Includes all audit details

---

### TC-210: Audit on random sample

| Field | Value |
|-------|-------|
| **Category** | Audit |
| **Priority** | P2 |
| **Preconditions** | Audit section accessible |

**Steps:**
1. `agent-browser select @e_audit_count "10"` — Select 10 items
2. `agent-browser click @e_random_sample` — Random sample
3. `agent-browser snapshot -i` — Capture selected items
4. `agent-browser screenshot TC-210_random.png` — Capture result

**Expected Result:**
- 10 random items selected
- Different from previous audits (randomized)

---

## L. Follow-Up Receipts

### TC-211: Follow-up receipt creation accessible

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | GRN with shortage/missing material |

**Steps:**
1. `agent-browser click @e15` — Click Follow-Up Receipts in sidebar
2. `agent-browser wait --load networkidle` — Wait for page
3. `agent-browser snapshot -i` — Capture follow-up page
4. `agent-browser screenshot TC-211_followup_access.png` — Capture result

**Expected Result:**
- Follow-Up Receipts page loads
- New Follow-Up button available

---

### TC-212: Link to original GRN

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | Creating follow-up receipt |

**Steps:**
1. `agent-browser click @e_new_followup` — Click new follow-up
2. `agent-browser fill @e_grn_link "GRN-001245"` — Enter original GRN
3. `agent-browser snapshot -i` — Capture GRN link
4. `agent-browser screenshot TC-212_link_grn.png` — Capture result

**Expected Result:**
- GRN is linked
- Original shortage details are loaded

---

### TC-213: Select original GRN with shortage

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | GRN with missing boxes/shortage exists |

**Steps:**
1. `agent-browser select @e_grn_select "GRN-001245"` — Select GRN
2. `agent-browser snapshot -i` — Capture shortage details
3. `agent-browser screenshot TC-213_select_grn.png` — Capture result

**Expected Result:**
- Shows original shortage: Box, Part, Expected, Received, Short
- Only GRNs with shortages are available

---

### TC-214: Scan/verify follow-up material

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | Follow-up linked to original GRN |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan follow-up item
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture scan result
4. `agent-browser screenshot TC-214_followup_scan.png` — Capture result

**Expected Result:**
- Item is matched to original shortage
- Quantity is tracked against shortage

---

### TC-215: Reconcile original shortage

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | Follow-up material received |

**Steps:**
1. `agent-browser snapshot -i` — Capture reconciliation
2. `agent-browser screenshot TC-215_reconcile.png` — Capture result

**Expected Result:**
- Original shortage is reduced
- Final result: Expected = Received, Outstanding = 0

---

### TC-216: Follow-up receipt summary

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Follow-up completed |

**Steps:**
1. `agent-browser snapshot -i` — Capture summary
2. `agent-browser screenshot TC-216_followup_summary.png` — Capture result

**Expected Result:**
- Summary shows original shortage and follow-up received
- Final reconciliation displayed

---

### TC-217: Partial follow-up receipt

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Shortage of 20, only 10 received in follow-up |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan 10 items
2. `agent-browser press Enter` — Submit (x10)
3. `agent-browser snapshot -i` — Capture partial result
4. `agent-browser screenshot TC-217_partial.png` — Capture result

**Expected Result:**
- 10/20 shortage fulfilled
- 10 still outstanding
- Can create another follow-up later

---

### TC-218: Multiple follow-up receipts for same GRN

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Outstanding shortage after first follow-up |

**Steps:**
1. `agent-browser click @e_new_followup` — Create new follow-up
2. `agent-browser select @e_grn_select "GRN-001245"` — Select same GRN
3. `agent-browser snapshot -i` — Capture remaining shortage
4. `agent-browser screenshot TC-218_multi_followup.png` — Capture result

**Expected Result:**
- Shows remaining shortage (10 outstanding)
- Can receive remaining items

---

### TC-219: Follow-up receipt event logged

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Follow-up created |

**Steps:**
1. `agent-browser click @e_tab_activity` — Go to Activity
2. `agent-browser snapshot -i` — Capture events
3. `agent-browser screenshot TC-219_followup_event.png` — Capture result

**Expected Result:**
- Events: FOLLOWUP_RECEIPT_CREATED, FOLLOWUP_ITEM_RECEIVED

---

### TC-220: Follow-up receipt linked to original exception

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | Follow-up created for shortage exception |

**Steps:**
1. `agent-browser snapshot -i` — Capture follow-up detail
2. `agent-browser screenshot TC-220_linked_exc.png` — Capture result

**Expected Result:**
- Follow-up references original exception
- Original GRN, Box, Part are linked

---

### TC-221: Follow-up completion updates original GRN

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P1 |
| **Preconditions** | Follow-up fully received |

**Steps:**
1. `agent-browser click @e13` — Navigate to original GRN
2. `agent-browser snapshot -i` — Capture updated GRN
3. `agent-browser screenshot TC-221_updated_grn.png` — Capture result

**Expected Result:**
- Original GRN shortage is resolved
- Status updated

---

### TC-222: Follow-up receipt dashboard

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Follow-up receipts exist |

**Steps:**
1. `agent-browser click @e15` — Go to Follow-Up Receipts
2. `agent-browser snapshot -i` — Capture dashboard
3. `agent-browser screenshot TC-222_followup_dash.png` — Capture result

**Expected Result:**
- List of follow-up receipts
- Shows linked GRN, status, date

---

### TC-223: Follow-up receipt status tracking

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Follow-up in progress |

**Steps:**
1. `agent-browser snapshot -i` — Capture status
2. `agent-browser screenshot TC-223_status.png` — Capture result

**Expected Result:**
- Status shows: In Progress, Partially Received, Completed

---

### TC-224: Cancel follow-up receipt

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P3 |
| **Preconditions** | Follow-up creation in progress |

**Steps:**
1. `agent-browser click @e_cancel_followup` — Cancel
2. `agent-browser snapshot -i` — Capture confirmation
3. `agent-browser click @e_confirm_cancel` — Confirm
4. `agent-browser screenshot TC-224_cancel.png` — Capture result

**Expected Result:**
- Follow-up is cancelled
- No changes to original GRN

---

### TC-225: Follow-up receipt history

| Field | Value |
|-------|-------|
| **Category** | Follow-Up Receipts |
| **Priority** | P2 |
| **Preconditions** | Multiple follow-ups completed |

**Steps:**
1. `agent-browser snapshot -i` — Capture history list
2. `agent-browser screenshot TC-225_history.png` — Capture result

**Expected Result:**
- History shows all follow-up receipts
- Each linked to original GRN
- Status and date displayed

---

## M. Event Log / Activity

### TC-226: Activity tab shows all events

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | GRN with various activities |

**Steps:**
1. `agent-browser click @e_tab_activity` — Click Activity tab
2. `agent-browser wait --load networkidle` — Wait for load
3. `agent-browser snapshot -i` — Capture event list
4. `agent-browser screenshot TC-226_activity.png` — Capture result

**Expected Result:**
- All events are listed chronologically
- Each event shows type, timestamp, user

---

### TC-227: Event types displayed correctly

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser snapshot -i` — Capture event types
2. `agent-browser screenshot TC-227_event_types.png` — Capture result

**Expected Result:**
- Event types include: TRUCK_CREATED, GRN_CREATED, INVOICE_ASSIGNED, PACKING_LIST_IMPORTED, BOX_SCANNED, BOX_RECEIVED, ITEM_SCANNED, etc.

---

### TC-228: Event timestamp format correct

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P2 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser get text @e_event_timestamp` — Get timestamp
2. `agent-browser screenshot TC-228_timestamp.png` — Capture result

**Expected Result:**
- Timestamp is in ISO 8601 or readable format
- Includes date and time

---

### TC-229: Event user recorded

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser get text @e_event_user` — Get user
2. `agent-browser screenshot TC-229_user.png` — Capture result

**Expected Result:**
- User matches who performed the action

---

### TC-230: Event device recorded

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P2 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser get text @e_event_device` — Get device
2. `agent-browser screenshot TC-230_device.png` — Capture result

**Expected Result:**
- Device identifier is recorded

---

### TC-231: Event GRN/Invoice/Box/Part context

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | Scan events exist |

**Steps:**
1. `agent-browser click @e_event_detail` — Click event detail
2. `agent-browser snapshot -i` — Capture context
3. `agent-browser screenshot TC-231_context.png` — Capture result

**Expected Result:**
- Event includes: GRN, Invoice, Box, Part, Quantity, Result

---

### TC-232: Events are immutable (no edit/delete)

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser snapshot -i` — Capture events
2. `agent-browser screenshot TC-232_immutable.png` — Capture result

**Expected Result:**
- No edit or delete buttons on events
- Events cannot be modified

---

### TC-233: Event log filterable by type

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P2 |
| **Preconditions** | Multiple event types |

**Steps:**
1. `agent-browser select @e_event_type_filter "BOX_SCANNED"` — Filter by type
2. `agent-browser snapshot -i` — Capture filtered events
3. `agent-browser screenshot TC-233_filter.png` — Capture result

**Expected Result:**
- Only BOX_SCANNED events shown
- Filter can be cleared

---

### TC-234: Event log sortable by timestamp

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P3 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser click @e_sort_timestamp` — Sort by timestamp
2. `agent-browser snapshot -i` — Capture sorted
3. `agent-browser screenshot TC-234_sort.png` — Capture result

**Expected Result:**
- Events sorted chronologically
- Can toggle asc/desc

---

### TC-235: Event log pagination

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P3 |
| **Preconditions** | 100+ events |

**Steps:**
1. `agent-browser snapshot -i` — Capture first page
2. `agent-browser click @e_next_page` — Go to next page
3. `agent-browser snapshot -i` — Capture second page
4. `agent-browser screenshot TC-235_pagination.png` — Capture result

**Expected Result:**
- Events are paginated
- Page navigation works
- Shows page number and total

---

### TC-236: Event details expandable

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P2 |
| **Preconditions** | Events exist |

**Steps:**
1. `agent-browser click @e_event_expand` — Expand event
2. `agent-browser snapshot -i` — Capture expanded details
3. `agent-browser screenshot TC-236_expand.png` — Capture result

**Expected Result:**
- Full event details are shown
- All context fields are displayed

---

### TC-237: Scan events logged (box and item)

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | Box and item scans performed |

**Steps:**
1. `agent-browser snapshot -i` — Capture scan events
2. `agent-browser screenshot TC-237_scan_events.png` — Capture result

**Expected Result:**
- BOX_SCANNED events present
- ITEM_SCANNED events present
- Each with correct context

---

### TC-238: Status change events logged

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | GRN status has changed |

**Steps:**
1. `agent-browser snapshot -i` — Capture status events
2. `agent-browser screenshot TC-238_status_events.png` — Capture result

**Expected Result:**
- Status change events are logged
- Shows old status → new status

---

### TC-239: Exception events logged

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P1 |
| **Preconditions** | Exceptions created |

**Steps:**
1. `agent-browser snapshot -i` — Capture exception events
2. `agent-browser screenshot TC-239_exc_events.png` — Capture result

**Expected Result:**
- EXCEPTION_CREATED events present
- EXCEPTION_RESOLVED events present

---

### TC-240: Audit events logged

| Field | Value |
|-------|-------|
| **Category** | Event Log / Activity |
| **Priority** | P2 |
| **Preconditions** | Audit performed |

**Steps:**
1. `agent-browser snapshot -i` — Capture audit events
2. `agent-browser screenshot TC-240_audit_events.png` — Capture result

**Expected Result:**
- AUDIT_STARTED, AUDIT_ITEM_CHECKED, AUDIT_DISCREPANCY_FOUND events present

---

## N. GRN Status & Workflow

### TC-241: GRN status transitions correctly through all states

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | New GRN being processed |

**Steps:**
1. `agent-browser get text @e_status` — Check current status
2. `agent-browser screenshot TC-241_status.png` — Capture status

**Expected Result:**
- Status follows: DRAFT → RECEIVING → BOX_RECONCILIATION → ITEM_VERIFICATION → EXCEPTION_PENDING (if applicable) → ITEM_VERIFICATION_COMPLETE → PUTAWAY_PENDING → PUTAWAY_IN_PROGRESS → COMPLETED

---

### TC-242: DRAFT → RECEIVING transition

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | GRN in DRAFT status |

**Steps:**
1. `agent-browser click @e_start_receiving` — Start receiving
2. `agent-browser wait --load networkidle` — Wait
3. `agent-browser get text @e_status` — Check status
4. `agent-browser screenshot TC-242_draft_receiving.png` — Capture result

**Expected Result:**
- Status changes to RECEIVING

---

### TC-243: RECEIVING → BOX_RECONCILIATION transition

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Box receiving completed |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-243_receiving_recon.png` — Capture result

**Expected Result:**
- Status changes to BOX_RECONCILIATION

---

### TC-244: BOX_RECONCILIATION → ITEM_VERIFICATION transition

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Box reconciliation approved |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-244_recon_verify.png` — Capture result

**Expected Result:**
- Status changes to ITEM_VERIFICATION

---

### TC-245: ITEM_VERIFICATION → EXCEPTION_PENDING (when exceptions exist)

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Item verification complete with exceptions |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-245_verify_exc.png` — Capture result

**Expected Result:**
- Status changes to EXCEPTION_PENDING
- Exceptions must be resolved before proceeding

---

### TC-246: ITEM_VERIFICATION → ITEM_VERIFICATION_COMPLETE (no exceptions)

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Item verification complete, no exceptions |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-246_verify_complete.png` — Capture result

**Expected Result:**
- Status changes to ITEM_VERIFICATION_COMPLETE

---

### TC-247: EXCEPTION_PENDING → ITEM_VERIFICATION_COMPLETE (after resolution)

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | All exceptions resolved |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-247_exc_resolved.png` — Capture result

**Expected Result:**
- Status changes to ITEM_VERIFICATION_COMPLETE

---

### TC-248: ITEM_VERIFICATION_COMPLETE → PUTAWAY_PENDING

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Item verification complete |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-248_putaway_pending.png` — Capture result

**Expected Result:**
- Status changes to PUTAWAY_PENDING

---

### TC-249: PUTAWAY_PENDING → PUTAWAY_IN_PROGRESS

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Put-away started |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-249_putaway_progress.png` — Capture result

**Expected Result:**
- Status changes to PUTAWAY_IN_PROGRESS

---

### TC-250: PUTAWAY_IN_PROGRESS → COMPLETED

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | Put-away completed |

**Steps:**
1. `agent-browser get text @e_status` — Check status
2. `agent-browser screenshot TC-250_completed.png` — Capture result

**Expected Result:**
- Status changes to COMPLETED
- Stock becomes available

---

### TC-251: Status cannot be skipped

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | GRN in RECEIVING status |

**Steps:**
1. `agent-browser click @e_skip_to_complete` — Try to skip
2. `agent-browser snapshot -i` — Capture error
3. `agent-browser screenshot TC-251_no_skip.png` — Capture result

**Expected Result:**
- Status cannot be skipped
- Error or button is disabled

---

### TC-252: Status displayed correctly in GRN workspace

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | GRN open |

**Steps:**
1. `agent-browser snapshot -i` — Capture status display
2. `agent-browser screenshot TC-252_status_display.png` — Capture result

**Expected Result:**
- Current status is prominently displayed
- Status badge has correct color/style

---

### TC-253: Workflow progress bar reflects current status

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | GRN at any status |

**Steps:**
1. `agent-browser snapshot -i` — Capture progress bar
2. `agent-browser screenshot TC-253_progress_reflect.png` — Capture result

**Expected Result:**
- Progress bar highlights current stage
- Completed stages have checkmarks
- Future stages are grayed out

---

### TC-254: GRN completion summary accurate

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | GRN completed |

**Steps:**
1. `agent-browser snapshot -i` — Capture completion summary
2. `agent-browser screenshot TC-254_completion.png` — Capture result

**Expected Result:**
- Summary shows: Boxes (Expected/Received), Items (Expected/Received), Short, Excess, Exceptions (Total/Resolved), Audit, Put-Away, Status: COMPLETED

---

### TC-255: Stock available only after COMPLETED status

| Field | Value |
|-------|-------|
| **Category** | GRN Status & Workflow |
| **Priority** | P1 |
| **Preconditions** | GRN just completed |

**Steps:**
1. `agent-browser snapshot -i` — Capture stock status
2. `agent-browser screenshot TC-255_stock_available.png` — Capture result

**Expected Result:**
- Stock is available in inventory
- Only after GRN is COMPLETED

---

## O. End-to-End Scenarios

### TC-256: Full Packing List Mode flow - clean (no exceptions)

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | New GRN to create |

**Steps:**
1. `agent-browser open http://34.93.122.213:8080/login` — Login
2. `agent-browser snapshot -i` — Capture login
3. `agent-browser fill @e5 "admin"` — Username
4. `agent-browser fill @e6 "admin123"` — Password
5. `agent-browser click @e7` — Login
6. `agent-browser wait --load networkidle` — Wait
7. `agent-browser click @e13` — Go to GRN
8. `agent-browser wait --load networkidle` — Wait
9. `agent-browser click @e_new_grn` — Create GRN
10. `agent-browser fill @e_supplier "Clean Supplier"` — Supplier
11. `agent-browser fill @e_truck "TRK-CLEAN"` — Truck
12. `agent-browser select @e_receiving_mode "Packing List"` — Mode
13. `agent-browser click @e_save_grn` — Save
14. `agent-browser wait --load networkidle` — Wait
15. `agent-browser screenshot TC-256_e2e_clean.png` — Capture

**Expected Result:**
- GRN created successfully
- Status: RECEIVING
- Ready for box receiving

---

### TC-257: Full Packing List Mode flow - with shortage exception

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | GRN with packing list, box has fewer items than expected |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "12345"` — Scan items (fewer than expected)
4. `agent-browser press Enter` — Submit (x18 instead of 20)
5. `agent-browser snapshot -i` — Capture shortage
6. `agent-browser screenshot TC-257_shortage_e2e.png` — Capture result

**Expected Result:**
- Shortage detected
- Exception created
- Box not auto-closed

---

### TC-258: Full Packing List Mode flow - with excess exception

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | GRN with packing list, box has more items than expected |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-002"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "12345"` — Scan items (more than expected)
4. `agent-browser press Enter` — Submit (x21 instead of 20)
5. `agent-browser snapshot -i` — Capture excess
6. `agent-browser screenshot TC-258_excess_e2e.png` — Capture result

**Expected Result:**
- Excess detected
- Exception created
- Excess not silently accepted

---

### TC-259: Full Packing List Mode flow - with wrong item exception

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | GRN with packing list, box contains wrong item |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-003"` — Scan box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "99999"` — Scan wrong item
4. `agent-browser press Enter` — Submit
5. `agent-browser snapshot -i` — Capture wrong item warning
6. `agent-browser screenshot TC-259_wrong_e2e.png` — Capture result

**Expected Result:**
- Wrong item warning
- Exception created
- Item not accepted

---

### TC-260: Full Invoice-Only Mode flow - clean

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | GRN in Invoice-Only mode |

**Steps:**
1. `agent-browser click @e_new_grn` — Create GRN
2. `agent-browser fill @e_supplier "Invoice Supplier"` — Supplier
3. `agent-browser select @e_receiving_mode "Invoice-Only"` — Mode
4. `agent-browser click @e_save_grn` — Save
5. `agent-browser wait --load networkidle` — Wait
6. `agent-browser fill @e_invoice "INV-ONLY-001"` — Add invoice
7. `agent-browser click @e_assign_invoice` — Assign
8. `agent-browser screenshot TC-260_io_clean.png` — Capture result

**Expected Result:**
- Invoice-Only GRN created
- Invoice assigned
- Ready for consolidated verification

---

### TC-261: Full Invoice-Only Mode flow - with discrepancies

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | Invoice-Only GRN with items to verify |

**Steps:**
1. `agent-browser fill @e_item_scan "12345"` — Scan items
2. `agent-browser press Enter` — Submit (fewer than expected)
3. `agent-browser fill @e_item_scan "67890"` — Scan more items
4. `agent-browser press Enter` — Submit (more than expected)
5. `agent-browser snapshot -i` — Capture discrepancies
6. `agent-browser screenshot TC-261_io_discrepancy.png` — Capture result

**Expected Result:**
- Shortage for first part
- Excess for second part
- Exceptions created for both

---

### TC-262: Full flow with follow-up receipt

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | GRN with shortage, follow-up delivery arriving |

**Steps:**
1. `agent-browser click @e15` — Go to Follow-Up Receipts
2. `agent-browser click @e_new_followup` — Create follow-up
3. `agent-browser select @e_grn_select "GRN-SHORTAGE"` — Select GRN
4. `agent-browser fill @e_item_scan "12345"` — Scan follow-up items
5. `agent-browser press Enter` — Submit
6. `agent-browser snapshot -i` — Capture reconciliation
7. `agent-browser screenshot TC-262_followup_e2e.png` — Capture result

**Expected Result:**
- Follow-up linked to original GRN
- Shortage resolved
- Original GRN updated

---

### TC-263: Full flow with audit

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | GRN with verified items |

**Steps:**
1. `agent-browser click @e_tab_audit` — Go to Audit
2. `agent-browser select @e_audit_count "5"` — Select 5 items
3. `agent-browser click @e_start_audit` — Start audit
4. `agent-browser fill @e_physical_qty "20"` — Enter physical qty
5. `agent-browser click @e_submit_audit` — Submit
6. `agent-browser snapshot -i` — Capture result
7. `agent-browser screenshot TC-263_audit_e2e.png` — Capture result

**Expected Result:**
- Audit completed
- Pass/Fail recorded
- Event logged

---

### TC-264: Full flow with multiple invoices

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P2 |
| **Preconditions** | GRN with multiple invoices |

**Steps:**
1. `agent-browser fill @e_invoice "INV-MULTI-001"` — First invoice
2. `agent-browser click @e_assign_invoice` — Assign
3. `agent-browser fill @e_invoice "INV-MULTI-002"` — Second invoice
4. `agent-browser click @e_assign_invoice` — Assign
5. `agent-browser snapshot -i` — Capture multiple invoices
6. `agent-browser screenshot TC-264_multi_inv.png` — Capture result

**Expected Result:**
- Both invoices assigned
- Parts consolidated correctly

---

### TC-265: Full flow with single box

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P2 |
| **Preconditions** | GRN with 1 expected box |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-SOLO"` — Scan single box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "12345"` — Scan items
4. `agent-browser press Enter` — Submit (x10)
5. `agent-browser snapshot -i` — Capture completion
6. `agent-browser screenshot TC-265_single_box_e2e.png` — Capture result

**Expected Result:**
- Single box verified
- GRN progresses through workflow

---

### TC-266: Full flow with 50+ boxes

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P2 |
| **Preconditions** | GRN with 50+ expected boxes |

**Steps:**
1. `agent-browser snapshot -i` — Capture box receiving
2. `agent-browser screenshot TC-266_50_boxes.png` — Capture result

**Expected Result:**
- All 50+ boxes can be scanned
- Performance remains acceptable
- Reconciliation handles large count

---

### TC-267: Full flow with same part in multiple boxes

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | Part 12345 in BOX-001, BOX-002, BOX-003 |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-001"` — Scan first box
2. `agent-browser press Enter` — Submit
3. `agent-browser fill @e_item_scan "12345"` — Scan 20 items
4. `agent-browser press Enter` — Submit (x20)
5. `agent-browser fill @e_box_scan "BOX-002"` — Scan second box
6. `agent-browser press Enter` — Submit
7. `agent-browser fill @e_item_scan "12345"` — Scan 15 items
8. `agent-browser press Enter` — Submit (x15)
9. `agent-browser fill @e_box_scan "BOX-003"` — Scan third box
10. `agent-browser press Enter` — Submit
11. `agent-browser fill @e_item_scan "12345"` — Scan 25 items
12. `agent-browser press Enter` — Submit (x25)
13. `agent-browser snapshot -i` — Capture reconciliation
14. `agent-browser screenshot TC-267_multi_box_part.png` — Capture result

**Expected Result:**
- BOX-001: 20/20 ✓
- BOX-002: 15/15 ✓
- BOX-003: 25/25 ✓
- TOTAL: 60/60 ✓

---

### TC-268: Full flow operator perspective

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P1 |
| **Preconditions** | Operator role, GRN to process |

**Steps:**
1. `agent-browser snapshot -i` — Capture operator view
2. `agent-browser screenshot TC-268_operator.png` — Capture result

**Expected Result:**
- Operator sees: scan field, feedback, simple interface
- No complex management controls visible
- Focus on SCAN → FEEDBACK → NEXT SCAN

---

### TC-269: Full flow supervisor perspective

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P2 |
| **Preconditions** | Supervisor role, GRN to review |

**Steps:**
1. `agent-browser snapshot -i` — Capture supervisor view
2. `agent-browser screenshot TC-269_supervisor.png` — Capture result

**Expected Result:**
- Supervisor sees: reconciliation, exceptions, audit, activity log
- Full management controls available
- Can approve/reject reconciliation

---

### TC-270: Resume interrupted GRN

| Field | Value |
|-------|-------|
| **Category** | End-to-End Scenarios |
| **Priority** | P2 |
| **Preconditions** | GRN was interrupted mid-process |

**Steps:**
1. `agent-browser click @e13` — Go to GRN list
2. `agent-browser click @e_interrupted_grn` — Open interrupted GRN
3. `agent-browser snapshot -i` — Capture resumed state
4. `agent-browser screenshot TC-270_resume.png` — Capture result

**Expected Result:**
- GRN state is preserved
- Can continue from where left off
- Previous progress is maintained

---

## P. Error Handling & Edge Cases

### TC-271: Network timeout during scan

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Network connectivity issues |

**Steps:**
1. `agent-browser fill @e_box_scan "BOX-TIMEOUT"` — Enter box
2. `agent-browser press Enter` — Submit
3. `agent-browser wait 5000` — Wait for timeout
4. `agent-browser snapshot -i` — Capture timeout handling
5. `agent-browser screenshot TC-271_timeout.png` — Capture result

**Expected Result:**
- Timeout error message displayed
- Scan can be retried
- No data loss

---

### TC-272: Session expiry during operation

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Session expires |

**Steps:**
1. `agent-browser snapshot -i` — Capture session state
2. `agent-browser screenshot TC-272_session.png` — Capture result

**Expected Result:**
- Redirect to login page
- Warning about session expiry
- Can re-login and resume

---

### TC-273: Concurrent user access to same GRN

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Two users accessing same GRN |

**Steps:**
1. `agent-browser --session user1 open http://34.93.122.213:8080` — User 1
2. `agent-browser --session user2 open http://34.93.122.213:8080` — User 2
3. `agent-browser --session user1 snapshot -i` — User 1 view
4. `agent-browser --session user2 snapshot -i` — User 2 view
5. `agent-browser screenshot TC-273_concurrent.png` — Capture result

**Expected Result:**
- Both users can view GRN
- Conflict handling for simultaneous edits
- Last-save-wins or locking mechanism

---

### TC-274: Browser refresh during workflow

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Workflow in progress |

**Steps:**
1. `agent-browser snapshot -i` — Capture current state
2. `agent-browser refresh` — Refresh browser
3. `agent-browser wait --load networkidle` — Wait
4. `agent-browser snapshot -i` — Capture refreshed state
5. `agent-browser screenshot TC-274_refresh.png` — Capture result

**Expected Result:**
- State is preserved after refresh
- Can continue workflow
- No data loss

---

### TC-275: Invalid barcode/QR scan

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Box receiving active |

**Steps:**
1. `agent-browser fill @e_box_scan "INVALID@#$%"` — Enter invalid scan
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture error
4. `agent-browser screenshot TC-275_invalid_scan.png` — Capture result

**Expected Result:**
- Error message: invalid format
- Scan field clears
- Can try again

---

### TC-276: Empty scan submission

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Scan field empty |

**Steps:**
1. `agent-browser press Enter` — Submit empty scan
2. `agent-browser snapshot -i` — Capture validation
3. `agent-browser screenshot TC-276_empty.png` — Capture result

**Expected Result:**
- Validation error or no action
- Empty scan not processed

---

### TC-277: Special characters in all input fields

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | GRN creation form |

**Steps:**
1. `agent-browser fill @e_supplier "<script>alert('xss')</script>"` — XSS attempt
2. `agent-browser fill @e_truck "TRK-<b>BOLD</b>"` — HTML injection
3. `agent-browser click @e_save_grn` — Submit
4. `agent-browser snapshot -i` — Capture handling
5. `agent-browser screenshot TC-277_special.png` — Capture result

**Expected Result:**
- Special characters are sanitized
- No script execution
- HTML is escaped
- Error message or accepted as plain text

---

### TC-278: Maximum field length validation

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | GRN creation form |

**Steps:**
1. `agent-browser fill @e_supplier "A" * 1000` — Enter very long text
2. `agent-browser click @e_save_grn` — Submit
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-278_max_length.png` — Capture result

**Expected Result:**
- Field length limit enforced
- Error message if exceeded
- Or truncated to max length

---

### TC-279: SQL injection prevention in input fields

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P1 |
| **Preconditions** | GRN creation form |

**Steps:**
1. `agent-browser fill @e_supplier "'; DROP TABLE grn; --"` — SQL injection
2. `agent-browser click @e_save_grn` — Submit
3. `agent-browser snapshot -i` — Capture handling
4. `agent-browser screenshot TC-279_sql_inject.png` — Capture result

**Expected Result:**
- SQL injection is prevented
- Input is sanitized
- No database damage
- Error message or accepted as plain text

---

### TC-280: XSS prevention in input fields

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P1 |
| **Preconditions** | Any input field |

**Steps:**
1. `agent-browser fill @e_truck "<img src=x onerror=alert(1)>"` — XSS payload
2. `agent-browser click @e_save_grn` — Submit
3. `agent-browser snapshot -i` — Capture handling
4. `agent-browser screenshot TC-280_xss.png` — Capture result

**Expected Result:**
- XSS payload is sanitized
- No script execution
- Content is escaped

---

### TC-281: Rapid repeated button clicks

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Form with submit button |

**Steps:**
1. `agent-browser click @e_save_grn` — Click save
2. `agent-browser click @e_save_grn` — Click again immediately
3. `agent-browser click @e_save_grn` — Click third time
4. `agent-browser snapshot -i` — Capture result
5. `agent-browser screenshot TC-281_rapid_click.png` — Capture result

**Expected Result:**
- Only one GRN is created
- Duplicate submissions prevented
- Button disabled after first click

---

### TC-282: Double form submission

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Form submitted |

**Steps:**
1. `agent-browser click @e_save_grn` — Submit form
2. `agent-browser press Enter` — Submit again via Enter
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-282_double_submit.png` — Capture result

**Expected Result:**
- Only one submission processed
- Duplicate prevented

---

### TC-283: Back button during multi-step process

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Midway through workflow |

**Steps:**
1. `agent-browser snapshot -i` — Capture current step
2. `agent-browser press Alt+ArrowLeft` — Press back
3. `agent-browser snapshot -i` — Capture result
4. `agent-browser screenshot TC-283_back.png` — Capture result

**Expected Result:**
- Graceful handling of back navigation
- State preserved or warning shown
- Can continue forward

---

### TC-284: Multiple tabs with same GRN

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | GRN open in one tab |

**Steps:**
1. `agent-browser tab new http://34.93.122.213:8080` — Open new tab
2. `agent-browser snapshot -i` — Capture new tab
3. `agent-browser screenshot TC-284_multi_tab.png` — Capture result

**Expected Result:**
- Both tabs can view GRN
- Changes in one tab may need refresh in other
- No data corruption

---

### TC-285: Print/export functionality

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | GRN with data |

**Steps:**
1. `agent-browser click @e_print` — Click print
2. `agent-browser snapshot -i` — Capture print preview
3. `agent-browser screenshot TC-285_print.png` — Capture result

**Expected Result:**
- Print view is formatted correctly
- All relevant data included

---

### TC-286: GRN with zero expected boxes

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | GRN creation form |

**Steps:**
1. `agent-browser fill @e_boxes "0"` — Enter zero boxes
2. `agent-browser click @e_save_grn` — Submit
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-286_zero_boxes.png` — Capture result

**Expected Result:**
- Validation error or warning
- GRN cannot proceed without boxes

---

### TC-287: Very long part number handling

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | Item scan field |

**Steps:**
1. `agent-browser fill @e_item_scan "PART-VERY-LONG-NUMBER-12345678901234567890"` — Long part
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture handling
4. `agent-browser screenshot TC-287_long_part.png` — Capture result

**Expected Result:**
- Handled gracefully
- Error if too long, or accepted and truncated

---

### TC-288: Unicode characters in input fields

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | Input fields |

**Steps:**
1. `agent-browser fill @e_supplier "供应商Alpha测试"` — Unicode input
2. `agent-browser click @e_save_grn` — Submit
3. `agent-browser snapshot -i` — Capture handling
4. `agent-browser screenshot TC-288_unicode.png` — Capture result

**Expected Result:**
- Unicode characters accepted
- Displayed correctly

---

### TC-289: Negative quantity in item scan

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P3 |
| **Preconditions** | Item verification active |

**Steps:**
1. `agent-browser fill @e_item_scan "-5"` — Enter negative
2. `agent-browser press Enter` — Submit
3. `agent-browser snapshot -i` — Capture validation
4. `agent-browser screenshot TC-289_negative.png` — Capture result

**Expected Result:**
- Negative quantities rejected
- Validation error displayed

---

### TC-290: Concurrent scans from multiple devices

| Field | Value |
|-------|-------|
| **Category** | Error Handling & Edge Cases |
| **Priority** | P2 |
| **Preconditions** | Multiple devices scanning same GRN |

**Steps:**
1. `agent-browser --session dev1 fill @e_box_scan "BOX-001"` — Device 1 scan
2. `agent-browser --session dev1 press Enter` — Submit
3. `agent-browser --session dev2 fill @e_box_scan "BOX-002"` — Device 2 scan
4. `agent-browser --session dev2 press Enter` — Submit
5. `agent-browser --session dev1 snapshot -i` — Capture device 1
6. `agent-browser --session dev2 snapshot -i` — Capture device 2
7. `agent-browser screenshot TC-290_concurrent.png` — Capture result

**Expected Result:**
- Both scans are recorded
- No data loss or corruption
- Count is accurate across devices

---

## Summary

| Category | Test Range | Count |
|----------|-----------|-------|
| A. Dashboard & Navigation | TC-001 → TC-015 | 15 |
| B. Truck Arrival / Create GRN | TC-016 → TC-040 | 25 |
| C. Packing List Import | TC-041 → TC-060 | 20 |
| D. Invoice-Only Assignment | TC-061 → TC-070 | 10 |
| E. Box Receiving | TC-071 → TC-100 | 30 |
| F. Box Reconciliation | TC-101 → TC-115 | 15 |
| G. POD | TC-116 → TC-125 | 10 |
| H. Item Verification (PL) | TC-126 → TC-160 | 35 |
| I. Item Verification (IO) | TC-161 → TC-175 | 15 |
| J. Exception Handling | TC-176 → TC-195 | 20 |
| K. Audit | TC-196 → TC-210 | 15 |
| L. Follow-Up Receipts | TC-211 → TC-225 | 15 |
| M. Event Log / Activity | TC-226 → TC-240 | 15 |
| N. GRN Status & Workflow | TC-241 → TC-255 | 15 |
| O. End-to-End Scenarios | TC-256 → TC-270 | 15 |
| P. Error Handling & Edge Cases | TC-271 → TC-290 | 20 |
| **TOTAL** | | **290** |
