# goWMS Documentation

**Last Updated:** 2026-08-15  
**System:** http://34.93.122.213:8080

---

## Folder Structure

```
docs/
├── scenarios/              # 81 test scenario documents
│   ├── INDEX.md           # Master index with all scenarios
│   ├── S-001.md to S-081.md
│   └── evidence/          # 959 screenshots + snapshots
├── tc_evidence/           # 261 TC test case folders (484 files)
├── grn_critique/          # GRN page analysis (4 files)
├── spec/                  # Specification documents
│   ├── SPEC.md
│   ├── SPEC_01_WAREHOUSE_SETUP.md
│   ├── SPEC_02_INBOUND.md
│   └── SPEC_03_OUTBOUND.md
├── implementation/        # Implementation docs (20 files)
├── _archive/              # Archived duplicate reports
│
├── GRN_BUG_REPORT.md      # 22 bugs (5 critical, 5 high, 7 medium, 5 low)
├── GRN_WORKSPACE_FINDINGS.md  # Complete workspace analysis
├── TC_TEST_CASE_INDEX.md  # 290 TC test case index
├── GRN_MODULE_DOCUMENTATION.md
├── GRN_SPEC_GAP_ANALYSIS.md
├── GRN_SPEC_VS_IMPL_REPORT.md
├── QA_UI_UX_AUDIT_REPORT.md
├── PRIORITY_QUEUE_DESIGN.md
├── goWMS_Outbound_Analysis.md
├── goWMS_login.png
├── goWMS_dashboard.png
├── grn_test_cases.md      # 290 TC definitions
├── grn_test_log.txt       # Test execution log
└── grn_bug_report.md      # Bug report (workspace copy)
```

---

## Key Documents

### Bug Reports
| Document | Description |
|----------|-------------|
| `GRN_BUG_REPORT.md` | 22 bugs with severity, evidence, recommendations |

### Test Documentation
| Document | Description |
|----------|-------------|
| `TC_TEST_CASE_INDEX.md` | 290 TC test case index |
| `scenarios/INDEX.md` | 81 scenario master index |
| `grn_test_cases.md` | 290 TC definitions |

### Analysis
| Document | Description |
|----------|-------------|
| `GRN_WORKSPACE_FINDINGS.md` | Complete workspace analysis |
| `GRN_SPEC_GAP_ANALYSIS.md` | Spec compliance gaps |
| `GRN_SPEC_VS_IMPL_REPORT.md` | Spec vs implementation |
| `QA_UI_UX_AUDIT_REPORT.md` | UI/UX audit |

### Specifications
| Document | Description |
|----------|-------------|
| `spec/SPEC.md` | Main specification |
| `spec/SPEC_01_WAREHOUSE_SETUP.md` | Warehouse setup spec |
| `spec/SPEC_02_INBOUND.md` | Inbound spec |
| `spec/SPEC_03_OUTBOUND.md` | Outbound spec |

---

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total Scenarios** | 81 |
| **Tested Scenarios** | 20 |
| **TC Test Cases** | 290 |
| **Screenshots** | 990 |
| **Bugs Found** | 22 |
| **Spec Violations** | 15+ |

---

## How to Use

1. **Start with:** `GRN_BUG_REPORT.md` for issues
2. **Then read:** `GRN_WORKSPACE_FINDINGS.md` for analysis
3. **For details:** `scenarios/INDEX.md` for scenario list
4. **For evidence:** `scenarios/evidence/` for screenshots
