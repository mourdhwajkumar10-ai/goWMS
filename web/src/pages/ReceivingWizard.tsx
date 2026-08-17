import React, { useEffect, useRef, useState } from "react";
import api from "../services/api";
import "../styles/receiving-wizard.css";

interface ImportSummary {
  total_rows: number;
  rows_imported: number;
  rows_skipped: number;
  unique_invoices: string[];
  unique_delivery_nos: string[];
  total_boxes: number;
  single_item_boxes: number;
  multi_item_boxes: number;
  total_unique_items: number;
  total_qty: number;
  dealer: string;
  plant: string;
}

interface BoxItem {
  part_code: string;
  part_name: string;
  expected_qty: number;
  scanned_qty: number;
  unit_weight_kg: number;
  status: string;
}

interface BoxInfo {
  id: number;
  box_number: string;
  box_type: string;
  status: string;
  item_count: number;
  is_single_item: boolean;
  total_qty: number;
  scanned_qty: number;
  items: BoxItem[];
}

interface ScanResult {
  box_number: string;
  auto_completed: boolean;
  message: string;
  timestamp: Date;
  status: "success" | "warning" | "error";
}

interface StatsData {
  session_id: number;
  delivery_no: string;
  total_boxes: number;
  boxes_received: number;
  single_item_boxes: number;
  multi_item_boxes: number;
  overall_progress_pct: number;
  total_items: number;
  items_full_match: number;
  items_shortage: number;
  items_excess: number;
  items_unknown: number;
  total_qty_expected: number;
  total_qty_scanned: number;
  exceptions_open: number;
  elapsed_time_sec: number;
  est_remaining_sec: number;
}

export default function ReceivingWizard() {
  const [step, setStep] = useState<"import" | "select" | "scan" | "complete">("import");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{ text: string; type: "success" | "warning" | "error" } | null>(null);

  // Import
  const [file, setFile] = useState<File | null>(null);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporter, setTransporter] = useState("");
  const [defaultRoute, setDefaultRoute] = useState("INCOMING-01");

  // Truck + Driver autocomplete (shared data from transports table)
  const [truckSuggestions, setTruckSuggestions] = useState<any[]>([]);
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const truckDropdownRef = useRef<HTMLDivElement>(null);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const driverDropdownRef = useRef<HTMLDivElement>(null);

  // Session
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionNo, setSessionNo] = useState("");
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  // Select
  const [invoices, setInvoices] = useState<any[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [selectedDN, setSelectedDN] = useState("");

  // Scan
  const [boxes, setBoxes] = useState<BoxInfo[]>([]);
  const [currentBox, setCurrentBox] = useState<BoxInfo | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  const playBeep = (freq = 800, duration = 0.15) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) { /* ignore */ }
  };

  const triggerVibrate = (pattern: number | number[] = 200) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  };

  // Fetch all trucks on mount (shared by both driver + truck fields)
  useEffect(() => {
    api.transportsList().then((r) => {
      if (r.ok) setTruckSuggestions(r.data || []);
    });
  }, []);

  // Close truck dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (truckDropdownRef.current && !truckDropdownRef.current.contains(e.target as Node)) {
        setShowTruckDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close driver dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(e.target as Node)) {
        setShowDriverDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (step === "scan" && scanInputRef.current) scanInputRef.current.focus();
  }, [step, currentBox]);

  useEffect(() => {
    let timer: any;
    if (step === "scan" && sessionId) {
      const fetchStats = () => api.receivingStats(sessionId).then((r) => { if (r.ok) setStats(r.data); });
      fetchStats();
      timer = setInterval(fetchStats, 10000);
    }
    return () => clearInterval(timer);
  }, [step, sessionId]);

  const showFlash = (text: string, type: "success" | "warning" | "error" = "success") => {
    setFlash({ text, type });
    if (type === "success") playBeep(800, 0.15);
    else if (type === "error") { playBeep(250, 0.4); triggerVibrate([100, 50, 100]); }
    else { playBeep(400, 0.25); triggerVibrate(150); }
    setTimeout(() => setFlash(null), 3000);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError("Please select a valid excel file."); return; }
    setLoading(true);
    setError("");
    const res = await api.receivingImport(file, driverName, driverPhone, transporter, defaultRoute);
    setLoading(false);
    if (!res.ok) { setError(res.error || "Failed to import packing list."); return; }
    const data = res.data;
    setSessionId(data.grn_session_id);
    setSessionNo(data.session_no);
    setImportSummary(data.import_summary);
    if (data.auto_skip) {
      setSelectedInvoice(data.auto_selected_invoice);
      setSelectedDN(data.auto_selected_dn);
      loadBoxes(data.grn_session_id, data.auto_selected_dn);
      setStep("scan");
      showFlash("Import successful — session auto-started.", "success");
    } else {
      loadSelectors(data.grn_session_id);
      setStep("select");
    }
  };

  const loadSelectors = async (sid: number) => {
    const invRes = await api.receivingInvoices(sid);
    if (invRes.ok) setInvoices(invRes.data);
  };

  const handleInvoiceChange = async (inv: string) => {
    setSelectedInvoice(inv);
    setSelectedDN("");
    if (sessionId) {
      const dnRes = await api.receivingDNs(sessionId, inv);
      if (dnRes.ok) setDeliveryNotes(dnRes.data);
    }
  };

  const loadBoxes = async (sid: number, dn: string) => {
    setLoading(true);
    try {
      const boxRes = await api.receivingBoxes(sid, dn);
      if (boxRes.ok) setBoxes(boxRes.data.boxes || []);
    } finally {
      setLoading(false);
    }
  };

  const startReceiving = () => {
    if (!selectedDN) { setError("Please select a delivery note."); return; }
    if (sessionId) { loadBoxes(sessionId, selectedDN); setStep("scan"); }
  };

  const detectScanType = (raw: string): "box" | "item" => {
    if (/^\d{10}-[CE]\d{4}$/.test(raw.trim())) return "box";
    return "item";
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = scanInput.trim();
    if (!raw) return;
    if (!sessionId) { showFlash("Session not loaded — try refreshing", "error"); return; }
    setScanInput("");
    const scanType = detectScanType(raw);
    if (currentBox) {
      if (scanType === "box") { showFlash(`Close current box before scanning another!`, "warning"); return; }
      handleItemScan(raw);
    } else {
      if (scanType === "item") { showFlash("Scan a Box barcode first.", "warning"); return; }
      handleBoxScan(raw);
    }
  };

  const handleBoxScan = async (boxNo: string) => {
    if (!sessionId) return;
    setLoading(true);
    let res;
    try {
      res = await api.receivingScanBox({ session_id: sessionId, box_number: boxNo, auto_complete_single: true, default_route: defaultRoute });
    } finally {
      setLoading(false);
    }
    if (!res.ok) { showFlash(res.error || "Failed to scan box.", "error"); return; }
    const data = res.data;
    if (data.auto_completed) {
      showFlash(data.message, "success");
      setScanHistory((prev) => [{ box_number: boxNo, auto_completed: true, message: data.message, timestamp: new Date(), status: "success" }, ...prev.slice(0, 9)]);
      if (selectedDN) loadBoxes(sessionId, selectedDN);
    } else {
      setCurrentBox({ id: data.box_index, box_number: data.box_number, box_type: data.box_type, status: "received", item_count: data.item_count, is_single_item: false, total_qty: 0, scanned_qty: 0, items: data.items });
      showFlash(data.message, "warning");
    }
  };

  const handleItemScan = async (qrRaw: string) => {
    if (!sessionId || !currentBox) return;
    const res = await api.receivingScanItem({ session_id: sessionId, box_number: currentBox.box_number, qr_raw: qrRaw });
    if (!res.ok) { showFlash(res.error || "Scan failed.", "error"); return; }
    const data = res.data;
    const match = data.match;
    const updatedItems = currentBox.items.map((it) => it.part_code === data.parsed.item_code ? { ...it, scanned_qty: match.scanned, status: match.status } : it);
    const isAllMatched = updatedItems.every((it) => it.scanned_qty === it.expected_qty);
    setCurrentBox((prev) => prev ? { ...prev, items: updatedItems } : null);
    showFlash(match.message, match.status === "excess" ? "warning" : "success");
    if (isAllMatched) completeMultiItemBox();
  };

  const completeMultiItemBox = async () => {
    if (!sessionId || !currentBox) return;
    setLoading(true);
    let res;
    try {
      res = await api.receivingCompleteBox({ session_id: sessionId, box_number: currentBox.box_number, default_route: defaultRoute });
    } finally {
      setLoading(false);
    }
    if (res.ok) {
      showFlash(`Box ${currentBox.box_number} verified.`, "success");
      setScanHistory((prev) => [{ box_number: currentBox.box_number, auto_completed: false, message: `Verified Box ${currentBox.box_number} (${currentBox.item_count} items)`, timestamp: new Date(), status: "success" }, ...prev.slice(0, 9)]);
      setCurrentBox(null);
      if (selectedDN) loadBoxes(sessionId, selectedDN);
    } else {
      showFlash(res.error || "Failed to verify box.", "error");
    }
  };

  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  const stepKeys: Array<"import" | "select" | "scan" | "complete"> = ["import", "select", "scan", "complete"];
  const stepIdx = stepKeys.indexOf(step);

  return (
    <div className="rec-container">
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            ⚡ Receiving Wizard
            {sessionNo && <span className="session-badge">{sessionNo}</span>}
          </h1>
          <p className="page-sub">Import packing list, scan boxes, verify items — RF gun style</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="rec-steps-bar">
        {["Import", "Select", "Scan", "Done"].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className={`rec-step-connector ${i <= stepIdx ? "completed" : ""}`} />}
            <div className={`rec-step-node ${i === stepIdx ? "active" : i < stepIdx ? "completed" : ""}`}>{i + 1}</div>
          </React.Fragment>
        ))}
      </div>

      {/* Flash */}
      {flash && <div className={`rec-flash ${flash.type}`}>{flash.type === "success" ? "✅" : flash.type === "error" ? "✕" : "⚠"} <span>{flash.text}</span></div>}
      {error && <div className="rec-flash error">✕ {error}</div>}

      {/* ─── Step 1: Import ─── */}
      {step === "import" && (
        <div className="erpnext-card p-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Import Packing List</h2>
          <form onSubmit={handleImport}>
            <div className="dropzone" style={{ marginBottom: 16 }}>
              <div className="dropzone-label">
                <span className="dropzone-icon">📥</span>
                <span style={{ fontWeight: 500 }}>{file ? file.name : "Drag & drop packing list (.xlsx) or click to select"}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Supports .xlsx</span>
              </div>
              <input type="file" className="file-input" accept=".xlsx" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
            </div>

            <div className="rec-container form-grid">
              {/* Driver Name — searches transports table by driver_name */}
              <div className="form-field" style={{ position: "relative" }} ref={driverDropdownRef}>
                <label>Driver Name</label>
                <input
                  className="form-input"
                  placeholder="Type driver name…"
                  value={driverName}
                  onChange={(e) => {
                    setDriverName(e.target.value);
                    setShowDriverDropdown(true);
                  }}
                  onFocus={() => setShowDriverDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDriverDropdown(false), 150)}
                  autoComplete="off"
                />
                {showDriverDropdown && (
                  <div className="rec-driver-dropdown">
                    {(() => {
                      const q = driverName.trim().toLowerCase();
                      const matches = q
                        ? truckSuggestions.filter((t) => t.driver_name && t.driver_name.toLowerCase().includes(q))
                        : truckSuggestions.filter((t) => t.driver_name);
                      if (matches.length === 0) return null;
                      return matches.slice(0, 8).map((t, i) => (
                        <button
                          key={t.id ?? i}
                          type="button"
                          className="rec-driver-option"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setDriverName(t.driver_name || "");
                            setDriverPhone(t.driver_phone || "");
                            setTransporter(t.transporter || t.truck_no || "");
                            setShowDriverDropdown(false);
                          }}
                        >
                          <span className="rec-driver-name">{t.driver_name}</span>
                          <span className="rec-driver-meta">
                            {t.driver_phone && <span>{t.driver_phone}</span>}
                            {t.truck_no && <span>· {t.truck_no}</span>}
                            {t.transporter && <span>· {t.transporter}</span>}
                          </span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Driver Phone — auto-filled from driver selection */}
              <div className="form-field">
                <label>Driver Phone</label>
                <input className="form-input" placeholder="Auto-filled from driver" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
              </div>

              {/* Truck / Transporter — searches transports table by truck_no */}
              <div className="form-field" style={{ gridColumn: "span 2", position: "relative" }} ref={truckDropdownRef}>
                <label>Truck / Transporter</label>
                <input
                  className="form-input"
                  placeholder="Type truck no or transporter…"
                  value={transporter}
                  onChange={(e) => {
                    setTransporter(e.target.value);
                    setShowTruckDropdown(true);
                  }}
                  onFocus={() => setShowTruckDropdown(true)}
                  onBlur={() => {
                    // Auto-populate driver fields from matching truck on tab away
                    const q = transporter.trim().toLowerCase();
                    if (q) {
                      const match = truckSuggestions.find(
                        (t) => t.truck_no.toLowerCase() === q || (t.transporter && t.transporter.toLowerCase() === q)
                      );
                      if (match) {
                        if (match.driver_name) setDriverName(match.driver_name);
                        if (match.driver_phone) setDriverPhone(match.driver_phone);
                      }
                    }
                    setTimeout(() => setShowTruckDropdown(false), 150);
                  }}
                  autoComplete="off"
                />
                {showTruckDropdown && (
                  <div className="rec-driver-dropdown">
                    {(() => {
                      const q = transporter.trim().toLowerCase();
                      const matches = q
                        ? truckSuggestions.filter((t) =>
                            t.truck_no.toLowerCase().includes(q) ||
                            (t.transporter && t.transporter.toLowerCase().includes(q)) ||
                            (t.name && t.name.toLowerCase().includes(q))
                          )
                        : truckSuggestions;
                      if (matches.length === 0) return null;
                      return matches.slice(0, 10).map((t, i) => (
                        <button
                          key={t.id ?? i}
                          type="button"
                          className="rec-driver-option"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setTransporter(t.transporter || t.truck_no || "");
                            if (t.driver_name) setDriverName(t.driver_name);
                            if (t.driver_phone) setDriverPhone(t.driver_phone);
                            setShowTruckDropdown(false);
                          }}
                        >
                          <span className="rec-driver-name">{t.truck_no}</span>
                          <span className="rec-driver-meta">
                            {t.name && <span>{t.name}</span>}
                            {t.transporter && <span>· {t.transporter}</span>}
                            {t.driver_name && <span>· {t.driver_name}</span>}
                          </span>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Default Route */}
              <div className="form-field">
                <label>Default Putaway Route</label>
                <select className="form-input" value={defaultRoute} onChange={(e) => setDefaultRoute(e.target.value)}>
                  <option value="INCOMING-01">INCOMING-01</option>
                  <option value="QUALITY_INSPECTION-01">QUALITY INSPECTION-01</option>
                  <option value="REJECT-01">REJECT-01</option>
                </select>
              </div>
            </div>

            {importSummary && (
              <div style={{ marginBottom: 16, padding: 12, background: "var(--gray-50)", borderRadius: 6, border: "1px solid var(--gray-200)", fontSize: 13, color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text-color)" }}>Last import:</strong>{" "}
                {importSummary.rows_imported} rows · {importSummary.total_boxes} boxes · {importSummary.total_qty} pcs · {importSummary.dealer}
              </div>
            )}

            <div className="rec-btn-group">
              <button type="submit" className="rec-btn rec-btn-primary" disabled={loading || !file}>
                {loading ? "Importing…" : "📤 Import & Start Receiving"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Step 2: Select Invoice / DN ─── */}
      {step === "select" && (
        <div className="erpnext-card p-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Filter Inbound Shipments</h2>
          <div className="rec-container form-grid" style={{ marginBottom: 16 }}>
            <div className="form-field">
              <label>Invoice Number</label>
              <select className="form-input" value={selectedInvoice} onChange={(e) => handleInvoiceChange(e.target.value)}>
                <option value="">— Choose Invoice —</option>
                {invoices.map((inv) => (
                  <option key={inv.invoice_no} value={inv.invoice_no}>{inv.invoice_no} ({inv.box_count} boxes · {inv.total_qty} pcs)</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Delivery Note (DN)</label>
              <select className="form-input" value={selectedDN} onChange={(e) => setSelectedDN(e.target.value)} disabled={!selectedInvoice}>
                <option value="">— Choose DN —</option>
                {deliveryNotes.map((dn) => (
                  <option key={dn.delivery_no} value={dn.delivery_no}>{dn.delivery_no} · {dn.box_count} boxes</option>
                ))}
              </select>
            </div>
          </div>
          <div className="rec-btn-group">
            <button className="rec-btn rec-btn-secondary" onClick={() => setStep("import")}>← Back</button>
            <button className="rec-btn rec-btn-primary" onClick={startReceiving} disabled={!selectedDN}>▶ Start Receiving →</button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Scan ─── */}
      {step === "scan" && (
        <div className="scan-layout">
          {/* Progress */}
          <div className="erpnext-card p-4">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 13, color: "var(--text-muted)" }}>
              <span>DN: <strong style={{ color: "var(--text-color)" }}>{selectedDN}</strong></span>
              <span>{stats ? `${stats.boxes_received} / ${stats.total_boxes} boxes received` : "Loading…"}</span>
            </div>
            <div className="rec-progress-wrap">
              <div className="rec-progress-container">
                <div className="rec-progress-bar" style={{ width: `${stats ? stats.overall_progress_pct : 0}%` }} />
              </div>
              <span className="rec-progress-label">{stats ? `${stats.overall_progress_pct}%` : ""}</span>
            </div>
          </div>

          {/* Scanner input */}
          <div className="erpnext-card p-4">
            <label className="erpnext-label" style={{ marginBottom: 6 }}>
              {currentBox ? `Scanning items — Box ${currentBox.box_number}` : "Scan Box Barcode"}
            </label>
            <form onSubmit={handleScanSubmit}>
              <div className="scan-input-wrapper">
                <input type="text" className="scan-input" ref={scanInputRef} value={scanInput} onChange={(e) => setScanInput(e.target.value)}
                  placeholder={currentBox ? "Scan item QR code…" : "Scan Box Barcode…"} />
                <button type="submit" className="rec-btn rec-btn-primary" style={{ height: 28, padding: "2px 12px", flexShrink: 0 }}>Enter</button>
              </div>
            </form>
          </div>

          {/* Multi-item panel */}
          {currentBox && (
            <div className="inline-multi-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>📦 Box {currentBox.box_number}</h3>
                <span className={`badge ${currentBox.items.every((it) => it.scanned_qty === it.expected_qty) ? "full_match" : "pending"}`}>
                  {currentBox.items.filter((it) => it.scanned_qty === it.expected_qty).length} / {currentBox.items.length} matched
                </span>
              </div>
              <div>
                {currentBox.items.map((it) => (
                  <div key={it.part_code} className={`item-list-row ${it.scanned_qty === it.expected_qty ? "verified" : ""}`}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 550, fontSize: 13 }}>{it.part_code}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{it.part_name}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{it.scanned_qty} / {it.expected_qty}</span>
                      <span className={`item-badge ${it.status}`}>{it.status === "full_match" ? "✓ done" : it.status === "shortage" ? "⏳ short" : it.status === "excess" ? "⚠ excess" : "pending"}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rec-btn-group" style={{ marginTop: 16 }}>
                <button className="rec-btn rec-btn-secondary" onClick={() => setCurrentBox(null)}>✕ Close Box</button>
                <button className="rec-btn rec-btn-primary" onClick={completeMultiItemBox}>✓ Complete Box</button>
              </div>
            </div>
          )}

          {/* Scan history */}
          <div className="erpnext-card p-4">
            <h3 style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", marginBottom: 8 }}>Scan Activity</h3>
            {scanHistory.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 13 }}>No scans yet — scan a box to begin.</div>
            ) : (
              <div className="feed-container">
                {scanHistory.map((h, i) => (
                  <div key={i} className="feed-item">
                    <span style={{ fontWeight: 500 }}>{h.box_number}</span>
                    <span style={{ flex: 1, marginLeft: 8, fontSize: 13 }}>{h.message}</span>
                    <span className="feed-time">{h.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="rec-btn-group">
            <button className="rec-btn rec-btn-secondary" onClick={() => setStep("select")}>← Back</button>
            <button className="rec-btn rec-btn-primary" onClick={() => setStep("complete")}>✓ Done — Complete Session</button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Complete ─── */}
      {step === "complete" && (
        <div className="erpnext-card p-4">
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--dark-green-600)", marginBottom: 16 }}>✅ Delivery Receiving Complete</h2>

          <div className="rec-summary-grid" style={{ marginBottom: 20 }}>
            <div className="rec-summary-item">
              <span className="rec-summary-value">{stats ? stats.boxes_received : 0}</span>
              <span className="rec-summary-label">Boxes Received</span>
            </div>
            <div className="rec-summary-item">
              <span className="rec-summary-value">{stats ? stats.total_qty_scanned : 0}</span>
              <span className="rec-summary-label">Total Qty Scanned</span>
            </div>
            <div className="rec-summary-item">
              <span className="rec-summary-value">{stats ? stats.items_full_match : 0}</span>
              <span className="rec-summary-label">Full Match Items</span>
            </div>
            <div className="rec-summary-item">
              <span className="rec-summary-value">{stats ? formatDuration(stats.elapsed_time_sec) : "0m"}</span>
              <span className="rec-summary-label">Elapsed Time</span>
            </div>
          </div>

          {stats && stats.exceptions_open > 0 && (
            <div className="rec-flash warning" style={{ marginBottom: 16 }}>⚠ {stats.exceptions_open} open exceptions — supervisor review needed.</div>
          )}

          <div style={{ marginBottom: 12, fontSize: 13, color: "var(--text-muted)" }}>
            Delivery Note: <strong style={{ color: "var(--text-color)" }}>{selectedDN}</strong>
            {" · "}
            Single-item boxes (auto): <strong>{stats ? stats.single_item_boxes : 0}</strong>
            {" · "}
            Multi-item boxes (manual): <strong>{stats ? stats.multi_item_boxes : 0}</strong>
          </div>

          <div className="rec-btn-group">
            <a href="/grn" className="rec-btn rec-btn-primary" style={{ textDecoration: "none" }}>→ View GRN Page</a>
            <button className="rec-btn rec-btn-secondary" onClick={() => {
              setStep("import"); setSessionId(null); setSessionNo(""); setStats(null); setScanHistory([]); setFile(null);
            }}>→ Start New Inbound</button>
          </div>
        </div>
      )}
    </div>
  );
}
