import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import CameraScanner from "../components/CameraScanner";
import ScannerLayout from "../components/ScannerLayout";
import VerificationHeader, { type Tab as ScanTab } from "../components/scan/VerificationHeader";
import ScanCard from "../components/scan/ScanCard";
import BoxQueue, { type Box as QueueBox } from "../components/scan/BoxQueue";
import ItemsPanel from "../components/scan/ItemsPanel";
import SignoffBar from "../components/scan/SignoffBar";
import type { ScanState } from "../components/scan/ScanViewport";
import "../styles/receiving-wizard.css";
import "../styles/scanner.css";
import { mergeReceivingChoices, receivingChoiceMatches, type ReceivingChoice } from "../utils/receivingData";
import { useLoadMore } from "../hooks/useLoadMore";

type POInfo = ReceivingChoice;
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
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");
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
  const [poQuery, setPoQuery] = useState("");
  const [uiTab, setUiTab] = useState<ScanTab>("boxes");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanReason, setScanReason] = useState<string | undefined>();
  const [lastScanCode, setLastScanCode] = useState("");
  const [cameraKey, setCameraKey] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    setPendingLoading(true);
    setPendingError("");
    Promise.all([api.receivingPendingPOs(), api.packingListList()])
      .then(([poResult, sessionResult]) => {
        if (cancelled) return;
        if (!poResult.ok && !sessionResult.ok) {
          setPendingError(poResult.error || sessionResult.error || "Could not load receiving choices");
          return;
        }
        const merged = mergeReceivingChoices(
          poResult.ok ? (poResult.data || []) : [],
          sessionResult.ok ? (sessionResult.data || []) : [],
        );
        setPendingPOs(merged as POInfo[]);
      })
      .catch((e: any) => {
        if (!cancelled) setPendingError(e?.message || "Could not load receiving choices");
      })
      .finally(() => { if (!cancelled) setPendingLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredPOs = useMemo(
    () => pendingPOs.filter((po) => receivingChoiceMatches(po, poQuery)),
    [pendingPOs, poQuery],
  );
  const poMore = useLoadMore(filteredPOs, 10, filteredPOs.length);

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

  const transporterSignedOff =
    stats?.phase === "item_verify" ||
    ["item_verification", "item_verification_complete", "exception_pending"].includes(
      String(stats?.session_status || ""),
    );

  useEffect(() => {
    if (transporterSignedOff && phase !== "item_verify") {
      setPhase("item_verify");
    }
  }, [transporterSignedOff, phase]);

  // After sign-off land on Items (which now includes RF scan). Before sign-off stay on Boxes.
  useEffect(() => {
    if (transporterSignedOff) setUiTab("items");
  }, [transporterSignedOff]);

  const handleUiTabChange = useCallback((tab: ScanTab) => {
    setUiTab(tab);
    // Once transporter signed off, never drop back to dock box_verify (would re-enable sign-off).
    if (transporterSignedOff) {
      setPhase("item_verify");
      return;
    }
    // Before sign-off, Items is summary-only — keep dock phase so scan-box still counts at dock.
    if (tab === "boxes") setPhase("box_verify");
  }, [transporterSignedOff]);

  const resetScanUi = useCallback(() => {
    setScanState("idle");
    setScanReason(undefined);
    setLastScanCode("");
  }, []);

  const restartScanner = useCallback(() => {
    resetScanUi();
    setCameraKey((k) => k + 1);
  }, [resetScanUi]);

  const pendingBoxes = useMemo(() => {
    const q = boxQuery.trim().toLowerCase();
    const list = phase === "item_verify"
      ? boxes.filter(b => b.status !== "verified" && (b.status === "received" || b.status === "exception"))
      : boxes.filter(b => b.status !== "verified" && b.status !== "received" && b.status !== "exception");
    if (!q) return list;
    return list.filter(b => String(b.box_number).toLowerCase().includes(q));
  }, [boxes, phase, boxQuery]);
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
      let resumeId = po.resume_session_id ? Number(po.resume_session_id) : 0;
      // If pending-POs missed the link, resolve open session from packing-list list by PO name.
      if (!resumeId && po.name) {
        const pl = await api.packingListList();
        if (pl.ok && Array.isArray(pl.data)) {
          const match = (pl.data as any[]).find((s) => {
            const status = String(s.status || "").toLowerCase();
            if (["closed", "completed", "cancelled"].includes(status)) return false;
            const poNo = String(s.po_no || s.purchase_receipt_no || "").trim().toLowerCase();
            const grn = String(s.name || s.session_no || "").trim().toLowerCase();
            const target = po.name.trim().toLowerCase();
            return poNo === target || grn === target || String(s.packing_list_no || "").trim().toLowerCase() === target;
          });
          if (match?.id) resumeId = Number(match.id);
        }
      }
      if (resumeId) {
        const sr = await api.receivingStats(resumeId);
        if (sr.ok) {
          const boxes = Number(sr.data.total_boxes) || 0;
          if (boxes > 0) {
            setSid(resumeId);
            setStats(sr.data);
            if (sr.data.session_no) setSNo(sr.data.session_no);
            if (sr.data.phase === "item_verify") setPhase("item_verify");
            else setPhase("box_verify");
            setLoading(false);
            setStep("scan_box");
            toast(`${sr.data.session_no || "Session"} · ${boxes} boxes`, "success");
            return;
          }
          setLoading(false);
          setError(
            `${sr.data.session_no || "This GRN"} is linked but has no box numbers yet. Open Receiving desk and re-import or approve the packing list.`,
          );
          return;
        }
      }
      setLoading(false);
      setError("This PO has no packing list / GRN yet, so there are no box numbers to receive. Upload the packing list first.");
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
      const nextAction = r.data.next_action as string;
      const nextItems: BoxItem[] = r.data.items || items;
      const bn = r.data.box_number || snapshot.box_number;
      if (nextAction === "already_verified") {
        toast(r.data.message || "Already item-verified — closed for re-scan", "warning");
        refreshProg();
        return true;
      }
      if (nextAction === "already_scanned") {
        toast(r.data.message || "Already counted at the dock", "warning");
        refreshProg();
        return true;
      }
      if (condition === "damaged" || nextAction === "scan_items" || r.data.damaged) {
        setLastOkBox(null);
        setCurBox({
          box_number: bn,
          items: nextItems,
          damaged: condition === "damaged" || !!r.data.damaged,
        });
        setStep("scan_items");
        toast(r.data.message || (condition === "damaged" ? "Damaged — scan items" : "Scan items"), "warning");
      } else {
        setLastOkBox({ ...snapshot, box_number: bn, items: nextItems });
        toast(r.data.message || `${bn} accepted`, "success");
        setHist(p => [{ box_number: bn, auto_completed: true, message: "Box OK", timestamp: new Date(), status: "success" }, ...p.slice(0, 4)]);
        const dp = r.data.delivery_progress;
        if (!transporterSignedOff && dp && dp.boxes_total > 0 && dp.boxes_received >= dp.boxes_total) {
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
  }, [sid, toast, refreshProg, transporterSignedOff]);

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
        toast(r.data.message || "Already item-verified — closed for re-scan", "warning");
        refreshProg();
        return true;
      }
      if (next === "already_scanned") {
        doFlash("success");
        toast(r.data.message || "Already counted at the dock", "warning");
        refreshProg();
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

  const onBoxScan = useCallback(async (code: string): Promise<boolean> => {
    setLastScanCode(code);
    const ok = await handleBoxScan(code);
    if (ok) {
      setScanReason(undefined);
      setScanState("accepted");
      setTimeout(() => setScanState("idle"), 900);
    } else {
      setScanState("rejected");
      setTimeout(() => setScanState("idle"), 1200);
    }
    return ok;
  }, [handleBoxScan]);

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
    if (transporterSignedOff) {
      toast("Transporter already signed off — continue item verification", "warning");
      setShowSignOff(false);
      setPhase("item_verify");
      setUiTab("items");
      return;
    }
    setLoading(true);
    try {
      const r = await api.receivingSignOffBoxes({ session_id: sid });
      setLoading(false);
      if (!r.ok) { toast(r.error || "Failed", "error"); return; }
      setShowSignOff(false);
      setPhase("item_verify");
      setUiTab("items");
      setStats((prev) =>
        prev
          ? {
              ...prev,
              phase: "item_verify",
              session_status: (r.data.status as string) || "item_verification",
              boxes_received: r.data.boxes_received ?? prev.boxes_received,
              boxes_verified: r.data.boxes_verified ?? prev.boxes_verified,
              total_boxes: r.data.boxes_total ?? prev.total_boxes,
            }
          : prev,
      );
      const already = !!r.data.already_signed;
      toast(r.data.message || "Transporter signed off", already ? "warning" : "success");
      refreshProg();
    } catch (e: any) { setLoading(false); toast(e.message || "Failed", "error"); }
  }, [sid, toast, refreshProg, transporterSignedOff]);

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
        if (phase === "box_verify" && !transporterSignedOff && dp && dp.boxes_total > 0 && dp.boxes_received >= dp.boxes_total) {
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
  }, [sid, curBox, phase, toast, refreshProg, transporterSignedOff]);

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

  const onItemScanUi = async (code: string): Promise<boolean> => {
    setLastScanCode(code);
    const ok = await handleItemScan(code);
    if (ok) {
      setScanReason(undefined);
      setScanState("accepted");
      setTimeout(() => setScanState("idle"), 900);
    } else {
      setScanState("rejected");
      setTimeout(() => setScanState("idle"), 1200);
    }
    return ok;
  };

  useEffect(() => {
    if (step !== "scan_items" || !curBox || loading || curBox.damaged) return;
    if (!boxItemsMatched(curBox.items)) return;
    if (autoClosedRef.current === curBox.box_number) return;
    autoClosedRef.current = curBox.box_number;
    void completeBox(curBox.box_number);
  }, [step, curBox, loading, completeBox]);

  const emptyBoxList = boxes.length === 0;
  const totalBoxes = cnt.total || stats?.total_boxes || 0;
  const counted =
    phase === "item_verify"
      ? (cnt.total > 0 ? cnt.verified : (stats?.boxes_verified ?? 0))
      : (cnt.total > 0 ? cnt.received : (stats?.boxes_received ?? 0));
  const itemsComplete = phase === "item_verify" && totalBoxes > 0 && counted >= totalBoxes;

  const finalizeForPutaway = useCallback(async () => {
    if (!sid || finalizing) return;
    setFinalizing(true);
    setError("");
    try {
      const scanned = Number(stats?.total_qty_scanned) || 0;
      if (scanned <= 0) {
        // Refresh stats once — box list may have scanned qty the summary missed.
        const sr = await api.receivingStats(sid);
        if (sr.ok) setStats(sr.data);
        const again = Number(sr.ok ? sr.data?.total_qty_scanned : 0) || 0;
        if (again <= 0) {
          toast("No scanned units on this GRN — scan item QR codes before posting stock", "error");
          setFinalizing(false);
          return;
        }
      }
      const ver = await api.grnCompleteVerification(sid);
      if (!ver.ok && !/already|putaway|complete/i.test(String(ver.error || ""))) {
        // Still try finalize when status is already putaway_pending / item_verification
        if (!/verification|status/i.test(String(ver.error || ""))) {
          toast(ver.error || "Could not complete verification", "error");
          setFinalizing(false);
          return;
        }
      }
      const fin = await api.grnFinalize(sid);
      if (!fin.ok) {
        toast(fin.error || "Finalize failed — resolve exceptions or retry", "error");
        setFinalizing(false);
        return;
      }
      const posted = Number((fin.data as any)?.posted?.posted_incoming ?? (fin.data as any)?.posted?.incoming ?? 0);
      toast(posted > 0 ? `Stock posted · ${posted} units → Putaway` : "GRN finalized — opening Putaway", "success");
      navigate("/putaway-runner");
    } catch (e: any) {
      toast(e?.message || "Finalize failed", "error");
    }
    setFinalizing(false);
  }, [sid, finalizing, stats, toast, navigate]);

  const statsBoxes: QueueBox[] = useMemo(
    () =>
      boxes.map((b: any) => ({
        id: String(b.box_number),
        items: b.item_count || 0,
        units: b.total_qty || 0,
        scannedUnits: Number(b.scanned_qty) || 0,
        status:
          b.status === "verified"
            ? ("counted" as const)
            : b.condition && b.condition !== "ok"
              ? ("damaged" as const)
              : b.status === "received" || b.status === "exception"
                ? ("counted" as const)
                : ("pending" as const),
      })),
    [boxes],
  );

  const queueBoxes: QueueBox[] = useMemo(
    () =>
      pendingBoxes.map((b: any) => ({
        id: String(b.box_number),
        items: b.item_count || 0,
        units: b.total_qty || 0,
        status: "pending" as const,
      })),
    [pendingBoxes],
  );

  return (
    <div className={`rw-page${step === "scan_box" || step === "scan_items" ? " rw-scan-shell" : ""}`}>
      {flash && <div className={`rw-scan-flash ${flash}`} />}

      {step === "select_po" && <>
        <div className="rw-header"><div className="rw-header-info"><div className="rw-header-session">Receiving</div><div className="rw-header-po">Select PO / GRN to receive</div></div></div>
        <div className="rw-po-list">
          <input
            className="rw-po-search"
            type="search"
            value={poQuery}
            onChange={(e) => setPoQuery(e.target.value)}
            placeholder="Search PO, GRN, packing list, supplier…"
            autoComplete="off"
          />
          {pendingError && <div className="rw-empty-msg" style={{ padding: 12 }} role="alert">{pendingError}</div>}
          {error && <div className="rw-empty-msg" style={{ padding: 12 }}>{error}</div>}
          {pendingLoading
            ? <div className="rw-empty" role="status"><div className="rw-empty-icon">⏳</div><div className="rw-empty-title">Loading receiving choices…</div></div>
            : filteredPOs.length === 0
              ? <div className="rw-empty"><div className="rw-empty-icon">📦</div><div className="rw-empty-title">{poQuery.trim() ? "No matches" : "No pending receipts"}</div><div className="rw-empty-msg">{poQuery.trim() ? "Try another PO / GRN / supplier" : "Import a packing list on the Receiving desk first"}</div></div>
            : <>
              {poMore.visible.map(po => {
                const canResume = !!(po.resume_session_id || (po.open_sessions && po.open_sessions > 0) || (po.total_boxes && po.total_boxes > 0));
                const metaParts = [
                  po.total_boxes ? `${po.total_boxes} boxes` : null,
                  po.item_count ? `${po.item_count} items` : null,
                  po.total_qty ? `${po.total_qty} units` : null,
                ].filter(Boolean);
                return (
                  <div key={`${po.name}-${po.resume_session_id ?? po.id}-${po.session_no || ""}`} className="rw-po-item" onClick={() => handleSelectPO(po)}>
                    <div className="rw-po-info">
                      <div className="rw-po-name">{po.name}</div>
                      {(po.session_no || po.packing_list_no) && (
                        <div className="rw-po-docs">
                          {po.session_no && <span>{po.session_no}</span>}
                          {po.session_no && po.packing_list_no && <span aria-hidden> · </span>}
                          {po.packing_list_no && <span>{po.packing_list_no}</span>}
                        </div>
                      )}
                      <div className="rw-po-supplier">{po.supplier_name || "—"}</div>
                      <div className="rw-po-meta">{metaParts.length ? metaParts.join(" · ") : "No packing list linked yet"}</div>
                    </div>
                    <span className={`rw-po-badge ${canResume ? "resume" : "start"}`}>{canResume ? "Resume" : "Start"}</span>
                  </div>
                );
              })}
              {poMore.hasMore && (
                <button
                  type="button"
                  className="scan-btn scan-btn-outline"
                  style={{ marginTop: 8, width: "100%" }}
                  onClick={poMore.loadMore}
                >
                  Load more ({poMore.remaining} left)
                </button>
              )}
            </>}
        </div>
      </>}

      {step === "scan_box" && (
        <ScannerLayout
          title={phase === "item_verify" ? "Item verification" : "Box verification"}
          hideHeader
          noBack
          flash={scanState === "rejected" || flash === "error" ? "err" : scanState === "accepted" || flash === "success" ? "ok" : null}
        >
          <VerificationHeader
            counted={counted}
            total={totalBoxes}
            po={stats?.po_name || selPO?.name || "—"}
            pl={stats?.packing_list_no || "—"}
            grn={sNo || stats?.session_no || "—"}
            tab={uiTab}
            onTabChange={handleUiTabChange}
            onBack={() => setStep("select_po")}
            title={phase === "item_verify" ? "Item verification" : "Box verification"}
            itemsDisabled={cnt.received < 1 && (stats?.boxes_received ?? 0) < 1}
          />

          {(uiTab === "boxes" || (uiTab === "items" && phase === "item_verify" && !itemsComplete)) && (
            <>
              {!itemsComplete && (
                <ScanCard
                  state={scanState}
                  code={lastScanCode || queueBoxes[0]?.id || ""}
                  reason={scanReason}
                  onMarkDamaged={() => { void markLastDamaged(); }}
                  canMarkDamaged={!!lastOkBox && scanState === "idle" && phase === "box_verify" && !transporterSignedOff}
                  markDamagedLabel={lastOkBox ? `Mark damaged · ${cut(lastOkBox.box_number, 14)}` : "Mark damaged"}
                  onRestart={restartScanner}
                  onManualEntry={(code) => { void onBoxScan(code); }}
                  placeholder={phase === "item_verify" ? "Type box number to verify items" : "Type box number"}
                  viewport={
                    <div className="scan-live-viewport">
                      <CameraScanner
                        key={`${uiTab}-${cameraKey}`}
                        embedded
                        minimal
                        open
                        onClose={() => {}}
                        onScan={(code) => onBoxScan(code)}
                      />
                    </div>
                  }
                />
              )}

              {emptyBoxList ? (
                <div className="scan-empty">
                  <div className="scan-empty-icon">📦</div>
                  <div className="scan-empty-title">No boxes to suggest</div>
                  <div className="scan-empty-msg">Upload the packing list, or type a box number above.</div>
                  <button className="scan-btn scan-btn-primary" style={{ marginTop: 12, width: "auto" }} type="button" onClick={() => navigate("/receiving-management")}>
                    Upload Packing List
                  </button>
                </div>
              ) : queueBoxes.length > 0 || boxQuery ? (
                <BoxQueue
                  boxes={queueBoxes}
                  query={boxQuery}
                  onQueryChange={setBoxQuery}
                  onDamaged={(id) => { void markBoxDamaged(id); }}
                  onViewAll={() => setShowAll(true)}
                />
              ) : (
                <div className="scan-empty">
                  <div className="scan-empty-icon">✓</div>
                  <div className="scan-empty-title">
                    {itemsComplete
                      ? "All boxes item-verified"
                      : phase === "item_verify"
                        ? "No boxes waiting for item check"
                        : "All boxes counted"}
                  </div>
                  <div className="scan-empty-msg">
                    {itemsComplete
                      ? "Item verification is complete — post stock to release putaway."
                      : phase === "item_verify"
                        ? "Scan a box number to open it for item QR checks."
                        : transporterSignedOff
                          ? "Transporter signed off — switch to Items to verify contents."
                          : "Sign off the transporter to continue."}
                  </div>
                </div>
              )}

              {phase === "box_verify" && !transporterSignedOff && cnt.received > 0 && (
                <SignoffBar remaining={cnt.pendDock} onSignoff={() => setShowSignOff(true)} />
              )}

              {exc.length > 0 && (
                <div className="scan-badge warn" style={{ alignSelf: "center" }}>
                  ⚠ {exc.length} open exception{exc.length !== 1 ? "s" : ""}
                </div>
              )}
            </>
          )}

          {uiTab === "items" && (
            <ItemsPanel
              boxes={statsBoxes}
              itemMode={phase === "item_verify"}
              complete={itemsComplete}
              expectedOverride={stats?.total_qty_expected}
              receivedOverride={stats?.total_qty_scanned}
              onFinalizePutaway={itemsComplete ? () => { void finalizeForPutaway(); } : undefined}
              finalizing={finalizing}
            />
          )}
        </ScannerLayout>
      )}

      {step === "scan_items" && curBox && (() => {
        const matched = curBox.items.filter(it => Number(it.scanned_qty) >= Number(it.expected_qty)).length;
        const total = curBox.items.length;
        const isComplete = boxItemsMatched(curBox.items);
        return (
          <ScannerLayout title={curBox.damaged ? "Damaged box — items" : "Item verification"} hideHeader noBack flash={scanState === "rejected" ? "err" : scanState === "accepted" ? "ok" : flash === "error" ? "err" : flash === "success" ? "ok" : null}>
            <VerificationHeader
              counted={matched}
              total={total || 1}
              po={stats?.po_name || selPO?.name || "—"}
              pl={stats?.packing_list_no || "—"}
              grn={sNo || "—"}
              tab="boxes"
              onTabChange={() => {}}
              onBack={() => { setCurBox(null); setStep("scan_box"); resetScanUi(); }}
              title={curBox.damaged ? "Damaged box — items" : "Item verification"}
              itemsDisabled
            />

            {curBox.damaged && (
              <div className="scan-badge warn" style={{ marginBottom: 4 }}>
                Scan good items, or reject damaged units
              </div>
            )}

            <ScanCard
              state={scanState}
              code={lastScanCode || curBox.box_number}
              reason={scanReason}
              onMarkDamaged={() => {}}
              canMarkDamaged={false}
              showMarkDamaged={false}
              onRestart={restartScanner}
              onManualEntry={(code) => { void onItemScanUi(code); }}
              placeholder="Type item QR"
              viewport={
                <div className="scan-live-viewport">
                  <CameraScanner
                    key={`item-${cameraKey}-${curBox.box_number}`}
                    embedded
                    minimal
                    open
                    onClose={() => {}}
                    onScan={(code) => onItemScanUi(code)}
                  />
                </div>
              }
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button className="scan-btn scan-btn-outline" style={{ flex: 1 }} type="button" onClick={() => { void completeBox(); }} disabled={loading}>
                Close box
              </button>
              <button className="scan-btn scan-btn-primary" style={{ flex: 1 }} type="button" disabled={(!curBox.damaged && !isComplete) || loading} onClick={() => { void completeBox(); }}>
                {curBox.damaged && !isComplete ? "Finish inspection" : "Complete"}
              </button>
            </div>

            <section style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <div className="scan-section-title">Items in box ({total - matched} remaining)</div>
              {curBox.items.map(it => {
                const rejected = it.status === "damage";
                const itemDone = !rejected && it.scanned_qty >= it.expected_qty;
                return (
                  <div key={it.part_code} className={`scan-row${itemDone ? " ring-accent" : ""}`} style={{ cursor: "default" }}>
                    <div className="scan-row-info">
                      <div className="scan-row-code">{it.part_code}</div>
                      <div className="scan-row-desc">{it.part_name || "—"} · {it.scanned_qty}/{it.expected_qty} units</div>
                    </div>
                    <div className="scan-row-meta">
                      <div className="scan-row-qty">{rejected ? "—" : it.scanned_qty}</div>
                      <div className="scan-row-label">{rejected ? "Rejected" : itemDone ? "Done" : it.scanned_qty > 0 ? "Scanning" : "Pending"}</div>
                    </div>
                    {!rejected && !itemDone && (
                      <button type="button" className="scan-btn scan-btn-outline scan-btn-sm" style={{ width: "auto", minHeight: 36 }} disabled={loading} onClick={() => { void rejectItem(it.part_code); }}>
                        Reject
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          </ScannerLayout>
        );
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
              return <div key={box.id || box.box_number} className="rw-box-row" data-status={st} onClick={() => {
                setShowAll(false);
                if (isVerified) {
                  toast("Already item-verified — closed for re-scan", "warning");
                  return;
                }
                void handleBoxScan(box.box_number);
              }}>
                <div className="rw-box-row-dot" />
                <div className="rw-box-row-info"><div className="rw-box-row-num">{cut(box.box_number, 24)}</div><div className="rw-box-row-meta">{box.item_count || 0} items · {box.scanned_qty || 0}/{box.total_qty || 0} units</div></div>
                <span className="rw-box-row-badge">{badge}</span>
                {!isVerified && !transporterSignedOff && (
                  <button type="button" className="rw-box-row-dmg" onClick={(e) => { e.stopPropagation(); setShowAll(false); void markBoxDamaged(box.box_number); }}>Damaged</button>
                )}
              </div>;
            })}
          </div>
        </div>
      </>}

      {showSignOff && !transporterSignedOff && createPortal(
        <div className="rw-confirm-overlay" onClick={() => !loading && setShowSignOff(false)} role="presentation">
          <div className="rw-confirm-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="rw-confirm-kicker">Transporter sign-off</div>
            <div className="rw-confirm-boxno">{cnt.received} / {totalBoxes}</div>
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
