import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import api from "../services/api";
import "../styles/receiving-wizard.css";

/* ─── Row type for preview ─── */
interface ParsedRow {
  _index: number;
  _selected: boolean;
  _duplicate: boolean;
  _empty: boolean;
  dealer_code: string;
  dealer_name: string;
  branch: string;
  invoice_no: string;
  invoice_date: string;
  delivery_no: string;
  delivery_date: string;
  plant: string;
  box_no_from: string;
  box_no_to: string;
  part_code: string;
  part_name: string;
  qty: number;
  unit_weight: number;
  box_number: string;
  raw: Record<string, any>;
}

/* ─── Types ─── */

interface PackingList {
  id: number;
  name: string;
  supplier_name: string;
  status: string;
  total_boxes: number;
  total_items: number;
  total_qty: number;
  driver_name: string;
  driver_phone: string;
  transporter: string;
  created_at: string;
  created_by: string;
  items: PackingListItem[];
}

interface PackingListItem {
  id: number;
  box_number: string;
  part_code: string;
  part_name: string;
  expected_qty: number;
  scanned_qty: number;
  batch_no: string;
  invoice_no: string;
  dealer_code: string;
  dealer_name: string;
  delivery_no: string;
  plant: string;
  branch: string;
  invoice_date: string;
  delivery_date: string;
  box_no_from: string;
  box_no_to: string;
  unit_weight_kg: number;
  status: string;
  route_location: string;
}

interface TruckSuggestion {
  id: number;
  truck_no: string;
  name: string;
  transporter: string;
  driver_name: string;
  driver_phone: string;
  notes: string;
}

/* ─── Helpers ─── */

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : "-";

/* ─── Component ─── */

export default function ReceivingManagement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ text: string; type: "success" | "warning" | "error" } | null>(null);

  // Packing list state
  const [selectedList, setSelectedList] = useState<PackingList | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [packingFile, setPackingFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<any>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Driver/transport
  const [supplierName, setSupplierName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporter, setTransporter] = useState("");
  const [arrivalTime, setArrivalTime] = useState(new Date().toISOString().slice(0, 16));

  // Truck/Driver autocomplete
  const [truckSuggestions, setTruckSuggestions] = useState<TruckSuggestion[]>([]);
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const truckDropdownRef = useRef<HTMLDivElement>(null);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const driverDropdownRef = useRef<HTMLDivElement>(null);
  const [truckFilter, setTruckFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");

  // Supplier autocomplete
  const [supplierSuggestions, setSupplierSuggestions] = useState<any[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);
  const [supplierFilter, setSupplierFilter] = useState("");

  // Manual entry rows — all 15 fields
  const [entryMode, setEntryMode] = useState<"upload" | "manual">("upload");
  const emptyRow = { dealer_code: "", dealer_name: "", branch: "", invoice_no: "", invoice_date: "", delivery_no: "", delivery_date: "", plant: "", box_no_from: "", box_no_to: "", part_code: "", part_name: "", qty: "", unit_weight: "", box_number: "" };
  const [manualRows, setManualRows] = useState<typeof emptyRow[]>([{ ...emptyRow }]);

  const [grnSessions, setGrnSessions] = useState<any[]>([]);

  // Search/filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination
  const PAGE_SIZE = 10;
  const [grnPage, setGrnPage] = useState(1);

  // Detail modal filters
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [statusFilterDetail, setStatusFilterDetail] = useState("all");

  // Load GRN sessions on mount
  useEffect(() => {
    loadGRNSessions();
    loadTransports();
    api.supplierList().then((r) => {
      if (r.ok) setSupplierSuggestions(r.data || []);
    });
  }, []);

  const loadTransports = async (q?: string) => {
    const res = await api.transportsList(q);
    if (res.ok) setTruckSuggestions(res.data || []);
  };

  const selectTransport = (t: TruckSuggestion) => {
    setDriverName(t.driver_name || "");
    setDriverPhone(t.driver_phone || "");
    setTransporter(t.transporter || t.truck_no || "");
    setShowTruckDropdown(false);
    setShowDriverDropdown(false);
    setTruckFilter("");
    setDriverFilter("");
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (truckDropdownRef.current && !truckDropdownRef.current.contains(e.target as Node)) setShowTruckDropdown(false);
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(e.target as Node)) setShowDriverDropdown(false);
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) setShowSupplierDropdown(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const loadGRNSessions = async () => {
    try {
      const res = await api.grnSessions();
      if (res.ok) setGrnSessions(res.data || []);
    } catch (e: any) {
      /* ignore */
    }
  };

  const showFlash = (text: string, type: "success" | "warning" | "error" = "success") => {
    setFlash({ text, type });
    setTimeout(() => setFlash(null), 3000);
  };

  // Download a sample packing list template (XLSX) — all 15 columns
  const downloadSample = () => {
    const sampleRows = [
      { "Dealer Code": "D001", "Dealer": "Rigan Enterprises", "Branch": "Main", "InvoiceNo": "INV-0001", "InvoiceDate": "2026-08-18", "Delivery No": "DEL-001", "Delivery date": "2026-08-18", "Plant": "P01", "Box No.From": "1", "Box No.To": "5", "Part Code": "SP-0001", "Part Name": "Sample Spare Part", "Qty": 10, "Calculated Part Weight(in KG)": 2.5, "Box Number": "C0001" },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 6 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Packing List");
    XLSX.writeFile(wb, "packing-list-sample.xlsx");
    showFlash("Sample template downloaded", "success");
  };

  // Parse XLSX file and show preview — all 15 columns
  const parseAndPreview = useCallback(async (file: File) => {
    setPreviewLoading(true);
    setError("");
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (jsonData.length === 0) {
        setError("File has no data rows");
        setPreviewLoading(false);
        return;
      }

      const rows: ParsedRow[] = jsonData.map((row, i) => {
        const get = (keys: string[]) => {
          for (const k of keys) {
            for (const col of Object.keys(row)) {
              if (col.toLowerCase().trim() === k.toLowerCase()) return String(row[col] || "").trim();
            }
          }
          return "";
        };
        const getNum = (keys: string[]) => {
          const v = get(keys);
          return parseFloat(v) || 0;
        };
        return {
          _index: i,
          _selected: true,
          _duplicate: false,
          _empty: false,
          dealer_code: get(["Dealer Code", "dealer_code"]),
          dealer_name: get(["Dealer", "dealer_name"]),
          branch: get(["Branch", "branch"]),
          invoice_no: get(["InvoiceNo", "Invoice No", "invoice_no"]),
          invoice_date: get(["InvoiceDate", "Invoice Date", "invoice_date"]),
          delivery_no: get(["Delivery No", "delivery_no"]),
          delivery_date: get(["Delivery date", "Delivery Date", "delivery_date"]),
          plant: get(["Plant", "plant"]),
          box_no_from: get(["Box No.From", "box_no_from"]),
          box_no_to: get(["Box No.To", "box_no_to"]),
          part_code: get(["Part Code", "PartCode", "part_code", "Part No", "PartNo", "Item Code"]),
          part_name: get(["Part Name", "PartName", "part_name"]),
          qty: getNum(["Qty", "qty", "Quantity", "Expected Qty"]),
          unit_weight: getNum(["Calculated Part Weight(in KG)", "unit_weight", "Weight", "Weight(KG)"]),
          box_number: get(["Box Number", "BoxNumber", "box_number", "Box No"]),
          raw: row,
        };
      });

      // Detect duplicates (same box + part_code)
      const seen = new Map<string, number>();
      for (const row of rows) {
        if (!row.box_number || !row.part_code || row.qty <= 0) {
          row._empty = true;
          row._selected = false;
          continue;
        }
        const key = `${row.box_number}|${row.part_code}`;
        if (seen.has(key)) {
          row._duplicate = true;
        }
        seen.set(key, (seen.get(key) || 0) + 1);
      }

      setParsedRows(rows);
      setShowPreview(true);
    } catch (err: any) {
      setError("Failed to parse file: " + (err.message || "Invalid format"));
    }
    setPreviewLoading(false);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setPackingFile(file);
    parseAndPreview(file);
  }, [parseAndPreview]);

  // Build an XLSX from manually entered rows and open the preview — all 15 fields
  const handleManualImport = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const valid = manualRows.filter(
      (r) => r.box_number.trim() && r.part_code.trim() && parseFloat(r.qty) > 0
    );
    if (valid.length === 0) {
      setError("Add at least one row with Box Number, Part Code and Qty");
      return;
    }
    const data = valid.map((r) => ({
      "Dealer Code": r.dealer_code.trim(),
      "Dealer": r.dealer_name.trim(),
      "Branch": r.branch.trim(),
      "InvoiceNo": r.invoice_no.trim(),
      "InvoiceDate": r.invoice_date.trim(),
      "Delivery No": r.delivery_no.trim(),
      "Delivery date": r.delivery_date.trim(),
      "Plant": r.plant.trim(),
      "Box No.From": r.box_no_from.trim(),
      "Box No.To": r.box_no_to.trim(),
      "Part Code": r.part_code.trim(),
      "Part Name": r.part_name.trim(),
      "Qty": parseFloat(r.qty) || 0,
      "Calculated Part Weight(in KG)": parseFloat(r.unit_weight) || 0,
      "Box Number": r.box_number.trim(),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Packing List");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], `manual-packing-list-${Date.now()}.xlsx`, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    setPackingFile(file);
    parseAndPreview(file);
  }, [manualRows, parseAndPreview]);

  const updateManualRow = useCallback((idx: number, field: keyof typeof emptyRow, value: string) => {
    setManualRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }, []);

  const addManualRow = useCallback(() => {
    setManualRows((prev) => [...prev, { ...emptyRow }]);
  }, []);

  const removeManualRow = useCallback((idx: number) => {
    setManualRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packingFile) {
      setError("Please select a packing list file");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const selectedRows = parsedRows.filter((r) => r._selected);
      if (selectedRows.length === 0) {
        setError("No rows selected for import");
        setLoading(false);
        return;
      }

      const exportData = selectedRows.map((r) => ({
        "Dealer Code": r.dealer_code,
        "Dealer": r.dealer_name,
        "Branch": r.branch,
        "InvoiceNo": r.invoice_no,
        "InvoiceDate": r.invoice_date,
        "Delivery No": r.delivery_no,
        "Delivery date": r.delivery_date,
        "Plant": r.plant,
        "Box No.From": r.box_no_from,
        "Box No.To": r.box_no_to,
        "Part Code": r.part_code,
        "Part Name": r.part_name,
        "Qty": r.qty,
        "Calculated Part Weight(in KG)": r.unit_weight,
        "Box Number": r.box_number,
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Packing List");
      const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const filteredFile = new File([xlsxBuffer], packingFile.name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const res = await api.packingListImportFile(
        filteredFile,
        driverName,
        driverPhone,
        transporter,
        supplierName
      );
      setLoading(false);
      if (!res.ok) {
        setError(res.error || "Failed to import packing list");
        return;
      }
      setImportSummary(res.data);
      showFlash(`Packing list imported successfully`, "success");
      loadGRNSessions();
      setShowUpload(false);
      setPackingFile(null);
      setSupplierName("");
      setDriverName("");
      setDriverPhone("");
      setTransporter("");
      setArrivalTime(new Date().toISOString().slice(0, 16));
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Failed to import");
    }
  };

  const handleApprove = async (listId: number) => {
    setLoading(true);
    try {
      const res = await api.packingListApprove(listId);
      if (res.ok) {
        showFlash("Packing list approved - ready to receive", "success");
        loadGRNSessions();
        setSelectedList(null);
      } else {
        showFlash(res.error || "Failed to approve", "error");
      }
    } catch (e: any) {
      showFlash(e.message || "Failed to approve", "error");
    }
    setLoading(false);
  };

  // Filter items within the detail modal — per-field search
  const filteredDetailItems = useMemo(() => {
    let items = selectedList?.items || [];
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      items = items.filter((it: any) =>
        String(it[key] || "").toLowerCase().includes(val.toLowerCase())
      );
    }
    if (statusFilterDetail !== "all") {
      items = items.filter((it: any) => it.status === statusFilterDetail);
    }
    return items;
  }, [selectedList, colFilters, statusFilterDetail]);

  // Detail modal summary stats
  const detailStats = useMemo(() => {
    const items = selectedList?.items || [];
    const totalBoxes = new Set(items.map((i: any) => i.box_number)).size;
    const received = items.filter((i: any) => i.status === "received" || i.status === "completed").length;
    const pending = items.length - received;
    const locations = new Set(items.filter((i: any) => i.route_location).map((i: any) => i.route_location)).size;
    return { totalBoxes, received, pending, locations };
  }, [selectedList]);

  // Open detail modal and fetch full packing list details (incl. items)
  const openDetail = async (list: PackingList) => {
    setSelectedList({ ...list, items: [] });
    setColFilters({});
    setStatusFilterDetail("all");
    setDetailLoading(true);
    try {
      const res = await api.packingListGet(list.id);
      if (res.ok && res.data) {
        setSelectedList((prev) => ({
          ...(prev || list),
          ...res.data,
          items: res.data.items || [],
        }));
      } else {
        showFlash(res.error || "Failed to load details", "error");
      }
    } catch (e: any) {
      showFlash(e.message || "Failed to load details", "error");
    }
    setDetailLoading(false);
  };

  const filteredGRNs = useMemo(() => {
    const q = search.toLowerCase();
    return grnSessions.filter((s: any) => {
      const matchesSearch = !q ||
        (s.session_no || "").toLowerCase().includes(q) ||
        (s.purchase_receipt_no || "").toLowerCase().includes(q) ||
        (s.supplier_name || s.supplier || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || (s.status || "") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [grnSessions, search, statusFilter]);

  const grnPageItems = useMemo(() => {
    const start = (grnPage - 1) * PAGE_SIZE;
    return filteredGRNs.slice(start, start + PAGE_SIZE);
  }, [filteredGRNs, grnPage]);

  // Manual entry column definitions
  const manualCols: { key: keyof typeof emptyRow; label: string; placeholder: string; width?: number; type?: string }[] = [
    { key: "dealer_code", label: "Dealer Code", placeholder: "D001" },
    { key: "dealer_name", label: "Dealer", placeholder: "Dealer name" },
    { key: "branch", label: "Branch", placeholder: "Main" },
    { key: "invoice_no", label: "Invoice No", placeholder: "INV-0001" },
    { key: "invoice_date", label: "Invoice Date", placeholder: "YYYY-MM-DD" },
    { key: "delivery_no", label: "Delivery No", placeholder: "DEL-001" },
    { key: "delivery_date", label: "Delivery Date", placeholder: "YYYY-MM-DD" },
    { key: "plant", label: "Plant", placeholder: "P01" },
    { key: "box_no_from", label: "Box From", placeholder: "1" },
    { key: "box_no_to", label: "Box To", placeholder: "5" },
    { key: "part_code", label: "Part Code", placeholder: "SP-0001" },
    { key: "part_name", label: "Part Name", placeholder: "Part name" },
    { key: "qty", label: "Qty", placeholder: "10", type: "number" },
    { key: "unit_weight", label: "Weight (KG)", placeholder: "2.5", type: "number" },
    { key: "box_number", label: "Box Number", placeholder: "C0001" },
  ];

  // Detail modal column definitions
  const detailCols: { key: string; label: string }[] = [
    { key: "box_number", label: "Box Number" },
    { key: "part_code", label: "Part Code" },
    { key: "part_name", label: "Part Name" },
    { key: "expected_qty", label: "Expected" },
    { key: "scanned_qty", label: "Scanned" },
    { key: "status", label: "Status" },
    { key: "route_location", label: "Location" },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Page Head */}
      <div className="rw-page-head">
        <div style={{ flex: 1 }}>
          <div className="rw-page-title">📋 Receiving</div>
          <div className="rw-page-sub">Upload, manage, and approve packing lists for receiving</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="rw-btn rw-btn-primary"
            onClick={() => setShowUpload(true)}
          >
            + Upload Packing List
          </button>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`rw-flash ${flash.type}`}>
          {flash.type === "success" ? "✅" : flash.type === "error" ? "✕" : "⚠"} {flash.text}
        </div>
      )}
      {error && <div className="rw-flash error">✕ {error}</div>}

      {/* Upload Modal */}
      {showUpload && (
        <div className="rw-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="rw-modal" style={{ width: 720, maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="rw-modal-header">
              <div>
                <h2>📦 Add Packing List</h2>
                <div style={{ fontSize: 12, color: "var(--rw-text-dim)", marginTop: 4 }}>
                  Enter delivery details, then upload the Excel file (or download the sample format)
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="rw-btn rw-btn-secondary" onClick={downloadSample}>
                  ⬇ Sample Format
                </button>
                <button className="rw-modal-close" onClick={() => setShowUpload(false)}>✕</button>
              </div>
            </div>
            {/* Entry mode tabs */}
            <div style={{ display: "flex", gap: 4, padding: "12px 24px 0", borderBottom: "1px solid var(--border)" }}>
              {([["upload", "📄 Upload File"], ["manual", "✍️ Manual Entry"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className="rw-btn"
                  style={{
                    border: "none",
                    borderBottom: entryMode === mode ? "3px solid var(--accent)" : "3px solid transparent",
                    borderRadius: 0,
                    background: "transparent",
                    padding: "8px 16px",
                    fontWeight: entryMode === mode ? 600 : 400,
                    color: entryMode === mode ? "var(--accent)" : "var(--text-dim)",
                  }}
                  onClick={() => setEntryMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={entryMode === "upload" ? handleUpload : handleManualImport}>
              <div className="rw-modal-body">
                {/* Delivery details */}
                <div className="rw-section-title" style={{ marginBottom: 12 }}>🚚 Delivery Details</div>
                <div className="rw-form-grid">
                  <div className="rw-field" ref={supplierDropdownRef}>
                    <label className="rw-label">Supplier *</label>
                    <input
                      className="rw-input"
                      placeholder="Type to search supplier..."
                      value={supplierName}
                      onChange={(e) => { setSupplierName(e.target.value); setSupplierFilter(e.target.value); setShowSupplierDropdown(true); }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                      autoComplete="off"
                    />
                    {showSupplierDropdown && supplierSuggestions.length > 0 && (
                      <div className="rw-dropdown" style={{ maxHeight: 200, overflowY: "auto" }}>
                        {supplierSuggestions
                          .filter((s: any) => !supplierFilter || (s.name || "").toLowerCase().includes(supplierFilter.toLowerCase()))
                          .slice(0, 10)
                          .map((s: any) => (
                            <button
                              key={s.id}
                              className="rw-dropdown-item"
                              style={{ textAlign: "left", padding: "8px 12px" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSupplierName(s.name || "");
                                setShowSupplierDropdown(false);
                              }}
                            >
                              <div style={{ fontWeight: 500 }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "var(--rw-text-dim)" }}>{s.supplier_group || s.gstin || ""}</div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="rw-field">
                    <label className="rw-label">Arrival Time</label>
                    <input
                      className="rw-input"
                      type="datetime-local"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="rw-form-grid">
                  <div className="rw-field" ref={driverDropdownRef}>
                    <label className="rw-label">Driver Name</label>
                    <input
                      className="rw-input"
                      placeholder="Type to search driver..."
                      value={driverName}
                      onChange={(e) => { setDriverName(e.target.value); setDriverFilter(e.target.value); setShowDriverDropdown(true); loadTransports(e.target.value); }}
                      onFocus={() => { setShowDriverDropdown(true); loadTransports(driverFilter); }}
                      onBlur={() => setTimeout(() => setShowDriverDropdown(false), 200)}
                      autoComplete="off"
                    />
                    {showDriverDropdown && truckSuggestions.length > 0 && (
                      <div className="rw-dropdown" style={{ maxHeight: 200, overflowY: "auto" }}>
                        {truckSuggestions
                          .filter((t) => t.driver_name && (!driverFilter || t.driver_name.toLowerCase().includes(driverFilter.toLowerCase()) || t.driver_phone?.includes(driverFilter)))
                          .slice(0, 10)
                          .map((t, i) => (
                            <button
                              key={t.id || i}
                              className="rw-dropdown-item"
                              style={{ textAlign: "left", padding: "8px 12px" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectTransport(t);
                              }}
                            >
                              <div style={{ fontWeight: 500 }}>{t.driver_name}</div>
                              <div style={{ fontSize: 11, color: "var(--rw-text-dim)" }}>{t.driver_phone || ""} · {t.transporter || t.truck_no || ""}</div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="rw-field">
                    <label className="rw-label">Phone</label>
                    <input
                      className="rw-input"
                      placeholder="Auto-filled from driver"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="rw-form-grid" style={{ marginTop: 8 }}>
                  <div className="rw-field" ref={truckDropdownRef}>
                    <label className="rw-label">Truck / Transporter</label>
                    <input
                      className="rw-input"
                      placeholder="Type to search truck..."
                      value={transporter}
                      onChange={(e) => { setTransporter(e.target.value); setTruckFilter(e.target.value); setShowTruckDropdown(true); loadTransports(e.target.value); }}
                      onFocus={() => { setShowTruckDropdown(true); loadTransports(truckFilter); }}
                      onBlur={() => setTimeout(() => setShowTruckDropdown(false), 200)}
                      autoComplete="off"
                    />
                    {showTruckDropdown && truckSuggestions.length > 0 && (
                      <div className="rw-dropdown" style={{ maxHeight: 200, overflowY: "auto" }}>
                        {truckSuggestions
                          .filter((t) => !truckFilter || t.truck_no?.toLowerCase().includes(truckFilter.toLowerCase()) || t.transporter?.toLowerCase().includes(truckFilter.toLowerCase()) || t.name?.toLowerCase().includes(truckFilter.toLowerCase()))
                          .slice(0, 10)
                          .map((t, i) => (
                            <button
                              key={t.id || i}
                              className="rw-dropdown-item"
                              style={{ textAlign: "left", padding: "8px 12px" }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectTransport(t);
                              }}
                            >
                              <div style={{ fontWeight: 500 }}>{t.truck_no} {t.name ? `(${t.name})` : ""}</div>
                              <div style={{ fontSize: 11, color: "var(--rw-text-dim)" }}>{t.transporter || ""} · Driver: {t.driver_name || "None"}</div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ Upload mode ═══ */}
                {entryMode === "upload" && (
                  <>
                    <div className="rw-section-title" style={{ marginBottom: 12, marginTop: 20 }}>📄 Packing List File</div>
                    <div className="rw-field" style={{ marginBottom: 8 }}>
                      <div
                        className="rw-upload-drop"
                        style={{
                          border: "2px dashed var(--rw-accent, #3b82f6)",
                          borderRadius: 12,
                          padding: "24px 16px",
                          textAlign: "center",
                          cursor: "pointer",
                          background: packingFile ? "#f0fdf4" : "var(--panel)",
                        }}
                        onClick={() => document.getElementById("packing-file-input")?.click()}
                      >
                        <input
                          id="packing-file-input"
                          type="file"
                          accept=".xlsx"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                        />
                        {packingFile ? (
                          <div>
                            <div style={{ fontSize: 24 }}>📄</div>
                            <div className="font-medium" style={{ marginTop: 4 }}>{packingFile.name}</div>
                            <div style={{ fontSize: 12, color: "var(--rw-text-dim)", marginTop: 4 }}>
                              {(packingFile.size / 1024).toFixed(1)} KB — click to preview & review rows
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 24 }}>📁</div>
                            <div className="font-medium" style={{ marginTop: 4 }}>Click to upload .xlsx file</div>
                            <div style={{ fontSize: 12, color: "var(--rw-text-dim)", marginTop: 4 }}>
                              Columns: Dealer Code · Dealer · Branch · Invoice · Delivery · Plant · Box Range · Part Code · Part Name · Qty · Weight · Box Number — need <b style={{ color: "var(--accent)" }}>⬇ Sample Format</b>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══ Manual entry mode — 15 columns ═══ */}
                {entryMode === "manual" && (
                  <>
                    <div className="rw-section-title" style={{ marginBottom: 12, marginTop: 20 }}>📝 Packing List Details</div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="erpnext-table" style={{ width: "100%", minWidth: 1200 }}>
                        <thead>
                          <tr style={{ background: "var(--panel-2)" }}>
                            {manualCols.map((col) => (
                              <th key={col.key} style={{ width: col.width || 100 }}>{col.label}</th>
                            ))}
                            <th style={{ width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {manualRows.map((row, idx) => (
                            <tr key={idx}>
                              {manualCols.map((col) => (
                                <td key={col.key}>
                                  <input
                                    className="rw-input"
                                    style={{ padding: "4px 6px", fontSize: 13 }}
                                    placeholder={col.placeholder}
                                    type={col.type || "text"}
                                    min={col.type === "number" ? "0" : undefined}
                                    step={col.type === "number" ? "any" : undefined}
                                    value={(row as any)[col.key]}
                                    onChange={(e) => updateManualRow(idx, col.key, e.target.value)}
                                  />
                                </td>
                              ))}
                              <td>
                                <button
                                  type="button"
                                  className="rw-btn rw-btn-secondary"
                                  style={{ padding: "2px 8px", fontSize: 12 }}
                                  onClick={() => removeManualRow(idx)}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" className="rw-btn rw-btn-secondary" style={{ marginTop: 8 }} onClick={addManualRow}>
                      + Add Row
                    </button>
                  </>
                )}
              </div>
              <div className="rw-modal-footer">
                <button type="button" className="rw-btn rw-btn-secondary" onClick={() => setShowUpload(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rw-btn rw-btn-primary"
                  disabled={loading || (entryMode === "upload" && !packingFile)}
                  title={entryMode === "upload" && !packingFile ? "Select a file first" : ""}
                >
                  {loading ? "Importing..." : entryMode === "upload" ? "✅ Upload & Review" : "✅ Review & Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Preview Modal — 15 columns ═══ */}
      {showPreview && (
        <div className="rw-modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="rw-modal" style={{ width: 900, maxWidth: "95vw", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="rw-modal-header">
              <div>
                <h2>📋 Review Packing List Before Import</h2>
                <div style={{ fontSize: 13, color: "var(--rw-text-dim)", marginTop: 4 }}>
                  {packingFile?.name} — {parsedRows.length} rows parsed
                </div>
              </div>
              <button className="rw-modal-close" onClick={() => { setShowPreview(false); setParsedRows([]); setPackingFile(null); }}>✕</button>
            </div>

            {/* Summary Stats */}
            <div style={{ padding: "12px 24px", background: "var(--panel-2)", borderBottom: "1px solid var(--border)", display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Total Rows</span>
                <div className="font-bold text-lg">{parsedRows.length}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Selected</span>
                <div className="font-bold text-lg" style={{ color: "#28a745" }}>{parsedRows.filter((r) => r._selected).length}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Duplicates</span>
                <div className="font-bold text-lg" style={{ color: "#dc3545" }}>{parsedRows.filter((r) => r._duplicate).length}</div>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Empty/Skipped</span>
                <div className="font-bold text-lg" style={{ color: "#6c757d" }}>{parsedRows.filter((r) => r._empty).length}</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="rw-btn rw-btn-secondary text-xs"
                  onClick={() => setParsedRows((prev) => prev.map((r) => ({ ...r, _selected: true })))}
                >
                  Select All
                </button>
                <button
                  className="rw-btn rw-btn-secondary text-xs"
                  onClick={() => setParsedRows((prev) => prev.map((r) => ({ ...r, _selected: false })))}
                >
                  Deselect All
                </button>
                <button
                  className="rw-btn rw-btn-secondary text-xs"
                  onClick={() => setParsedRows((prev) => prev.map((r) => ({ ...r, _selected: r._duplicate ? false : true })))}
                >
                  Remove Duplicates
                </button>
              </div>
            </div>

            {/* Driver fields in preview */}
            <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label className="rw-label">Driver Name</label>
                <input className="rw-input" style={{ width: "100%" }} placeholder="Driver name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label className="rw-label">Phone</label>
                <input className="rw-input" style={{ width: "100%" }} placeholder="Phone" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label className="rw-label">Transporter</label>
                <input className="rw-input" style={{ width: "100%" }} placeholder="Transporter" value={transporter} onChange={(e) => setTransporter(e.target.value)} />
              </div>
            </div>

            {/* Rows Table — 15 columns */}
            <div style={{ overflow: "auto", maxHeight: 400, padding: "0 24px" }}>
              <table className="erpnext-table" style={{ width: "100%", minWidth: 1200 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr style={{ background: "var(--panel-2)" }}>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={parsedRows.filter((r) => !r._empty).length > 0 && parsedRows.filter((r) => !r._empty).every((r) => r._selected)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setParsedRows((prev) => prev.map((r) => r._empty ? r : { ...r, _selected: checked }));
                        }}
                      />
                    </th>
                    <th>Status</th>
                    <th>Dealer</th>
                    <th>Branch</th>
                    <th>Invoice</th>
                    <th>Inv Date</th>
                    <th>Delivery</th>
                    <th>Del Date</th>
                    <th>Plant</th>
                    <th>Box From</th>
                    <th>Box To</th>
                    <th>Part Code</th>
                    <th>Part Name</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Weight</th>
                    <th>Box No</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => (
                    <tr
                      key={row._index}
                      style={{
                        background: row._empty ? "#f8f8f8" : row._duplicate ? "#fff3cd" : row._selected ? "#d4edda" : "white",
                        opacity: row._empty ? 0.5 : 1,
                      }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={row._selected}
                          disabled={row._empty}
                          onChange={() => {
                            if (!row._empty) {
                              setParsedRows((prev) => prev.map((r) => r._index === row._index ? { ...r, _selected: !r._selected } : r));
                            }
                          }}
                        />
                      </td>
                      <td>
                        {row._empty ? (
                          <span className="erpnext-badge" style={{ background: "#6c757d", color: "white" }}>SKIP</span>
                        ) : row._duplicate ? (
                          <span className="erpnext-badge" style={{ background: "#ffc107", color: "#333" }}>DUP</span>
                        ) : (
                          <span className="erpnext-badge" style={{ background: "#28a745", color: "white" }}>OK</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{row.dealer_name || "—"}</td>
                      <td style={{ fontSize: 12 }}>{row.branch || "—"}</td>
                      <td className="font-medium">{row.invoice_no || "—"}</td>
                      <td style={{ fontSize: 12 }}>{row.invoice_date || "—"}</td>
                      <td style={{ fontSize: 12 }}>{row.delivery_no || "—"}</td>
                      <td style={{ fontSize: 12 }}>{row.delivery_date || "—"}</td>
                      <td>{row.plant || "—"}</td>
                      <td style={{ fontSize: 12 }}>{row.box_no_from || "—"}</td>
                      <td style={{ fontSize: 12 }}>{row.box_no_to || "—"}</td>
                      <td className="font-medium">{row.part_code || "—"}</td>
                      <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.part_name || "—"}</td>
                      <td style={{ textAlign: "right" }}>{row.qty || "—"}</td>
                      <td style={{ textAlign: "right", fontSize: 12 }}>{row.unit_weight || "—"}</td>
                      <td>{row.box_number || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="rw-modal-footer">
              <button className="rw-btn rw-btn-secondary" onClick={() => { setShowPreview(false); setParsedRows([]); setPackingFile(null); }}>
                Cancel
              </button>
              <button
                className="rw-btn rw-btn-primary"
                disabled={loading || parsedRows.filter((r) => r._selected).length === 0}
                onClick={(e) => {
                  setShowPreview(false);
                  handleUpload(e as any);
                }}
              >
                {loading ? "Importing..." : `✅ Import ${parsedRows.filter((r) => r._selected).length} Rows`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status filter + Search bar on top */}
      <div className="rw-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="rw-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setGrnPage(1); }}
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="ready_to_receive">Ready to Receive</option>
            <option value="receiving">Receiving</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
          </select>
          <input
            className="rw-input"
            placeholder="Search session, PO, supplier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setGrnPage(1); }}
            style={{ flex: 1, minWidth: 220 }}
          />
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>
            {filteredGRNs.length} sessions
          </span>
        </div>
      </div>
      {/* ═══ GRN Sessions Table ═══ */}
      <div className="rw-card">
        <div className="rw-section-title">GRN Sessions</div>
          {filteredGRNs.length === 0 ? (
            <div className="rw-empty-state">
              <div className="rw-empty-icon">🗂</div>
              <div className="rw-empty-title">No GRN sessions found</div>
              <div className="rw-empty-msg">{search ? "Try a different search" : "Sessions appear here once receiving starts"}</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="erpnext-table" style={{ width: "100%" }}>
                <thead>
                  <tr style={{ background: "var(--panel-2)" }}>
                    <th>Session</th>
                    <th>PO / Receipt</th>
                    <th>Supplier</th>
                    <th>Status</th>
                    <th>Boxes</th>
                    <th>Items</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grnPageItems.map((s: any) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer"
                      style={{ cursor: "pointer" }}
                      onClick={() => openDetail({ id: s.id, name: s.session_no, supplier_name: s.supplier_name || s.supplier || "", status: s.status, driver_name: s.driver_name || "", total_boxes: s.box_count || s.boxes_total || 0, total_items: s.item_count || 0, total_qty: 0, created_at: s.created_at, driver_phone: "", transporter: "", created_by: "", items: [] } as any)}
                    >
                      <td className="font-medium" style={{ color: "var(--accent)" }}>{s.session_no}</td>
                      <td>{s.purchase_receipt_no || "—"}</td>
                      <td>{s.supplier_name || s.supplier || "—"}</td>
                      <td>
                        <span className={`erpnext-badge ${
                          s.status === "completed" || s.status === "closed" ? "erpnext-badge-blue" :
                          s.status === "exception_pending" ? "erpnext-badge-red" :
                          "erpnext-badge-green"
                        }`}>
                          {(s.status || "open").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="text-right">{s.boxes_received ?? 0}/{s.box_count ?? s.boxes_total ?? 0}</td>
                      <td className="text-right">{s.items_scanned ?? 0}/{s.item_count ?? 0}</td>
                      <td>{formatDate(s.created_at)}</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openDetail({ id: s.id, name: s.session_no, supplier_name: s.supplier_name || s.supplier || "", status: s.status, driver_name: s.driver_name || "", total_boxes: s.box_count || s.boxes_total || 0, total_items: s.item_count || 0, total_qty: 0, created_at: s.created_at, driver_phone: "", transporter: "", created_by: "", items: [] } as any); }}
                            className="erpnext-btn-secondary text-xs"
                          >
                            View
                          </button>
                          {(s.status === "open" || s.status === "receiving") && (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/receiving?session_id=${s.id}`); }}
                              className="erpnext-btn-primary text-xs"
                            >
                              Open RF
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              {filteredGRNs.length > PAGE_SIZE && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 8px 4px" }}>
                  <span className="text-sm" style={{ color: "var(--text-dim)" }}>
                    Page {grnPage} of {Math.ceil(filteredGRNs.length / PAGE_SIZE)}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="rw-btn rw-btn-secondary"
                      disabled={grnPage === 1}
                      onClick={() => setGrnPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
                    </button>
                    <button
                      className="rw-btn rw-btn-secondary"
                      disabled={grnPage >= Math.ceil(filteredGRNs.length / PAGE_SIZE)}
                      onClick={() => setGrnPage((p) => Math.min(Math.ceil(filteredGRNs.length / PAGE_SIZE), p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Detail Modal — full rewrite with stats, per-field search, status filter */}
      {selectedList && (
        <div className="rw-modal-overlay" onClick={() => setSelectedList(null)}>
          <div className="rw-modal rw-modal-lg" style={{ maxWidth: "95vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="rw-modal-header">
              <div>
                <h2>{selectedList.name}</h2>
                <div style={{ fontSize: 12, color: "var(--rw-text-dim)", marginTop: 4 }}>
                  {selectedList.supplier_name} · {selectedList.driver_name || "No driver assigned"}
                </div>
              </div>
              <button className="rw-modal-close" onClick={() => setSelectedList(null)}>✕</button>
            </div>
            <div className="rw-modal-body">
              {/* Summary Stats */}
              <div className="rw-info-grid" style={{ marginBottom: 20 }}>
                <div className="rw-info-item">
                  <div className="rw-info-label">Status</div>
                  <div className="rw-info-value">
                    <span className={`erpnext-badge ${
                      selectedList.status === "draft" ? "erpnext-badge-yellow" :
                      selectedList.status === "pending_approval" ? "erpnext-badge-orange" :
                      selectedList.status === "ready_to_receive" ? "erpnext-badge-blue" :
                      "erpnext-badge-green"
                    }`}>
                      {selectedList.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Total Boxes</div>
                  <div className="rw-info-value">{detailStats.totalBoxes}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Received</div>
                  <div className="rw-info-value" style={{ color: "#28a745" }}>{detailStats.received}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Pending</div>
                  <div className="rw-info-value" style={{ color: "#dc3545" }}>{detailStats.pending}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Locations Used</div>
                  <div className="rw-info-value">{detailStats.locations}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Driver</div>
                  <div className="rw-info-value">{selectedList.driver_name || "-"}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Transporter</div>
                  <div className="rw-info-value">{selectedList.transporter || "-"}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Created</div>
                  <div className="rw-info-value">{formatDate(selectedList.created_at)}</div>
                </div>
              </div>

              {/* Items Table with per-column search */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div className="rw-section-title" style={{ marginBottom: 0 }}>Items</div>
                {!detailLoading && selectedList.items && selectedList.items.length > 0 && (
                  <span className="text-sm" style={{ color: "var(--text-dim)" }}>
                    {filteredDetailItems.length} of {selectedList.items.length}
                  </span>
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="erpnext-table" style={{ width: "100%", minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: "var(--panel-2)" }}>
                      <th style={{ width: 100 }}>Box Number</th>
                      <th style={{ width: 110 }}>Part Code</th>
                      <th>Part Name</th>
                      <th className="text-right" style={{ width: 80 }}>Expected</th>
                      <th className="text-right" style={{ width: 80 }}>Scanned</th>
                      <th style={{ width: 90 }}>Status</th>
                      <th style={{ width: 130 }}>Current Location</th>
                    </tr>
                    {!detailLoading && selectedList.items && selectedList.items.length > 0 && (
                      <tr style={{ background: "var(--bg-2, #f9fafb)" }}>
                        <th style={{ padding: "4px 6px" }}>
                          <input
                            className="rw-col-filter"
                            placeholder="Filter..."
                            value={colFilters.box_number || ""}
                            onChange={(e) => setColFilters((prev) => ({ ...prev, box_number: e.target.value }))}
                          />
                        </th>
                        <th style={{ padding: "4px 6px" }}>
                          <input
                            className="rw-col-filter"
                            placeholder="Filter..."
                            value={colFilters.part_code || ""}
                            onChange={(e) => setColFilters((prev) => ({ ...prev, part_code: e.target.value }))}
                          />
                        </th>
                        <th style={{ padding: "4px 6px" }}>
                          <input
                            className="rw-col-filter"
                            placeholder="Filter..."
                            value={colFilters.part_name || ""}
                            onChange={(e) => setColFilters((prev) => ({ ...prev, part_name: e.target.value }))}
                          />
                        </th>
                        <th style={{ padding: "4px 6px" }}>
                          <input
                            className="rw-col-filter"
                            placeholder="Filter..."
                            value={colFilters.expected_qty || ""}
                            onChange={(e) => setColFilters((prev) => ({ ...prev, expected_qty: e.target.value }))}
                          />
                        </th>
                        <th style={{ padding: "4px 6px" }}>
                          <input
                            className="rw-col-filter"
                            placeholder="Filter..."
                            value={colFilters.scanned_qty || ""}
                            onChange={(e) => setColFilters((prev) => ({ ...prev, scanned_qty: e.target.value }))}
                          />
                        </th>
                        <th style={{ padding: "4px 6px" }}>
                          <select
                            className="rw-col-filter-select"
                            value={statusFilterDetail}
                            onChange={(e) => setStatusFilterDetail(e.target.value)}
                          >
                            <option value="all">All</option>
                            <option value="pending">Pending</option>
                            <option value="received">Received</option>
                            <option value="completed">Completed</option>
                            <option value="exception">Exception</option>
                          </select>
                        </th>
                        <th style={{ padding: "4px 6px" }}>
                          <input
                            className="rw-col-filter"
                            placeholder="Filter..."
                            value={colFilters.route_location || ""}
                            onChange={(e) => setColFilters((prev) => ({ ...prev, route_location: e.target.value }))}
                          />
                        </th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filteredDetailItems.map((item: any) => (
                      <tr key={item.id}>
                        <td>{item.box_number}</td>
                        <td className="font-medium">{item.part_code}</td>
                        <td>{item.part_name}</td>
                        <td className="text-right">{item.expected_qty}</td>
                        <td className="text-right">{item.scanned_qty ?? 0}</td>
                        <td>
                          <span className={`erpnext-badge ${
                            item.status === "received" || item.status === "completed" ? "erpnext-badge-blue" :
                            item.status === "exception" ? "erpnext-badge-red" :
                            "erpnext-badge-green"
                          }`}>
                            {item.status || "pending"}
                          </span>
                        </td>
                        <td>{item.route_location || "-"}</td>
                      </tr>
                    ))}
                    {detailLoading && (
                      <tr>
                        <td colSpan={7} className="text-center py-8" style={{ color: "var(--text-dim)" }}>
                          Loading items...
                        </td>
                      </tr>
                    )}
                    {!detailLoading && (!selectedList.items || selectedList.items.length === 0) && (
                      <tr>
                        <td colSpan={7} className="text-center py-8" style={{ color: "var(--text-dim)" }}>
                          No items in this packing list
                        </td>
                      </tr>
                    )}
                    {!detailLoading && selectedList.items && selectedList.items.length > 0 && filteredDetailItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8" style={{ color: "var(--text-dim)" }}>
                          No items match current filters
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rw-modal-footer">
              {(selectedList.status === "draft" || selectedList.status === "pending_approval") && (
                <button
                  className="rw-btn rw-btn-primary"
                  onClick={() => handleApprove(selectedList.id)}
                  disabled={loading}
                >
                  Approve & Mark Ready to Receive
                </button>
              )}
              {(selectedList.status === "ready_to_receive" || selectedList.status === "receiving") && (
                <button
                  className="rw-btn rw-btn-primary"
                  onClick={() => navigate(`/receiving?packing_list_id=${selectedList.id}`)}
                >
                  Start Receiving
                </button>
              )}
              <button className="rw-btn rw-btn-secondary" onClick={() => setSelectedList(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
