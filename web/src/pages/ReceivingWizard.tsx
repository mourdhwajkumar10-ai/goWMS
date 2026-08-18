import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import ScannerInput from "../components/ScannerInput";
import "../styles/receiving-wizard.css";

/* ─── Types ─── */

interface POInfo {
  id: number;
  name: string;
  supplier_name: string;
  status: string;
  grand_total: number;
  schedule_date: string;
  item_count: number;
  total_qty: number;
  received_qty: number;
  open_sessions: number;
  resume_session_id?: number | null;
}

interface BoxItem {
  part_code: string;
  part_name: string;
  expected_qty: number;
  scanned_qty: number;
  status: string;
  requires_qi?: boolean;
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
  session_no?: string;
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

/* ─── Helpers ─── */

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

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

type Step = "select_po" | "scan_box" | "scan_items" | "complete";

const STEP_LABELS = ["Select PO", "Scan Box", "Scan Items", "Done"];
const STEP_KEYS: Step[] = ["select_po", "scan_box", "scan_items", "complete"];

/* ─── Component ─── */

export default function ReceivingWizard() {
  const [searchParams] = useSearchParams();
  const resumeSessionId = searchParams.get("session_id");
  const packingListId = searchParams.get("packing_list_id");

  const [step, setStep] = useState<Step>(resumeSessionId ? "scan_box" : "select_po");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<{ id: number; text: string; type: string }[]>([]);

  // PO selection
  const [pendingPOs, setPendingPOs] = useState<POInfo[]>([]);
  const [selectedPO, setSelectedPO] = useState<POInfo | null>(null);

  // Packing list from management page
  const [packingList, setPackingList] = useState<any>(null);

  // Session
  const [sessionId, setSessionId] = useState<number | null>(resumeSessionId ? Number(resumeSessionId) : null);
  const [sessionNo, setSessionNo] = useState<string | null>(null);

  const defaultRoute = "INCOMING-01";

  // Scan state
  const [currentBox, setCurrentBox] = useState<{ box_number: string; items: BoxItem[] } | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [suggestedBoxes, setSuggestedBoxes] = useState<any[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ─── Load POs on mount ───
  useEffect(() => {
    api.receivingPendingPOs().then((r) => {
      if (r.ok) setPendingPOs((r.data || []).slice(0, 5));
    });
  }, []);

  // Resume session from query param
  useEffect(() => {
    if (resumeSessionId) {
      api.receivingStats(Number(resumeSessionId)).then((r) => {
        if (r.ok) {
          setStats(r.data);
          setSessionId(Number(resumeSessionId));
          if (r.data.session_no) setSessionNo(r.data.session_no);
          setStep("scan_box");
        }
      });
    }
  }, [resumeSessionId]);

  // Load packing list from management page
  useEffect(() => {
    if (packingListId) {
      setLoading(true);
      api.packingListGet(Number(packingListId)).then((r) => {
        if (r.ok && r.data) {
          setPackingList(r.data);
          showFlash(`Loaded packing list: ${r.data.name}`, "success");
        }
        setLoading(false);
      });
    }
  }, [packingListId]);

  // Auto-focus scan input
  useEffect(() => {
    if ((step === "scan_box" || step === "scan_items") && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [step, currentBox]);

  // Poll stats while scanning
  useEffect(() => {
    let timer: any;
    if ((step === "scan_box" || step === "scan_items") && sessionId) {
      const fetchStats = () => api.receivingStats(sessionId).then((r) => { if (r.ok) setStats(r.data); });
      fetchStats();
      timer = setInterval(fetchStats, 10000);
    }
    return () => clearInterval(timer);
  }, [step, sessionId]);

  // Poll exceptions while scanning
  useEffect(() => {
    let timer: any;
    if ((step === "scan_box" || step === "scan_items") && sessionId) {
      const fetchExceptions = () => api.receivingExceptions(sessionId).then((r) => { if (r.ok) setExceptions(r.data || []); });
      fetchExceptions();
      timer = setInterval(fetchExceptions, 15000);
    }
    return () => clearInterval(timer);
  }, [step, sessionId]);

  // Fetch suggested boxes to scan
  useEffect(() => {
    if (sessionId && step === "scan_box") {
      const fetchBoxes = async () => {
        const res = await api.receivingBoxes(sessionId);
        if (res.ok && res.data?.boxes) {
          // Filter unscanned boxes and show top 3 suggestions
          const unscanned = res.data.boxes.filter((b: any) => b.status !== "verified" && b.status !== "received");
          setSuggestedBoxes(unscanned.slice(0, 3));
        }
      };
      fetchBoxes();
      const timer = setInterval(fetchBoxes, 10000);
      return () => clearInterval(timer);
    }
  }, [sessionId, step]);

  const showFlash = (text: string, type: "success" | "warning" | "error" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, text, type }]);
    if (type === "success") playBeep(800, 0.15);
    else if (type === "error") { playBeep(250, 0.4); triggerVibrate([100, 50, 100]); }
    else { playBeep(400, 0.25); triggerVibrate(150); }
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  // ─── Step 1: Select PO or Upload Packing List ───

  const handleSelectPO = async (po: POInfo) => {
    setSelectedPO(po);
    // If the PO already has an open GRN session, resume it — the import call also
    // backfills expected boxes from PO items if the session has none yet
    const existingSessionId = po.resume_session_id ?? undefined;
    setLoading(true);
    try {
      const res = await api.receivingImport(
        new File([""], "placeholder.xlsx", { type: "application/octet-stream" }),
        "", "", "", defaultRoute, existingSessionId, po.name, po.supplier_name
      );
      setLoading(false);
      if (!res.ok) { setError(res.error || "Failed to create session"); return; }
      setSessionId(res.data.grn_session_id);
      if (res.data.session_no) setSessionNo(res.data.session_no);
      // Refresh stats so progress + suggested boxes reflect the (possibly backfilled) session
      const statsRes = await api.receivingStats(res.data.grn_session_id);
      if (statsRes.ok) { setStats(statsRes.data); if (statsRes.data.session_no) setSessionNo(statsRes.data.session_no); }
      setStep("scan_box");
      if (existingSessionId) {
        const summary = res.data.import_summary;
        showFlash(
          summary && summary.total_boxes > 0
            ? `${res.data.session_no} ready — ${summary.total_boxes} boxes to scan`
            : `Resumed ${po.name} — continue scanning boxes`,
          "success"
        );
      } else {
        showFlash(`Session ${res.data.session_no} started — scan boxes`, "success");
      }
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Failed to create session");
    }
  };

  const handleStartFromPackingList = async () => {
    if (!packingList) return;
    setLoading(true);
    try {
      // Create a session from the packing list
      const res = await api.packingListApprove(packingList.id);
      setLoading(false);
      if (!res.ok) { setError(res.error || "Failed to start receiving"); return; }
      // Navigate to scan mode
      setStep("scan_box");
      showFlash(`Receiving started for ${packingList.name} — scan boxes`, "success");
    } catch (e: any) {
      setLoading(false);
      setError(e.message || "Failed to start receiving");
    }
  };



  // ─── Step 2: Scan Box ───

  // Refresh progress bar + suggested boxes right after a successful scan,
  // so the UI updates immediately instead of waiting for the 10s poll.
  const refreshProgress = async () => {
    if (!sessionId) return;
    api.receivingStats(sessionId).then((r) => { if (r.ok) setStats(r.data); });
    const res = await api.receivingBoxes(sessionId);
    if (res.ok && res.data?.boxes) {
      const unscanned = res.data.boxes.filter((b: any) => b.status !== "verified" && b.status !== "received");
      setSuggestedBoxes(unscanned.slice(0, 3));
    }
  };

  // explicitBox lets callers (suggestion buttons, camera scan, dropdown) submit a
  // box number directly — setScanInput is async, so reading scanInput right after
  // setScanInput would submit the stale previous value.
  const handleBoxScanSubmit = async (e: React.FormEvent, explicitBox?: string) => {
    e.preventDefault();
    const raw = (explicitBox !== undefined ? explicitBox : scanInput).trim();
    if (!raw || !sessionId) return;
    setScanInput("");
    setLoading(true);
    try {
      const res = await api.receivingScanBox({
        session_id: sessionId,
        box_number: raw,
        auto_complete_single: true,
        default_route: defaultRoute,
      });
      setLoading(false);
      if (!res.ok) { showFlash(res.error || "Box not found", "error"); return; }
      const data = res.data;
      if (data.auto_completed) {
        showFlash(data.message, "success");
        setScanHistory((prev) => [{ box_number: raw, auto_completed: true, message: data.message, timestamp: new Date(), status: "success" }, ...prev.slice(0, 9)]);
      } else {
        setCurrentBox({ box_number: data.box_number, items: data.items || [] });
        setStep("scan_items");
        showFlash(data.message, "warning");
      }
      refreshProgress();
    } catch (e: any) {
      setLoading(false);
      showFlash(e.message || "Scan failed", "error");
    }
  };

  // ─── Step 3: Scan Items ───

  const handleItemScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = scanInput.trim();
    if (!raw || !sessionId || !currentBox) return;
    setScanInput("");
    setLoading(true);
    try {
      const res = await api.receivingScanItem({
        session_id: sessionId,
        box_number: currentBox.box_number,
        qr_raw: raw,
      });
      setLoading(false);
      if (!res.ok) { showFlash(res.error || "Item not in this box", "error"); return; }
      const data = res.data;
      const match = data.match;
      const updatedItems = currentBox.items.map((it) =>
        it.part_code === data.parsed.item_code
          ? { ...it, scanned_qty: match.scanned, status: match.status }
          : it
      );
      setCurrentBox({ ...currentBox, items: updatedItems });
      showFlash(match.message, match.status === "excess" ? "warning" : "success");

      const isAllMatched = updatedItems.every((it) => it.scanned_qty === it.expected_qty);
      if (isAllMatched) {
        await completeBox();
      }
    } catch (e: any) {
      setLoading(false);
      showFlash(e.message || "Scan failed", "error");
    }
  };

  const completeBox = async () => {
    if (!sessionId || !currentBox) return;
    setLoading(true);
    try {
      const res = await api.receivingCompleteBox({
        session_id: sessionId,
        box_number: currentBox.box_number,
        default_route: defaultRoute,
      });
      setLoading(false);
      if (res.ok) {
        const route = res.data.box_route || defaultRoute;
        setLastRoute(route);
        showFlash(`✅ Box ${currentBox.box_number} verified → ${route}`, "success");
        setScanHistory((prev) => [
          { box_number: currentBox.box_number, auto_completed: false, message: `Verified → ${route}`, timestamp: new Date(), status: "success" },
          ...prev.slice(0, 9),
        ]);
        setCurrentBox(null);
        setStep("scan_box");
        refreshProgress();
      } else {
        showFlash(res.error || "Failed to verify box", "error");
      }
    } catch (e: any) {
      setLoading(false);
      showFlash(e.message || "Failed", "error");
    }
  };

  const stepIdx = STEP_KEYS.indexOf(step);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* ─── Page Head ─── */}
      <div className="rw-page-head">
        <div>
          <div className="rw-page-title">
            ⚡ Receiving Wizard
            {sessionNo && <span className="rw-status-badge rw-suggested">{sessionNo}</span>}
            {selectedPO && <span className="rw-status-badge" style={{ background: "var(--panel-2)", color: "var(--text-dim)" }}>{selectedPO.name}</span>}
            {packingList && <span className="rw-status-badge rw-suggested">{packingList.name}</span>}
          </div>
          <div className="rw-page-sub">
            {packingList 
              ? `Receiving from: ${packingList.name} (${packingList.supplier_name})`
              : sessionNo 
                ? `${sessionNo} · ${selectedPO?.name || ""}`
                : "Select PO → scan boxes → verify items → route"
            }
          </div>
        </div>
      </div>

      {/* ─── Step Indicator Bar ─── */}
      <div className="rw-steps-bar">
        {STEP_LABELS.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className={`rw-step-connector ${i <= stepIdx ? "done" : ""}`} />}
            <div className={`rw-step-node ${i === stepIdx ? "active" : i < stepIdx ? "done" : ""}`}>{i < stepIdx ? "✓" : i + 1}</div>
            <div className="rw-step-label">{label}</div>
          </React.Fragment>
        ))}
      </div>

      {/* ─── Toast notifications ─── */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`rw-toast rw-toast-${t.type}`}>
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "⚠"} {t.text}
          </div>
        ))}
      </div>
      {error && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000 }}><div className="rw-toast rw-toast-error">✕ {error}</div></div>}

      {/* ═══ Step 1: Select PO or Upload Packing List ═══ */}
      {step === "select_po" && (
        <div className="rw-content">
          {/* Packing list info if loaded from management page */}
          {packingList && (
            <div className="rw-card" style={{ border: "2px solid var(--rw-accent)" }}>
              <div className="rw-section-title">📦 Packing List Loaded</div>
              <div className="rw-info-grid" style={{ marginBottom: 12 }}>
                <div className="rw-info-item">
                  <div className="rw-info-label">Name</div>
                  <div className="rw-info-value">{packingList.name}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Supplier</div>
                  <div className="rw-info-value">{packingList.supplier_name}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Total Boxes</div>
                  <div className="rw-info-value">{packingList.total_boxes}</div>
                </div>
                <div className="rw-info-item">
                  <div className="rw-info-label">Total Items</div>
                  <div className="rw-info-value">{packingList.total_items}</div>
                </div>
              </div>
              <button
                className="rw-btn rw-btn-primary"
                onClick={handleStartFromPackingList}
                disabled={loading}
                style={{ width: "100%" }}
              >
                {loading ? "Starting..." : "Start Receiving"}
              </button>
            </div>
          )}

          {/* PO selection mode */}
          <div className="rw-card">
            <div className="rw-section-title">Select a PO to receive</div>
              {pendingPOs.length === 0 ? (
                <div className="rw-empty-state">
                  <div className="rw-empty-icon">📦</div>
                  <div className="rw-empty-title">No pending purchase orders</div>
                  <div className="rw-empty-msg">Create POs in your ERP to start receiving</div>
                </div>
              ) : (
                <div>
                  {pendingPOs.map((po) => (
                    <div key={po.id} className="rw-queue-item" onClick={() => handleSelectPO(po)} style={{ cursor: "pointer" }}>
                      <div className="rw-queue-item-info">
                        <div className="rw-queue-item-code">{po.name}</div>
                        <div className="rw-queue-item-name">{po.supplier_name}</div>
                        <div className="rw-queue-item-qty">
                          {po.item_count} items · {po.total_qty} units
                          {po.schedule_date && <> · {new Date(po.schedule_date).toLocaleDateString()}</>}
                        </div>
                      </div>
                      <div className="rw-queue-item-actions">
                        {po.open_sessions > 0 ? (
                          <span className="rw-status-badge rw-picked">Resume</span>
                        ) : (
                          <span className="rw-status-badge rw-suggested">Start</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {/* ═══ Step 2: Scan Box ═══ */}
      {step === "scan_box" && (
        <div className="rw-content">
          {/* Progress */}
          {stats && (
            <div className="rw-putaway-progress">
              <div className="rw-progress-text">{stats.boxes_received} / {stats.total_boxes} boxes</div>
              <div className="rw-progress-bar">
                <div className="rw-progress-fill" style={{ width: `${stats.overall_progress_pct}%` }} />
              </div>
              <div className="rw-progress-pct">{stats.overall_progress_pct}%</div>
            </div>
          )}

          {/* Suggested boxes to scan */}
          {suggestedBoxes.length > 0 && (
            <div className="rw-card" style={{ marginBottom: 16, border: "2px solid var(--accent)" }}>
              <div className="rw-section-title" style={{ marginBottom: 12 }}>🎯 Suggested Boxes — Tap to Scan</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {suggestedBoxes.map((box: any, i: number) => (
                  <button
                    key={box.id || box.box_number || box.carton_no}
                    className="rw-btn"
                    style={{
                      flex: "1 1 150px",
                      padding: "16px",
                      border: "2px solid var(--accent)",
                      borderRadius: 12,
                      background: "var(--panel)",
                      textAlign: "center",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      const boxNo = box.box_number || box.carton_no;
                      setScanInput(boxNo);
                      // Auto-submit the box scan with the explicit number
                      handleBoxScanSubmit({ preventDefault: () => {} } as any, boxNo);
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📦</div>
                    <div className="font-bold text-lg">{box.box_number || box.carton_no}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
                      {box.item_count || 0} items · {box.is_single_item ? "Single" : "Multi"}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span className="rw-btn rw-btn-primary" style={{ fontSize: 12, padding: "4px 12px" }}>
                        📷 Scan Now
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scan input with camera */}
          <div className="rw-scan-section">
            <div className="rw-scan-section-title">📦 Enter or scan box number</div>
            <ScannerInput
              onScan={(code) => {
                setScanInput(code);
                // Auto-submit immediately with the scanned value
                if (sessionId) {
                  handleBoxScanSubmit({ preventDefault: () => {} } as any, code);
                }
              }}
              placeholder="Box number (type or scan QR/barcode)"
              autoFocus={true}
              showTorch={true}
              suggestions={suggestedBoxes.map((b: any) => ({
                code: b.box_number || b.carton_no,
                name: `${b.item_count || 0} items`,
                qty: b.total_qty,
              }))}
              onSelectSuggestion={(code) => {
                setScanInput(code);
                handleBoxScanSubmit({ preventDefault: () => {} } as any, code);
              }}
            />
            <div className="rw-scan-hint">Tap 📷 to open camera, or type box number + Enter</div>
          </div>

          {/* Last route */}
          {lastRoute && (
            <div className="rw-route-banner">
              📍 Routed to <strong>{lastRoute}</strong>
            </div>
          )}

          {/* Scan history */}
          <div className="rw-scan-history">
            <div className="rw-scan-history-title">Recent Scans</div>
            {scanHistory.length === 0 ? (
              <div className="rw-scan-history-empty">No scans yet — scan a box to begin</div>
            ) : (
              scanHistory.map((h, i) => (
                <div key={i} className={`rw-scan-history-item ${h.status}`}>
                  <span className="rw-history-box">{h.box_number}</span>
                  <span className="rw-history-msg">{h.message}</span>
                  <span className="rw-history-time">{h.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
              ))
            )}
          </div>

          {/* Exception banner */}
          {exceptions.length > 0 && (
            <div className="rw-flash warning">
              ⚠ {exceptions.length} open exception{exceptions.length !== 1 ? "s" : ""} — {exceptions.slice(0, 2).map((e: any) => e.part_no || e.type).join(", ")}{exceptions.length > 2 ? ` +${exceptions.length - 2} more` : ""}
            </div>
          )}

          {/* Actions */}
          <div className="rw-actions">
            <button className="rw-btn rw-btn-secondary" onClick={() => setStep("select_po")}>← Back</button>
            <button className="rw-btn rw-btn-primary" onClick={() => setStep("complete")}>✓ Done</button>
          </div>
        </div>
      )}

      {/* ═══ Step 3: Scan Items ═══ */}
      {step === "scan_items" && currentBox && (
        <div className="rw-content">
          {/* Box header */}
          <div className="rw-tote-section">
            <div className="rw-tote-header">
              <div className="rw-tote-title">
                📦 {currentBox.box_number}
              </div>
              <span className="rw-tote-count-badge">
                {currentBox.items.filter((it) => it.scanned_qty === it.expected_qty).length} / {currentBox.items.length}
              </span>
            </div>

            {/* Scan input */}
            <div style={{ marginBottom: 12 }}>
              <form onSubmit={handleItemScanSubmit}>
                <div className="rw-scan-input-row">
                  <input
                    type="text"
                    className="rw-scan-field"
                    ref={scanInputRef}
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Scan item QR code or type item code"
                    autoComplete="off"
                    inputMode="text"
                  />
                  <button type="submit" className="rw-btn rw-btn-primary" disabled={loading || !scanInput.trim()}>
                    {loading ? <span className="rw-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : "GO"}
                  </button>
                </div>
                <div className="rw-scan-hint">Scan QR code or type item code + Enter</div>
              </form>
            </div>

            {/* Item list */}
            {currentBox.items.map((it) => (
              <div key={it.part_code} className={`rw-tote-item ${it.scanned_qty === it.expected_qty ? "matched" : it.status === "excess" ? "excess" : ""}`}>
                <div className="rw-tote-item-info">
                  <div className="rw-tote-item-top">
                    <span className="rw-tote-item-code">{it.part_code}</span>
                  </div>
                  <div className="rw-tote-item-bottom">
                    {it.part_name}
                  </div>
                </div>
                <div className="rw-qty-badge rw-qty-badge-lg">
                  <span className={it.scanned_qty >= it.expected_qty ? "rw-qty-done" : ""}>{it.scanned_qty}</span>
                  <span className="rw-qty-sep">/</span>
                  <span>{it.expected_qty}</span>
                </div>
                {it.scanned_qty === it.expected_qty ? (
                  <span className="rw-status-badge rw-placed">✓</span>
                ) : it.status === "excess" ? (
                  <span className="rw-status-badge rw-picked">⚠</span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="rw-actions">
            <button className="rw-btn rw-btn-secondary" onClick={() => { setCurrentBox(null); setStep("scan_box"); }}>✕ Close Box</button>
            <button className="rw-btn rw-btn-primary" onClick={completeBox}>✓ Complete Box</button>
          </div>
        </div>
      )}

      {/* ═══ Step 4: Complete ═══ */}
      {step === "complete" && (
        <div className="rw-complete-card">
          <div className="rw-complete-icon">✓</div>
          <div className="rw-complete-title">Receiving Complete</div>

          {stats && (
            <div className="rw-complete-stats">
              <div className="rw-complete-stat">
                <div className="rw-complete-stat-value">{stats.boxes_received}</div>
                <div className="rw-complete-stat-label">Boxes Received</div>
              </div>
              <div className="rw-complete-stat">
                <div className="rw-complete-stat-value">{stats.total_qty_scanned}</div>
                <div className="rw-complete-stat-label">Units Scanned</div>
              </div>
              <div className="rw-complete-stat">
                <div className="rw-complete-stat-value">{stats.items_full_match}</div>
                <div className="rw-complete-stat-label">Full Match</div>
              </div>
              <div className="rw-complete-stat">
                <div className="rw-complete-stat-value">{formatDuration(stats.elapsed_time_sec)}</div>
                <div className="rw-complete-stat-label">Elapsed</div>
              </div>
            </div>
          )}

          {stats && stats.exceptions_open > 0 && (
            <div className="rw-flash warning">⚠ {stats.exceptions_open} open exceptions — supervisor review needed</div>
          )}

          <div className="rw-actions" style={{ justifyContent: "center", marginTop: 16 }}>
            <a href="/grn" className="rw-btn rw-btn-primary" style={{ textDecoration: "none" }}>View Full Report →</a>
            <button className="rw-btn rw-btn-secondary" onClick={() => {
              setStep("select_po"); setSessionId(null); setSelectedPO(null); setStats(null); setScanHistory([]); setCurrentBox(null); setLastRoute(null);
            }}>Start New Receiving</button>
          </div>
        </div>
      )}
    </div>
  );
}
