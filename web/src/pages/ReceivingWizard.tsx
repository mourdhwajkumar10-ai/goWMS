import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import ScannerInput from "../components/ScannerInput";
import CameraScanner from "../components/CameraScanner";
import "../styles/receiving-wizard.css";

interface POInfo { id: number; name: string; supplier_name: string; status: string; grand_total: number; schedule_date: string; item_count: number; total_qty: number; received_qty: number; open_sessions: number; resume_session_id?: number | null; }
interface BoxItem { part_code: string; part_name: string; expected_qty: number; scanned_qty: number; status: string; }
interface ScanResult { box_number: string; auto_completed: boolean; message: string; timestamp: Date; status: "success" | "warning" | "error"; }
interface StatsData { session_id: number; session_no?: string; delivery_no: string; po_name?: string; total_boxes: number; boxes_received: number; single_item_boxes: number; multi_item_boxes: number; overall_progress_pct: number; total_items: number; items_full_match: number; items_shortage: number; items_excess: number; items_unknown: number; total_qty_expected: number; total_qty_scanned: number; exceptions_open: number; elapsed_time_sec: number; est_remaining_sec: number; }

const playBeep = (freq = 800, dur = 0.15) => { try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = freq; g.gain.setValueAtTime(0.1, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur); } catch {} };
const triggerVibrate = (p: number | number[] = 200) => { if (navigator.vibrate) navigator.vibrate(p); };
const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
const cut = (s: string, max = 22) => s.length <= max ? s : s.slice(0, max - 2) + "...";
type Step = "select_po" | "scan_box" | "scan_items" | "complete";

const boxItemsMatched = (items: BoxItem[]) =>
  items.length > 0 && items.every(it => it.status !== "excess" && Number(it.scanned_qty) >= Number(it.expected_qty));

function Ring({ pct, sz = 44 }: { pct: number; sz?: number }) {
  const st = 4, r = (sz - st) / 2, c = 2 * Math.PI * r, o = c - (pct / 100) * c;
  return (
    <div className="rw-progress-ring" style={{ width: sz, height: sz }}>
      <svg width={sz} height={sz}>
        <circle className="rw-progress-ring-bg" cx={sz/2} cy={sz/2} r={r} strokeWidth={st} />
        <circle className="rw-progress-ring-fill" cx={sz/2} cy={sz/2} r={r} strokeWidth={st} strokeDasharray={c} strokeDashoffset={o} />
      </svg>
      <div className="rw-progress-ring-text">{pct}%</div>
    </div>
  );
}

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
  const [curBox, setCurBox] = useState<{ box_number: string; items: BoxItem[] } | null>(null);
  const [scanIn, setScanIn] = useState("");
  const [boxes, setBoxes] = useState<any[]>([]);
  const [hist, setHist] = useState<ScanResult[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [exc, setExc] = useState<any[]>([]);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; type: string }[]>([]);
  const [camOpen, setCamOpen] = useState(false);
  const [itemCamOpen, setItemCamOpen] = useState(false);
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
          setStep("scan_box");
        }
      });
    }
  }, [resumeSid]);

  useEffect(() => { let t: any; if ((step === "scan_box" || step === "scan_items") && sid) { const f = () => api.receivingStats(sid).then(r => { if (r.ok) setStats(r.data); }); f(); t = setInterval(f, 10000); } return () => clearInterval(t); }, [step, sid]);
  useEffect(() => { let t: any; if ((step === "scan_box" || step === "scan_items") && sid) { const f = () => api.receivingExceptions(sid).then(r => { if (r.ok) setExc(r.data || []); }); f(); t = setInterval(f, 15000); } return () => clearInterval(t); }, [step, sid]);

  const fetchBoxes = useCallback(async () => { if (!sid) return; const r = await api.receivingBoxes(sid); if (r.ok && r.data?.boxes) setBoxes(r.data.boxes); }, [sid]);
  useEffect(() => { if (sid && step === "scan_box") { fetchBoxes(); const t = setInterval(fetchBoxes, 10000); return () => clearInterval(t); } }, [sid, step, fetchBoxes]);

  const qk = useMemo(() => boxes.filter(b => b.status !== "verified").slice(0, 6), [boxes]);
  const cnt = useMemo(() => { let d = 0; for (const b of boxes) if (b.status === "verified") d++; return { done: d, total: boxes.length, pend: boxes.length - d }; }, [boxes]);

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

  const handleBoxScan = useCallback(async (e: React.FormEvent, eb?: string) => {
    e.preventDefault();
    const raw = (eb !== undefined ? eb : scanIn).trim();
    if (!raw || !sid) return;
    setScanIn(""); setLoading(true);
    try {
      const r = await api.receivingScanBox({ session_id: sid, box_number: raw, auto_complete_single: false, default_route: DR });
      setLoading(false);
      if (!r.ok) { doFlash("error"); toast(r.error || "Box not found", "error"); return; }
      doFlash("success");
      if (r.data.auto_completed) {
        toast(r.data.message, "success");
        setHist(p => [{ box_number: raw, auto_completed: true, message: r.data.message, timestamp: new Date(), status: "success" }, ...p.slice(0, 4)]);
      } else {
        setCurBox({ box_number: r.data.box_number, items: r.data.items || [] });
        setStep("scan_items"); toast(r.data.message, "warning");
      }
      refreshProg();
    } catch (e: any) { setLoading(false); doFlash("error"); toast(e.message || "Failed", "error"); }
  }, [sid, scanIn, toast, doFlash, refreshProg]);

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
      const dp = r.data.delivery_progress;
      if (dp && dp.boxes_total > 0 && dp.boxes_received >= dp.boxes_total) {
        setStep("complete");
      } else {
        setStep("scan_box");
      }
      refreshProg();
      return true;
    } catch (e: any) {
      setLoading(false);
      toast(e.message || "Failed", "error");
      return false;
    }
  }, [sid, curBox, toast, refreshProg]);

  const handleItemScan = async (e?: React.FormEvent, rawOverride?: string) => {
    e?.preventDefault();
    const raw = (rawOverride ?? scanIn).trim();
    if (!raw || !sid || !curBox) return;
    setScanIn(""); setLoading(true);
    try {
      const r = await api.receivingScanItem({ session_id: sid, box_number: curBox.box_number, qr_raw: raw });
      setLoading(false);
      if (!r.ok) { doFlash("error"); toast(r.error || "Item not found", "error"); return; }
      const m = r.data.match; doFlash(m.status === "excess" ? "error" : "success");
      const upd = curBox.items.map(it => it.part_code === r.data.parsed.item_code ? { ...it, scanned_qty: m.scanned, status: m.status } : it);
      const shouldClose = m.status !== "excess" && (r.data.box_complete || boxItemsMatched(upd));
      if (shouldClose) autoClosedRef.current = curBox.box_number;
      setCurBox({ ...curBox, items: upd });
      toast(m.message, m.status === "excess" ? "warning" : "success");
      if (shouldClose) {
        await completeBox(curBox.box_number);
      }
    } catch (e: any) { setLoading(false); toast(e.message || "Failed", "error"); }
  };

  useEffect(() => {
    if (step !== "scan_items" || !curBox || loading) return;
    if (!boxItemsMatched(curBox.items)) return;
    if (autoClosedRef.current === curBox.box_number) return;
    autoClosedRef.current = curBox.box_number;
    void completeBox(curBox.box_number);
  }, [step, curBox, loading, completeBox]);

  const pct = stats?.overall_progress_pct ?? 0;

  return (
    <div className="rw-page">
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
        <div className="rw-header">
          <button className="rw-header-back" onClick={() => setStep("select_po")}>←</button>
          <div className="rw-header-info">
            <div className="rw-header-title">Box Scanner</div>
            <div className="rw-header-session">{sNo || "Session"} · {cnt.done}/{cnt.total}</div>
          </div>
          <Ring pct={pct} />
        </div>

        <CameraScanner
          open={camOpen}
          onClose={() => setCamOpen(false)}
          onScan={(code) => { setCamOpen(false); handleBoxScan({ preventDefault: () => {} } as any, code); }}
        />

        <div className="rw-scan-hero">
          <div className="rw-scan-prompt">{stats ? `${stats.boxes_received} of ${stats.total_boxes} scanned` : "Tap camera or type box number"}</div>
          <button className="rw-camera-btn" onClick={() => setCamOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            <span className="rw-camera-btn-label">SCAN</span>
          </button>
          <div className="rw-manual-row">
            <ScannerInput
              onScan={(code) => { if (sid) handleBoxScan({ preventDefault: () => {} } as any, code); }}
              placeholder="Or type box number"
              autoFocus={false} showTorch={true}
              suggestions={qk.map((b: any) => ({ code: b.box_number, name: `${b.item_count || 0} items`, qty: b.total_qty }))}
              onSelectSuggestion={(code) => { if (sid) handleBoxScan({ preventDefault: () => {} } as any, code); }}
            />
          </div>
        </div>

        {qk.length > 0 ? (
        <div className="rw-boxes-section">
          <div className="rw-boxes-header"><span className="rw-boxes-title">Next boxes</span><span className="rw-boxes-count">{cnt.pend} remaining</span></div>
          <div className="rw-boxes-list">
            {qk.map((box: any) => {
              const isVerified = box.status === "verified";
              const isReceived = box.status === "received";
              const status = isVerified ? "verified" : isReceived ? "scanning" : "expected";
              const badge = isVerified ? "Done" : isReceived ? "In Progress" : "Scan";
              return (
                <div key={box.id || box.box_number} className="rw-box-row" data-status={status}
                  onClick={() => handleBoxScan({ preventDefault: () => {} } as any, box.box_number)}>
                  <div className="rw-box-row-dot" />
                  <div className="rw-box-row-info"><div className="rw-box-row-num">{cut(box.box_number, 24)}</div><div className="rw-box-row-meta">{box.item_count || 0} items · {box.scanned_qty || 0}/{box.total_qty || 0} units</div></div>
                  <span className="rw-box-row-badge">{badge}</span>
                </div>
              );
            })}
          </div>
          {cnt.pend > 6 && <button className="rw-view-all-btn" onClick={() => setShowAll(true)}>View all {cnt.total} boxes</button>}
        </div>
        ) : (
        <div className="rw-empty">
          <div className="rw-empty-icon">📦</div>
          <div className="rw-empty-title">No boxes to suggest</div>
          <div className="rw-empty-msg">This GRN has no packing list yet, so there are no expected box numbers. Upload the packing list, or scan a box QR if you already have one.</div>
          <button className="rw-btn rw-btn-primary" style={{ marginTop: 12 }} type="button" onClick={() => navigate("/receiving-management")}>+ Upload Packing List</button>
        </div>
        )}

        {lastRoute && <div className="rw-route-flash">📍 Routed to <strong>{lastRoute}</strong></div>}
        {hist.length > 0 && <div className="rw-history"><div className="rw-history-label">Recent</div><div className="rw-history-items">
          {hist.slice(0, 5).map((h, i) => <div key={i} className={`rw-history-chip ${h.status}`}><span>{h.status === "success" ? "✓" : h.status === "error" ? "✕" : "⚠"}</span><span>{cut(h.box_number, 16)}</span></div>)}
        </div></div>}
        {exc.length > 0 && <div className="rw-exception-banner">⚠ {exc.length} open exception{exc.length !== 1 ? "s" : ""}</div>}
      </>}

      {step === "scan_items" && curBox && (() => {
        const matched = curBox.items.filter(it => Number(it.scanned_qty) >= Number(it.expected_qty)).length;
        const total = curBox.items.length;
        const boxPct = total > 0 ? Math.round((matched / total) * 100) : 0;
        const isComplete = boxItemsMatched(curBox.items);
        return <>
          <div className="rw-header">
            <button className="rw-header-back" onClick={() => { setCurBox(null); setStep("scan_box"); }}>←</button>
            <div className="rw-header-info">
              <div className="rw-header-title">Item Scanner</div>
              <div className="rw-header-session">{cut(curBox.box_number, 24)} · {matched}/{total} items</div>
            </div>
            <Ring pct={boxPct} />
          </div>
          <CameraScanner
            open={itemCamOpen}
            onClose={() => setItemCamOpen(false)}
            onScan={(code) => { setItemCamOpen(false); setScanIn(""); void handleItemScan(undefined, code); }}
          />
          <div className="rw-scan-hero">
            <div className="rw-scan-prompt">{isComplete ? "All items matched — close this box" : `${matched} of ${total} scanned`}</div>
            {isComplete ? (
              <button className="rw-camera-btn rw-camera-btn-done" onClick={() => { void completeBox(); }} disabled={loading}>
                <span className="rw-camera-btn-check">✓</span>
                <span className="rw-camera-btn-label">DONE</span>
              </button>
            ) : (
              <button className="rw-camera-btn" onClick={() => setItemCamOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <span className="rw-camera-btn-label">SCAN</span>
              </button>
            )}
            {!isComplete && (
            <div className="rw-manual-row">
              <ScannerInput
                onScan={(code) => { if (sid) void handleItemScan(undefined, code); }}
                placeholder="Or type item QR code"
                autoFocus={false} showTorch={true}
                suggestions={curBox.items.map(it => ({ code: it.part_code, name: it.part_name || "", qty: it.expected_qty }))}
                onSelectSuggestion={(code) => { if (sid) void handleItemScan(undefined, code); }}
              />
            </div>
            )}
          </div>
          <div className="rw-boxes-section">
            <div className="rw-boxes-header"><span className="rw-boxes-title">Items in box</span><span className="rw-boxes-count">{total - matched} remaining</span></div>
            <div className="rw-boxes-list">
              {curBox.items.map(it => {
                const itemDone = it.scanned_qty >= it.expected_qty;
                const status = it.status === "excess" ? "excess" : itemDone ? "verified" : it.scanned_qty > 0 ? "scanning" : "expected";
                const badge = it.status === "excess" ? "Excess" : itemDone ? "Done" : it.scanned_qty > 0 ? "In Progress" : "Scan";
                return (
                  <div key={it.part_code} className="rw-box-row" data-status={status} data-static>
                    <div className="rw-box-row-dot" />
                    <div className="rw-box-row-info">
                      <div className="rw-box-row-num">{it.part_code}</div>
                      <div className="rw-box-row-meta">{it.part_name || "—"} · {it.scanned_qty}/{it.expected_qty} units</div>
                    </div>
                    <span className="rw-box-row-badge">{badge}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rw-scan-actions">
            <button className="rw-btn rw-btn-secondary" style={{ flex: 1 }} onClick={() => { void completeBox(); }} disabled={loading}>Close Box</button>
            <button className="rw-btn rw-btn-primary" style={{ flex: 1 }} disabled={!isComplete || loading} onClick={() => { void completeBox(); }}>Complete</button>
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
            <button className="rw-btn rw-btn-secondary" onClick={() => { setStep("select_po"); setSid(null); setSelPO(null); setStats(null); setHist([]); setCurBox(null); setLastRoute(null); setBoxes([]); }}>New</button>
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
          <div className="rw-sheet-header"><div className="rw-sheet-title">All Boxes ({cnt.done}/{cnt.total})</div><button className="rw-sheet-close" onClick={() => setShowAll(false)}>✕</button></div>
          <div className="rw-sheet-body">
            {boxes.map((box: any) => {
              const isVerified = box.status === "verified";
              const isReceived = box.status === "received";
              const st = isVerified ? "verified" : isReceived ? "scanning" : "expected";
              const badge = isVerified ? "Done" : isReceived ? "In Progress" : "Scan";
              return <div key={box.id || box.box_number} className="rw-box-row" data-status={st} onClick={() => { setShowAll(false); handleBoxScan({ preventDefault: () => {} } as any, box.box_number); }}>
                <div className="rw-box-row-dot" />
                <div className="rw-box-row-info"><div className="rw-box-row-num">{cut(box.box_number, 24)}</div><div className="rw-box-row-meta">{box.item_count || 0} items · {box.scanned_qty || 0}/{box.total_qty || 0} units</div></div>
                <span className="rw-box-row-badge">{badge}</span>
              </div>;
            })}
          </div>
        </div>
      </>}
    </div>
  );
}
