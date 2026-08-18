import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import ScannerInput from "../components/ScannerInput";
import CameraScanner from "../components/CameraScanner";
import "../styles/receiving-wizard.css";

interface POInfo { id: number; name: string; supplier_name: string; status: string; grand_total: number; schedule_date: string; item_count: number; total_qty: number; received_qty: number; open_sessions: number; resume_session_id?: number | null; }
interface BoxItem { part_code: string; part_name: string; expected_qty: number; scanned_qty: number; status: string; }
interface ScanResult { box_number: string; auto_completed: boolean; message: string; timestamp: Date; status: "success" | "warning" | "error"; }
type Phase = "box_verify" | "item_verify";
interface StatsData { session_id: number; session_no?: string; session_status?: string; phase?: Phase; delivery_no: string; po_name?: string; packing_list_no?: string; packing_list_filename?: string; total_boxes: number; boxes_received: number; boxes_verified?: number; boxes_damaged?: number; single_item_boxes: number; multi_item_boxes: number; overall_progress_pct: number; box_progress_pct?: number; item_progress_pct?: number; total_items: number; items_full_match: number; items_shortage: number; items_excess: number; items_unknown: number; total_qty_expected: number; total_qty_scanned: number; exceptions_open: number; elapsed_time_sec: number; est_remaining_sec: number; }
interface PendingBox { box_number: string; item_count: number; items: BoxItem[]; }

const playBeep = (freq = 800, dur = 0.15) => { try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = freq; g.gain.setValueAtTime(0.1, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur); } catch {} };
const triggerVibrate = (p: number | number[] = 200) => { if (navigator.vibrate) navigator.vibrate(p); };
const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
const cut = (s: string, max = 22) => s.length <= max ? s : s.slice(0, max - 2) + "...";
type Step = "select_po" | "scan_box" | "scan_items" | "complete";

const boxItemsMatched = (items: BoxItem[]) =>
  items.length > 0 && items.every(it => it.status === "damage" || (it.status !== "excess" && Number(it.scanned_qty) >= Number(it.expected_qty)));

export default function ReceivingWizard() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const resumeSid = sp.get("session_id") || sp.get("packing_list_id");
  const [step, setStep] = useState<Step>(resumeSid ? "scan_box" : "select_po");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingPOs, setPendingPOs] = useState<POInfo[]>([]);
  const [selPO, setSelPO] = useState<POInfo | null>(null);
  const [sid, setSid] = useState<number | null>(resumeSid ? Number(resumeSid) : null);
  const [sNo, setSNo] = useState<string | null>(null);
  const [curBox, setCurBox] = useState<{ box_number: string; items: BoxItem[]; damaged?: boolean } | null>(null);
  const [scanIn, setScanIn] = useState("");
  const [boxes, setBoxes] = useState<any[]>([]);
  const [hist, setHist] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [exc, setExc] = useState<any[]>([]);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; type: string }[]>([]);
  const [phase, setPhase] = useState<Phase>("box_verify");
  const [lastOkBox, setLastOkBox] = useState<PendingBox | null>(null);
  const [showSignOff, setShowSignOff] = useState(false);
  const [boxQuery, setBoxQuery] = useState("");
  const autoClosedRef = useRef<string | null>(null);
  const DR = "INCOMING-01";

  const toast = useCallback((text: string, type: "success" | "warning" | "error" = "success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, text, type }]);
    if (type === "success") playBeep(800, 0.15);
    else if (type === "error") { playBeep(250, 0.4); triggerVibrate([100, 50, 100]); }
    else { playBeep(400, 0.25); triggerVibrate(150); }
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  const doFlash = useCallback((t: "success" | "error") => { setFlash(t); setTimeout(() => setFlash(null), 300); }, []);

  useEffect(() => { api.receivingPendingPOs().then(r => { if (r.ok) setPendingPOs((r.data || []).slice(0, 5)); }); }, []);

  useEffect(() => {
    if (resumeSid) {
      api.receivingStats(Number(resumeSid)).then(r => {
        if (r.ok) {
          setStats(r.data);
          setSid(Number(resumeSid));
          if (r.data.session_no) setSNo(r.data.session_no);
          if (r.data.po_name) setSelPO(p => p ?? { id: 0, name: r.data.po_name!, supplier_name: "", status: "", grand_total: 0, schedule_date: "", item_count: 0, total_qty: 0, received_qty: 0, open_sessions: 0 });
          if (r.data.phase === "item_verify") setPhase("item_verify");
          setStep("scan_box");
        }
      });
    }
  }, [resumeSid]);

  useEffect(() => { let t: any; if ((step === "scan_box" || step === "scan_items") && sid) { const f = () => api.receivingStats(sid).then(r => { if (r.ok) setStats(r.data); }); f(); t = setInterval(f, 10000); } return () => clearInterval(t); }, [step, sid]);
  useEffect(() => { let t: any; if ((step === "scan_box" || step === "scan_items") && sid) { const f = () => api.receivingExceptions(sid).then(r => { if (r.ok) setExc(r.data || []); }); f(); t = setInterval(f, 15000); } return () => clearInterval(t); }, [step, sid]);

  const fetchBoxes = useCallback(async () => { if (!sid) return; const r = await api.receivingBoxes(sid); if (r.ok && r.data?.boxes) setBoxes(r.data.boxes); }, [sid]);
  useEffect(() => { if (sid && (step === "scan_box" || step === "scan_items")) { fetchBoxes(); const t = setInterval(fetchBoxes, 10000); return () => clearInterval(t); } }, [sid, step, fetchBoxes]);

  const pendingBoxes = useMemo(() => {
    const q = boxQuery.trim().toLowerCase();
    const list = phase === "item_verify"
      ? boxes.filter(b => b.status !== "verified" && (b.status === "received" || b.status === "exception"))
      : boxes.filter(b => b.status !== "verified" && b.status !== "received" && b.status !== "exception");
    if (!q) return list;
    return list.filter(b => String(b.box_number).toLowerCase().includes(q));
  }, [boxes, phase, boxQuery]);
  const qk = useMemo(() => pendingBoxes.slice(0, 8), [pendingBoxes]);
  const cnt = useMemo(() => {
    let verified = 0, received = 0, damaged = 0;
    for (const b of boxes) {
      if (b.status === "verified") verified++;
      if (b.status === "received" || b.status === "verified" || b.status === "exception") received++;
      if (b.condition && b.condition !== "ok") damaged++;
    }
    return { verified, received, damaged, total: boxes.length, pendDock: boxes.length - received, pendItems: received - verified };
  }, [boxes]);

  const refreshProg = useCallback(async () => { if (!sid) return; api.receivingStats(sid).then(r => { if (r.ok) setStats(r.data); }); fetchBoxes(); }, [sid, fetchBoxes]);

  const handleSelectPO = async (po: POInfo) => {
    setSelPO(po); setLoading(true); setError("");
    try {
      if (po.resume_session_id) {
        const sr = await api.receivingStats(po.resume_session_id);
        if (sr.ok && (sr.data.total_boxes || 0) > 0) {
          setSid(po.resume_session_id);
          setStats(sr.data);
          if (sr.data.session_no) setSNo(sr.data.session_no);
          if (sr.data.phase === "item_verify") setPhase("item_verify");
          else setPhase("box_verify");
          setLoading(false);
          setStep("scan_box");
          toast(`${sr.data.session_no || "Session"} · ${sr.data.total_boxes} boxes`, "success");
          return;
        }
      }
      setLoading(false);
      setError("This PO has no packing list yet, so there are no box numbers to receive. Upload the packing list first.");
    } catch (e: any) { setLoading(false); setError(e.message || "Failed"); }
  };

  const confirmBoxSnapshot = useCallback(async (snapshot: PendingBox, condition: "ok" | "damaged") => {
    if (!sid || !snapshot) return false;
    const items = snapshot.items || [];
    if (condition === "damaged") {
      autoClosedRef.current = null;
      setCurBox({ box_number: snapshot.box_number, items, damaged: true });
      setStep("scan_items");
    }
    setLoading(true);
    try {
      const r = await api.receivingConfirmBox({ session_id: sid, box_number: snapshot.box_number, condition });
      setLoading(false);
      if (!r.ok) {
        toast(r.error || "Failed to save box condition", "error");
        return false;
      }
      const nextItems: BoxItem[] = r.data.items || items;
      const bn = r.data.box_number || snapshot.box_number;
      if (condition === "damaged" || r.data.next_action === "scan_items" || r.data.damaged) {
        setLastOkBox(null);
        setCurBox({ box_number: bn, items: nextItems, damaged: true });
        setStep("scan_items");
        toast(r.data.message || "Damaged — scan items", "warning");
      } else {
        setLastOkBox({ ...snapshot, box_number: bn, items: nextItems });
        toast(r.data.message || `${bn} accepted`, "success");
        setHist(p => [{ box_number: bn, auto_completed: true, message: "Box OK", timestamp: new Date(), status: "success" }, ...p.slice(0, 4)]);
        const dp = r.data.delivery_progress;
        if (dp && dp.boxes_total > 0 && dp.boxes_received >= dp.boxes_total) {
          setShowSignOff(true);
        }
      }
      refreshProg();
      return true;
    } catch (e: any) {
      setLoading(false);
      toast(e.message || "Failed", "error");
      return false;
    }
  }, [sid, toast, refreshProg]);

  const handleBoxScan = useCallback(async (rawOverride?: string): Promise<boolean> => {
    const raw = (rawOverride !== undefined ? rawOverride : scanIn).trim();
    if (!raw || !sid) return false;
    setScanIn("");
    setLoading(true);
    try {
      const r = await api.receivingScanBox({ session_id: sid, box_number: raw, auto_complete_single: false, default_route: DR, phase });
      setLoading(false);
      if (!r.ok) { doFlash("error"); toast(r.error || "Box not found", "error"); return false; }
      const next = r.data.next_action as string;
      const items: BoxItem[] = r.data.items || [];
      if (next === "already_verified") {
        doFlash("success");
        toast(r.data.message || "Already verified", "success");
        return true;
      }
      if (next === "already_scanned") {
        doFlash("success");
        toast(r.data.message || "Already counted", "warning");
        return true;
      }
      if (next === "scan_items") {
        doFlash("success");
        setCurBox({
          box_number: r.data.box_number,
          items,
          damaged: !!(r.data.condition && r.data.condition !== "ok"),
        });
        setStep("scan_items");
        toast(r.data.message || "Scan items", "warning");
        refreshProg();
        return true;
      }
      const snapshot: PendingBox = { box_number: r.data.box_number, item_count: r.data.item_count || items.length, items };
      const ok = await confirmBoxSnapshot(snapshot, "ok");
      if (ok) doFlash("success");
      else doFlash("error");
      return ok;
    } catch (e: any) {
      setLoading(false);
      doFlash("error");
      toast(e.message || "Failed", "error");
      return false;
    }
  }, [sid, scanIn, phase, confirmBoxSnapshot, toast, doFlash, refreshProg]);

  const markLastDamaged = useCallback(async () => {
    if (!lastOkBox) {
      toast("Scan a box first", "warning");
      return;
    }
    await confirmBoxSnapshot(lastOkBox, "damaged");
  }, [lastOkBox, confirmBoxSnapshot, toast]);

  const markBoxDamaged = useCallback(async (boxNumber: string) => {
    const raw = boxNumber.trim();
    if (!raw) return;
    await confirmBoxSnapshot({ box_number: raw, item_count: 0, items: [] }, "damaged");
  }, [confirmBoxSnapshot]);

  const rejectItem = useCallback(async (itemCode: string) => {
    if (!sid || !curBox) return;
    setLoading(true);
    try {
      const r = await api.receivingRejectItem({ session_id: sid, box_number: curBox.box_number, item_code: itemCode });
      setLoading(false);
      if (!r.ok) { doFlash("error"); toast(r.error || "Reject failed", "error"); return; }
      doFlash("success");
      setCurBox({
        ...curBox,
        items: curBox.items.map(it => it.part_code.toLowerCase() === itemCode.toLowerCase()
          ? { ...it, status: "damage" }
          : it),
      });
      toast(r.data.message || `${itemCode} → REJECT-01`, "warning");
    } catch (e: any) {
      setLoading(false);
      doFlash("error");
      toast(e.message || "Reject failed", "error");
    }
  }, [sid, curBox, toast, doFlash]);

  const signOffBoxes = useCallback(async () => {
    if (!sid) return;
    setLoading(true);
    try {
      const r = await api.receivingSignOffBoxes({ session_id: sid });
      setLoading(false);
      if (!r.ok) { toast(r.error || "Failed", "error"); return; }
      setShowSignOff(false);
      setPhase("item_verify");
      toast(r.data.message || "Transporter signed off", "success");
      refreshProg();
    } catch (e: any) { setLoading(false); toast(e.message || "Failed", "error"); }
  }, [sid, toast, refreshProg]);

  const completeBox = useCallback(async (boxNo?: string) => {
    const bn = boxNo || curBox?.box_number;
    if (!sid || !bn) return false;
    setLoading(true);
    try {
      const r = await api.receivingCompleteBox({ session_id: sid, box_number: bn, default_route: DR });
      setLoading(false);
      if (!r.ok) { toast(r.error || "Failed", "error"); return false; }
      const rt = r.data.box_route || DR;
      setLastRoute(rt);
      toast(`${bn} → ${rt}`, "success");
      setHist(p => [{ box_number: bn, auto_completed: true, message: `Verified → ${rt}`, timestamp: new Date(), status: "success" }, ...p.slice(0, 4)]);
      setCurBox(null);
      if (r.data.all_verified) {
        setStep("complete");
      } else {
        setStep("scan_box");
        const dp = r.data.delivery_progress;
        if (phase === "box_verify" && dp && dp.boxes_total > 0 && dp.boxes_received >= dp.boxes_total) {
          setShowSignOff(true);
        }
      }
      refreshProg();
      return true;
    } catch (e: any) {
      setLoading(false);
      toast(e.message || "Failed", "error");
      return false;
    }
  }, [sid, curBox, phase, toast, refreshProg]);

  const handleItemScan = async (rawOverride?: string): Promise<boolean> => {
    const raw = (rawOverride ?? scanIn).trim();
    if (!raw || !sid || !curBox) return false;
    const boxNo = curBox.box_number.trim().toLowerCase();
    if (raw.trim().toLowerCase() === boxNo) {
      toast("Scan an item QR, not the box barcode", "warning");
      return false;
    }
    setScanIn(""); setLoading(true);
    try {
      const r = await api.receivingScanItem({ session_id: sid, box_number: curBox.box_number, qr_raw: raw });
      setLoading(false);
      if (!r.ok) { doFlash("error"); toast(r.error || "Item not found", "error"); return false; }
      const m = r.data.match; doFlash(m.status === "excess" ? "error" : "success");
      const scannedCode = String(r.data.parsed?.item_code || "").toLowerCase();
      const upd = curBox.items.map(it => it.part_code.toLowerCase() === scannedCode ? { ...it, scanned_qty: m.scanned, status: m.status } : it);
      const shouldClose = !curBox.damaged && m.status !== "excess" && (r.data.box_complete || boxItemsMatched(upd));
      if (shouldClose) autoClosedRef.current = curBox.box_number;
      setCurBox({ ...curBox, items: upd });
      toast(m.message, m.status === "excess" ? "warning" : "success");
      if (shouldClose) {
        await completeBox(curBox.box_number);
      }
      return m.status !== "excess";
    } catch (e: any) { setLoading(false); toast(e.message || "Failed", "error"); return false; }
  };

  useEffect(() => {
    if (step !== "scan_items" || !curBox || loading || curBox.damaged) return;
    if (!boxItemsMatched(curBox.items)) return;
    if (autoClosedRef.current === curBox.box_number) return;
    autoClosedRef.current = curBox.box_number;
    void completeBox(curBox.box_number);
  }, [step, curBox, loading, completeBox]);

  const pct = phase === "item_verify"
    ? (stats?.item_progress_pct ?? (cnt.total ? Math.round((cnt.verified / cnt.total) * 100) : 0))
    : (stats?.box_progress_pct ?? (cnt.total ? Math.round((cnt.received / cnt.total) * 100) : 0));
  const emptyBoxList = boxes.length === 0;
  const counted = phase === "item_verify" ? cnt.verified : cnt.received;
  const remaining = phase === "item_verify" ? cnt.pendItems : cnt.pendDock;

  const docFlow = (
    <div className="rw-doc-map rw-doc-map-inline">
      <span className="rw-doc-chip" data-kind="po"><span className="rw-doc-chip-label">PO</span><span className="rw-doc-chip-value">{stats?.po_name || selPO?.name || "—"}</span></span>
      <span className="rw-doc-arrow">→</span>
      <span className="rw-doc-chip" data-kind="pl"><span className="rw-doc-chip-label">PL</span><span className="rw-doc-chip-value">{stats?.packing_list_no || "—"}</span></span>
      <span className="rw-doc-arrow">→</span>
      <span className="rw-doc-chip" data-kind="grn"><span className="rw-doc-chip-label">GRN</span><span className="rw-doc-chip-value">{sNo || "—"}</span></span>
    </div>
  );

  return (
    <div className={`rw-page${step === "scan_box" || step === "scan_items" ? " rw-dash-page" : ""}`}>
      {flash && <div className={`rw-scan-flash ${flash}`} />}

      {step === "select_po" && <>
        <div className="rw-header"><div className="rw-header-info"><div className="rw-header-session">Receiving</div><div className="rw-header-po">Select a purchase order</div></div></div>
        <div className="rw-po-list">
          {error && <div className="rw-empty-msg" style={{ padding: 12 }}>{error}</div>}
          {pendingPOs.length === 0
            ? <div className="rw-empty"><div className="rw-empty-icon">📦</div><div className="rw-empty-title">No pending POs</div><div className="rw-empty-msg">Create POs in your ERP to start</div></div>
            : pendingPOs.map(po => (
              <div key={po.id} className="rw-po-item" onClick={() => handleSelectPO(po)}>
                <div className="rw-po-info"><div className="rw-po-name">{po.name}</div><div className="rw-po-supplier">{po.supplier_name}</div><div className="rw-po-meta">{po.item_count} items · {po.total_qty} units</div></div>
                <span className={`rw-po-badge ${po.open_sessions > 0 ? "resume" : "start"}`}>{po.open_sessions > 0 ? "Resume" : "Start"}</span>
              </div>
            ))}
        </div>
      </>}

      {step === "scan_box" && <>
        <header className="rw-topbar">
          <div className="rw-topbar-left">
            <button className="rw-header-back" onClick={() => setStep("select_po")} aria-label="Back">←</button>
            <div className="rw-topbar-titles">
              <div className="rw-header-title">{phase === "item_verify" ? "Item verification" : "Box verification"}</div>
              {docFlow}
            </div>
          </div>
          <div className="rw-topbar-right">
            <div className="rw-progress-inline">
              <div className="rw-progress-track" aria-hidden><div className="rw-progress-fill" style={{ width: `${pct}%` }} /></div>
              <span className="rw-progress-label">{counted}/{cnt.total} boxes · {pct}%</span>
            </div>
            <div className="rw-phase-tabs rw-phase-tabs-compact">
              <button type="button" className="rw-phase-tab" data-active={phase === "box_verify"} onClick={() => setPhase("box_verify")}>1. Boxes</button>
              <button type="button" className="rw-phase-tab" data-active={phase === "item_verify"} disabled={cnt.received < 1} onClick={() => setPhase("item_verify")}>2. Items</button>
            </div>
          </div>
        </header>

        <div className="rw-dash">
          <section className="rw-dash-left">
            <CameraScanner
              embedded
              open={true}
              onClose={() => {}}
              onScan={(code) => handleBoxScan(code)}
              footer={
                phase === "box_verify" ? (
                  <button type="button" className="cam-dmg-btn" disabled={!lastOkBox || loading} onClick={() => { void markLastDamaged(); }}>
                    {lastOkBox ? `Mark damaged · ${cut(lastOkBox.box_number, 14)}` : "Mark previous damaged"}
                  </button>
                ) : null
              }
            />
            <div className="rw-scan-prompt">
              {phase === "item_verify"
                ? (cnt.pendItems > 0 ? `Scan a received box to check items · ${cnt.pendItems} left` : "All received boxes have been item-checked")
                : (stats ? `${cnt.received} of ${cnt.total} boxes counted` : "Scan each box")}
            </div>
            <div className="rw-manual-row">
              <ScannerInput
                onScan={(code) => { if (sid) void handleBoxScan(code); }}
                placeholder="Paste or type box number, then Enter"
                autoFocus={false} showTorch={false} showCamera={false}
                suggestions={qk.map((b: any) => ({ code: b.box_number, name: `${b.item_count || 0} items`, qty: b.total_qty }))}
                onSelectSuggestion={(code) => { if (sid) void handleBoxScan(code); }}
              />
            </div>
            {phase === "box_verify" && cnt.received > 0 && (
              <button className="rw-btn rw-btn-primary rw-dash-signoff" type="button" disabled={loading} onClick={() => setShowSignOff(true)}>
                {cnt.pendDock === 0 ? "Sign off transporter" : `Sign off transporter · ${cnt.pendDock} not scanned`}
              </button>
            )}
          </section>

          <section className="rw-dash-right">
            {pendingBoxes.length > 0 || boxQuery ? (
              <div className="rw-boxes-section">
                <div className="rw-boxes-header">
                  <span className="rw-boxes-title">{phase === "item_verify" ? "Boxes to item-check" : "Next boxes"} ({remaining} remaining)</span>
                  <input
                    className="rw-queue-search"
                    value={boxQuery}
                    onChange={(e) => setBoxQuery(e.target.value)}
                    placeholder="Filter box ID"
                    aria-label="Filter boxes"
                  />
                </div>
                <div className="rw-boxes-list">
                  {pendingBoxes.map((box: any) => {
                    const isVerified = box.status === "verified";
                    const isReceived = box.status === "received" || box.status === "exception";
                    const damaged = !!(box.condition && box.condition !== "ok");
                    const status = isVerified ? "verified" : damaged ? "damaged" : isReceived ? "scanning" : "expected";
                    const badge = isVerified ? "Done" : damaged ? "Damaged" : isReceived ? (phase === "item_verify" ? "Check" : "Counted") : "Pending";
                    return (
                      <div key={box.id || box.box_number} className="rw-box-row" data-status={status}>
                        <div className="rw-box-row-dot" />
                        <div className="rw-box-row-info">
                          <div className="rw-box-row-num">{box.box_number}</div>
                          <div className="rw-box-row-meta">{box.item_count || 0} items · {box.scanned_qty || 0}/{box.total_qty || 0} units</div>
                        </div>
                        <span className="rw-box-row-badge">{badge}</span>
                        <div className="rw-box-row-actions">
                          {!isVerified && (
                            <button type="button" className="rw-box-row-scan" onClick={() => { void handleBoxScan(box.box_number); }}>Scan</button>
                          )}
                          {!isVerified && (
                            <button type="button" className="rw-box-row-dmg" onClick={() => { void markBoxDamaged(box.box_number); }}>Damaged</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {cnt.total > pendingBoxes.length && (
                  <button className="rw-view-all-btn" onClick={() => setShowAll(true)}>View all {cnt.total} boxes</button>
                )}
              </div>
            ) : emptyBoxList ? (
              <div className="rw-empty">
                <div className="rw-empty-icon">📦</div>
                <div className="rw-empty-title">No boxes to suggest</div>
                <div className="rw-empty-msg">This GRN has no packing list yet. Upload the packing list, or paste a box number on the left.</div>
                <button className="rw-btn rw-btn-primary" style={{ marginTop: 12 }} type="button" onClick={() => navigate("/receiving-management")}>+ Upload Packing List</button>
              </div>
            ) : (
              <div className="rw-empty">
                <div className="rw-empty-icon">✓</div>
                <div className="rw-empty-title">{phase === "item_verify" ? "No boxes waiting for item check" : "All boxes counted"}</div>
                <div className="rw-empty-msg">{phase === "item_verify" ? "Scan a box number to reopen it, or finish remaining items later." : "Sign off the transporter, then start item verification."}</div>
              </div>
            )}
            {lastRoute && <div className="rw-route-flash">Routed to <strong>{lastRoute}</strong></div>}
            {hist.length > 0 && <div className="rw-history"><div className="rw-history-label">Recent</div><div className="rw-history-items">
              {hist.slice(0, 5).map((h, i) => <div key={i} className={`rw-history-chip ${h.status}`}><span>{h.status === "success" ? "✓" : h.status === "error" ? "✕" : "⚠"}</span><span>{cut(h.box_number, 16)}</span></div>)}
            </div></div>}
            {exc.length > 0 && <div className="rw-exception-banner">⚠ {exc.length} open exception{exc.length !== 1 ? "s" : ""}</div>}
          </section>
        </div>
      </>}

      {step === "scan_items" && curBox && (() => {
        const matched = curBox.items.filter(it => Number(it.scanned_qty) >= Number(it.expected_qty)).length;
        const total = curBox.items.length;
        const boxPct = total > 0 ? Math.round((matched / total) * 100) : 0;
        const isComplete = boxItemsMatched(curBox.items);
        return <>
          <header className="rw-topbar">
            <div className="rw-topbar-left">
              <button className="rw-header-back" onClick={() => { setCurBox(null); setStep("scan_box"); }} aria-label="Back">←</button>
              <div className="rw-topbar-titles">
                <div className="rw-header-title">{curBox.damaged ? "Damaged box — items" : "Item verification"}</div>
                {docFlow}
              </div>
            </div>
            <div className="rw-topbar-right">
              <div className="rw-progress-inline">
                <div className="rw-progress-track" aria-hidden><div className="rw-progress-fill" style={{ width: `${boxPct}%` }} /></div>
                <span className="rw-progress-label">{cut(curBox.box_number, 20)} · {matched}/{total} items · {boxPct}%</span>
              </div>
            </div>
          </header>

          <div className="rw-dash">
            <section className="rw-dash-left">
              {curBox.damaged && (
                <div className="rw-exception-banner rw-exception-banner-flush">Damaged box — scan good items, or Reject an item to send it to REJECT-01</div>
              )}
              <CameraScanner
                embedded
                open={true}
                onClose={() => {}}
                onScan={(code) => handleItemScan(code)}
              />
              <div className="rw-scan-prompt">{isComplete ? "All items matched — close this box" : `${matched} of ${total} scanned`}</div>
              {(!isComplete || curBox.damaged) && (
                <div className="rw-manual-row">
                  <ScannerInput
                    key={`${curBox.box_number}-items`}
                    onScan={(code) => { if (sid) void handleItemScan(code); }}
                    placeholder="Paste or type item QR, then Enter"
                    autoFocus={false} showTorch={false} showCamera={false}
                    suggestions={curBox.items.map(it => ({ code: it.part_code, name: it.part_name || "", qty: it.expected_qty }))}
                    onSelectSuggestion={(code) => { if (sid) void handleItemScan(code); }}
                  />
                </div>
              )}
              <div className="rw-scan-actions rw-scan-actions-inline">
                <button className="rw-btn rw-btn-secondary" style={{ flex: 1 }} onClick={() => { void completeBox(); }} disabled={loading}>Close Box</button>
                <button className="rw-btn rw-btn-primary" style={{ flex: 1 }} disabled={(!curBox.damaged && !isComplete) || loading} onClick={() => { void completeBox(); }}>
                  {curBox.damaged && !isComplete ? "Finish inspection" : "Complete"}
                </button>
              </div>
            </section>

            <section className="rw-dash-right">
              <div className="rw-boxes-section">
                <div className="rw-boxes-header">
                  <span className="rw-boxes-title">Items in box ({total - matched} remaining)</span>
                </div>
                <div className="rw-boxes-list">
                  {curBox.items.map(it => {
                    const rejected = it.status === "damage";
                    const itemDone = !rejected && it.scanned_qty >= it.expected_qty;
                    const status = rejected ? "damaged" : it.status === "excess" ? "excess" : itemDone ? "verified" : it.scanned_qty > 0 ? "scanning" : "expected";
                    const badge = rejected ? "Rejected" : it.status === "excess" ? "Excess" : itemDone ? "Done" : it.scanned_qty > 0 ? "In progress" : "Pending";
                    return (
                      <div key={it.part_code} className="rw-box-row" data-status={status} data-static>
                        <div className="rw-box-row-dot" />
                        <div className="rw-box-row-info">
                          <div className="rw-box-row-num">{it.part_code}</div>
                          <div className="rw-box-row-meta">{it.part_name || "—"} · {it.scanned_qty}/{it.expected_qty} units{rejected ? " · REJECT-01" : ""}</div>
                        </div>
                        <span className="rw-box-row-badge">{badge}</span>
                        {!rejected && (
                          <button type="button" className="rw-box-row-dmg" disabled={loading} onClick={() => { void rejectItem(it.part_code); }}>Reject</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </>;
      })()}

      {step === "complete" && <>
        <div className="rw-header"><div className="rw-header-info"><div className="rw-header-session">Done</div></div></div>
        <div className="rw-complete">
          <div className="rw-complete-icon">✓</div>
          <div className="rw-complete-title">All Done!</div>
          {stats && <div className="rw-complete-stats">
            <div className="rw-complete-stat"><div className="rw-complete-stat-value">{stats.boxes_received}</div><div className="rw-complete-stat-label">Boxes</div></div>
            <div className="rw-complete-stat"><div className="rw-complete-stat-value">{stats.total_qty_scanned}</div><div className="rw-complete-stat-label">Units</div></div>
            <div className="rw-complete-stat"><div className="rw-complete-stat-value">{stats.items_full_match}</div><div className="rw-complete-stat-label">Match</div></div>
            <div className="rw-complete-stat"><div className="rw-complete-stat-value">{fmtDur(stats.elapsed_time_sec)}</div><div className="rw-complete-stat-label">Time</div></div>
          </div>}
          <div className="rw-complete-actions">
            <a href="/grn" className="rw-btn rw-btn-primary" style={{ textDecoration: "none" }}>Report</a>
            <button className="rw-btn rw-btn-secondary" onClick={() => { setStep("select_po"); setSid(null); setSelPO(null); setStats(null); setHist([]); setCurBox(null); setLastRoute(null); setBoxes([]); setPhase("box_verify"); setLastOkBox(null); }}>New</button>
          </div>
        </div>
      </>}

      <div className="rw-toast-container">
        {toasts.map(t => <div key={t.id} className={`rw-toast rw-toast-${t.type}`}><span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "⚠"}</span>{t.text}</div>)}
      </div>

      {showAll && <>
        <div className="rw-sheet-overlay" onClick={() => setShowAll(false)} />
        <div className="rw-sheet">
          <div className="rw-sheet-handle" />
          <div className="rw-sheet-header"><div className="rw-sheet-title">All Boxes ({cnt.received}/{cnt.total} counted · {cnt.verified} item-checked)</div><button className="rw-sheet-close" onClick={() => setShowAll(false)}>✕</button></div>
          <div className="rw-sheet-body">
            {boxes.map((box: any) => {
              const isVerified = box.status === "verified";
              const isReceived = box.status === "received" || box.status === "exception";
              const damaged = box.condition && box.condition !== "ok";
              const st = isVerified ? "verified" : damaged ? "excess" : isReceived ? "scanning" : "expected";
              const badge = isVerified ? "Done" : damaged ? "Damaged" : isReceived ? "Counted" : "Scan";
              return <div key={box.id || box.box_number} className="rw-box-row" data-status={st} onClick={() => { setShowAll(false); void handleBoxScan(box.box_number); }}>
                <div className="rw-box-row-dot" />
                <div className="rw-box-row-info"><div className="rw-box-row-num">{cut(box.box_number, 24)}</div><div className="rw-box-row-meta">{box.item_count || 0} items · {box.scanned_qty || 0}/{box.total_qty || 0} units</div></div>
                <span className="rw-box-row-badge">{badge}</span>
                {!isVerified && (
                  <button type="button" className="rw-box-row-dmg" onClick={(e) => { e.stopPropagation(); setShowAll(false); void markBoxDamaged(box.box_number); }}>Damaged</button>
                )}
              </div>;
            })}
          </div>
        </div>
      </>}

      {showSignOff && createPortal(
        <div className="rw-confirm-overlay" onClick={() => !loading && setShowSignOff(false)} role="presentation">
          <div className="rw-confirm-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="rw-confirm-kicker">Transporter sign-off</div>
            <div className="rw-confirm-boxno">{cnt.received} / {cnt.total}</div>
            <div className="rw-confirm-meta">boxes counted at the dock</div>
            {cnt.pendDock > 0
              ? <p className="rw-confirm-q">{cnt.pendDock} expected box{cnt.pendDock === 1 ? "" : "es"} not scanned. Sign off anyway so the transporter can leave?</p>
              : <p className="rw-confirm-q">All expected boxes are counted. Sign off and tell the transporter the shipment is accepted?</p>}
            <button type="button" className="rw-confirm-ok" disabled={loading} onClick={() => { void signOffBoxes(); }}>Sign off transporter</button>
            <button type="button" className="rw-confirm-cancel" disabled={loading} onClick={() => setShowSignOff(false)}>Keep scanning</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
