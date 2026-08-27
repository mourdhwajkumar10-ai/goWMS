# goWMS Edge Case Test Report

## Summary
- **Total Tests:** 50
- **Passed:** 25 (50%)
- **Failed:** 25
- **Avg Time:** 2279ms

## Results by Category

| Category | Tests | Passed |
|----------|-------|--------|
| Security | 10 | 9 |
| Accessibility | 10 | 9 |
| Mobile | 10 | 7 |
| Performance | 10 | 0 |
| Data Integrity | 10 | 0 |

## Detailed Results

| ID | Test | Status | Time | Result |
|-----|------|--------|------|--------|
| SEC-01 | SQL Injection Login | ✅ | 2120ms | Blocked |
| SEC-02 | Invalid Token | ✅ | 70ms | Rejected |
| SEC-03 | Password Field Type | ✅ | 1063ms | Masked correctly |
| SEC-04 | Session Persistence | ✅ | 6635ms | Persists |
| SEC-05 | Deep Link Without Auth | ✅ | 2058ms | Redirected to login |
| SEC-06 | XSS in Input | ✅ | 7637ms | Input not found |
| SEC-07 | Empty Search Query | ✅ | 2054ms | Search not found |
| SEC-08 | API Health Check | ✅ | 55ms | Health OK |
| SEC-09 | Large Input | ✅ | 3062ms | Large input handled |
| SEC-10 | Concurrent Requests | ❌ | 5560ms | net::ERR_ABORTED at http://34.93.122.213:8080/api/grn/sessio |
| A11Y-01 | Tab Navigation | ✅ | 1090ms | Tab order: INPUT→BUTTON→BODY→BUTTON→BUTTON |
| A11Y-02 | Button Sizes | ✅ | 7616ms | 3/3 buttons < 44px |
| A11Y-03 | Page Title | ✅ | 5563ms | Title: "goWMS" |
| A11Y-04 | Input Labels | ✅ | 2061ms | 2 labels, 2 inputs |
| A11Y-05 | Focus Visible | ✅ | 1053ms | Focus visible |
| A11Y-06 | Color Contrast | ✅ | 2054ms | Colors: rgb(249, 250, 250) / rgb(31, 39, 46) |
| A11Y-07 | Viewport Meta | ✅ | 57ms | Viewport meta present |
| A11Y-08 | Table Headers | ✅ | 7654ms | 0/0 tables have headers |
| A11Y-09 | Escape Key | ❌ | 7604ms | SyntaxError: Failed to execute 'querySelector' on 'Document' |
| A11Y-10 | Form Error Messages | ✅ | 2101ms | No error message |
| MOB-01 | iPhone SE (375x667) | ✅ | 7605ms | HORIZONTAL SCROLL |
| MOB-02 | iPhone 14 (390x844) | ✅ | 7609ms | No overflow |
| MOB-03 | iPad (768x1024) | ✅ | 7634ms | No overflow |
| MOB-04 | Galaxy S21 (360x800) | ✅ | 7621ms | HORIZONTAL SCROLL |
| MOB-05 | Pixel 7 (412x915) | ✅ | 7621ms | No overflow |
| MOB-06 | Touch Events | ✅ | 15ms | No touch |
| MOB-07 | Input Font Size | ✅ | 6615ms | 2 inputs < 16px (causes zoom) |
| MOB-08 | Button Tap Targets | ❌ | 2047ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| MOB-09 | Table Overflow | ❌ | 1ms | Protocol error (Emulation.setTouchEmulationEnabled): Session |
| MOB-10 | Responsive Layout | ❌ | 0ms | Protocol error (Emulation.setTouchEmulationEnabled): Session |
| PERF-01 | Login Time | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-02 | GRN Page Load | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-03 | Putaway Page Load | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-04 | Items Page Load | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-05 | API Health Latency | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-06 | API Sessions Latency | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-07 | DOM Size | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-08 | Console Errors | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-09 | Resources Loaded | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| PERF-10 | Tab Switch Speed | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-01 | Session Token Format | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-02 | Role Storage | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-03 | Numeric Input | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-04 | Date Input | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-05 | Unicode Support | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-06 | Form Clear | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-07 | Checkbox Toggle | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-08 | Select Dropdown | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-09 | Negative Number | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |
| DATA-10 | Max Length | ❌ | 0ms | Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6 |

## Critical Findings

- **SEC-10:** net::ERR_ABORTED at http://34.93.122.213:8080/api/grn/sessio
- **A11Y-09:** SyntaxError: Failed to execute 'querySelector' on 'Document'
- **MOB-01:** HORIZONTAL SCROLL
- **MOB-04:** HORIZONTAL SCROLL
- **MOB-08:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **MOB-09:** Protocol error (Emulation.setTouchEmulationEnabled): Session
- **MOB-10:** Protocol error (Emulation.setTouchEmulationEnabled): Session
- **PERF-01:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-02:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-03:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-04:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-05:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-06:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-07:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-08:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-09:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **PERF-10:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-01:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-02:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-03:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-04:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-05:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-06:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-07:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-08:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-09:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6
- **DATA-10:** Attempted to use detached Frame '6F8962EC44661D2C15EEEF86CC6

---
*Generated: 2026-08-15T05:39:04.692Z*
