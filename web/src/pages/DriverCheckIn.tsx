import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock3, Plus, Truck } from "lucide-react";
import api from "../services/api";
import TruckAutocomplete, { applyTransportMaster } from "../components/TruckAutocomplete";
import ListPager from "../components/ListPager";
import { useClientPager } from "../hooks/useClientPager";
import { notify } from "../components/Notifications";

type Visit = {
  id: number;
  truck_no: string;
  driver_name: string;
  driver_phone: string;
  transporter: string;
  dock: string;
  purchase_order_id: number;
  purchase_receipt_no: string;
  supplier_name: string;
  grn_session_id: number;
  grn_session_no: string;
  grn_status: string;
  status: string;
  planned_at: string;
  dock_at?: string | null;
  unloading_at?: string | null;
  box_verification_at?: string | null;
  signed_off_at?: string | null;
  notes: string;
  elapsed_seconds: number;
  timer_running: boolean;
};

type POOption = {
  id: number;
  name: string;
  supplier_name?: string;
  status?: string;
  per_received?: number;
  total_qty?: number;
  received_qty?: number;
  open_sessions?: number;
};

function poSearchRank(name: string, q: string) {
  const n = name.toLowerCase();
  const needle = q.toLowerCase();
  if (n === needle) return 0;
  if (n.startsWith(needle)) return 1;
  if (n.includes(needle)) return 2;
  return 3;
}

const STATUSES = [
  { key: "planned", label: "Planned" },
  { key: "dock", label: "Dock" },
  { key: "unloading", label: "Unloading" },
  { key: "box_verification", label: "Box verification" },
  { key: "signed_off", label: "Signed off" },
] as const;

const emptyForm = {
  purchase_order_id: 0,
  purchase_receipt_no: "",
  supplier_name: "",
  truck_no: "",
  driver_name: "",
  driver_phone: "",
  transporter: "",
  dock: "",
  notes: "",
  check_in_now: true,
};

function fmtElapsed(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function statusTone(status: string) {
  switch (status) {
    case "planned":
      return "erpnext-badge-yellow";
    case "dock":
    case "unloading":
      return "erpnext-badge-blue";
    case "box_verification":
      return "erpnext-badge-yellow";
    case "signed_off":
      return "erpnext-badge-green";
    case "cancelled":
      return "erpnext-badge-red";
    default:
      return "erpnext-badge-yellow";
  }
}

function liveElapsed(v: Visit, now: number) {
  if (!v.timer_running) return v.elapsed_seconds || 0;
  const start = v.dock_at || v.planned_at;
  if (!start) return v.elapsed_seconds || 0;
  const t = new Date(start).getTime();
  if (Number.isNaN(t)) return v.elapsed_seconds || 0;
  return Math.max(0, Math.floor((now - t) / 1000));
}

function isReceivablePO(po: POOption) {
  const st = String(po.status || "").toLowerCase();
  if (st === "completed" || st === "to bill" || st === "closed" || st === "cancelled") return false;
  if (Number(po.per_received || 0) >= 100) return false;
  const total = Number(po.total_qty || 0);
  const recv = Number(po.received_qty || 0);
  if (total > 0 && recv >= total) return false;
  return true;
}

export default function DriverCheckIn() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Visit[]>([]);
  const [filter, setFilter] = useState<"active" | "all" | "signed_off">("active");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [poQuery, setPoQuery] = useState("");
  const [pendingPOs, setPendingPOs] = useState<POOption[]>([]);
  const [poOpen, setPoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const poBoxRef = useRef<HTMLDivElement>(null);
  const poSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params =
      filter === "active"
        ? { active: true }
        : filter === "signed_off"
          ? { status: "signed_off" }
          : undefined;
    const r = await api.driverVisitsList(params);
    if (r.ok) setRows((r.data ?? []) as Visit[]);
  }, [filter]);

  const loadPendingPOs = useCallback(async (search?: string) => {
    const r = await api.receivingPendingPOs(search);
    if (!r.ok) return;
    setPendingPOs(((r.data ?? []) as POOption[]).filter(isReceivablePO));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPendingPOs();
  }, [loadPendingPOs]);

  useEffect(() => {
    if (!showNew) return;
    if (poSearchTimer.current) clearTimeout(poSearchTimer.current);
    poSearchTimer.current = setTimeout(() => {
      void loadPendingPOs(poQuery.trim() || undefined);
    }, 150);
    return () => {
      if (poSearchTimer.current) clearTimeout(poSearchTimer.current);
    };
  }, [poQuery, showNew, loadPendingPOs]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!poBoxRef.current?.contains(e.target as Node)) setPoOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const poResults = useMemo(() => {
    const q = poQuery.trim().toLowerCase();
    let list = pendingPOs;
    if (q) {
      list = pendingPOs.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          String(p.supplier_name || "").toLowerCase().includes(q),
      );
      list = [...list].sort((a, b) => {
        const ra = poSearchRank(a.name, q);
        const rb = poSearchRank(b.name, q);
        if (ra !== rb) return ra - rb;
        return b.id - a.id;
      });
    }
    return list.slice(0, 20);
  }, [pendingPOs, poQuery]);

  const selectPO = (po: POOption) => {
    setForm((f) => ({
      ...f,
      purchase_order_id: po.id,
      purchase_receipt_no: po.name,
      supplier_name: po.supplier_name || f.supplier_name,
    }));
    setPoQuery(po.name);
    setPoOpen(false);
  };

  const applyTransportFromMaster = (row: {
    truck_no?: string;
    driver_name?: string;
    driver_phone?: string;
    transporter?: string;
  }) => {
    setForm((f) => ({
      ...f,
      ...applyTransportMaster(row),
    }));
  };

  const pager = useClientPager(rows);

  const counts = useMemo(() => {
    const active = rows.filter((r) => !["signed_off", "cancelled"].includes(r.status)).length;
    const atDock = rows.filter((r) => ["dock", "unloading", "box_verification"].includes(r.status)).length;
    return { total: rows.length, active, atDock };
  }, [rows]);

  const save = async () => {
    if (!form.purchase_order_id) {
      notify({
        type: "warning",
        title: "PO required",
        message: "Select an open (not fully received) purchase order",
      });
      return;
    }
    if (!form.truck_no.trim()) {
      notify({ type: "warning", title: "Truck required", message: "Enter truck number to check in" });
      return;
    }
    setSaving(true);
    const r = await api.driverVisitCreate({
      purchase_order_id: form.purchase_order_id,
      purchase_receipt_no: form.purchase_receipt_no.trim(),
      supplier_name: form.supplier_name.trim(),
      truck_no: form.truck_no.trim(),
      driver_name: form.driver_name.trim(),
      driver_phone: form.driver_phone.trim(),
      transporter: form.transporter.trim(),
      dock: form.dock.trim(),
      notes: form.notes.trim(),
      check_in_now: form.check_in_now,
    });
    setSaving(false);
    if (!r.ok) {
      notify({ type: "error", title: "Check-in failed", message: r.error || "" });
      return;
    }
    notify({
      type: "success",
      title: "Driver checked in",
      message: `${form.truck_no} · ${form.purchase_receipt_no} — use Start receiving when ready`,
    });
    setForm(emptyForm);
    setPoQuery("");
    setShowNew(false);
    setFilter("active");
    void load();
  };

  const advance = async (id: number, status?: string) => {
    setBusyId(id);
    const r = await api.driverVisitAdvance(id, status ? { status } : { next: true });
    setBusyId(null);
    if (!r.ok) {
      notify({ type: "error", title: "Status update failed", message: r.error || "" });
      return;
    }
    void load();
  };

  const startReceiving = async (v: Visit) => {
    if (!v.purchase_order_id && !v.grn_session_id) {
      notify({ type: "warning", title: "No PO on visit", message: "Re-check-in with a purchase order selected" });
      return;
    }
    setBusyId(v.id);

    // Already linked — open that GRN; do not start a second session.
    if (v.grn_session_id) {
      if (v.status === "planned" || v.status === "dock") {
        await api.driverVisitAdvance(v.id, { status: "unloading" });
      }
      setBusyId(null);
      navigate(`/receiving?session_id=${v.grn_session_id}`);
      return;
    }

    const start = await api.receivingStart(v.purchase_order_id);
    if (!start.ok || !start.data?.id) {
      setBusyId(null);
      notify({ type: "error", title: "Could not start receiving", message: start.error || "" });
      return;
    }
    const sid = Number(start.data.id);
    await api.driverVisitLinkGRN(v.id, sid);
    await api.grnUpdate(sid, {
      truck_no: v.truck_no || undefined,
      driver_name: v.driver_name || undefined,
      driver_phone: v.driver_phone || undefined,
      dock: v.dock || undefined,
    });
    if (v.status === "planned" || v.status === "dock") {
      await api.driverVisitAdvance(v.id, { status: "unloading" });
    }
    setBusyId(null);
    notify({ type: "success", title: "Receiving opened", message: start.data.session_no || `GRN #${sid}` });
    navigate(`/receiving?session_id=${sid}`);
  };

  return (
    <div className="desk-page dci-page space-y-3">
      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <h1 className="page-title">Driver check-in</h1>
          <p className="page-sub">
            Open PO → check in truck → start receiving → sign off transporter (truck may leave)
          </p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/po" className="erpnext-btn-secondary">Purchase Order</Link>
          <Link to="/receiving" className="erpnext-btn-secondary">RF Scanner</Link>
          <button type="button" className="erpnext-btn-primary" onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Cancel" : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Plus size={16} /> Check in driver
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="erpnext-card p-4">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>On board</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.total}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Active</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.active}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>At dock / working</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.atDock}</div>
          </div>
        </div>
      </div>

      {showNew && (
        <div className="erpnext-card dci-form-card">
          <div className="card-header">
            <h2 className="text-lg font-semibold" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Truck size={18} /> New driver check-in
            </h2>
          </div>
          <div className="card-body space-y-5">
            <div className="form-section">
              <div className="form-section-title">1. Purchase order (open only)</div>
              <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
                Only POs still waiting to receive are listed. Fully received POs are hidden.{" "}
                <Link to="/po" style={{ color: "var(--accent)" }}>Create PO</Link> if needed.
              </p>
              <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
                <div className="form-control" ref={poBoxRef} style={{ position: "relative" }}>
                  <label className="erpnext-label">PO *</label>
                  <input
                    className="erpnext-input"
                    value={poQuery}
                    placeholder="Search open PO…"
                    onChange={(e) => {
                      setPoQuery(e.target.value);
                      setForm((f) => ({ ...f, purchase_order_id: 0, purchase_receipt_no: e.target.value }));
                      setPoOpen(true);
                    }}
                    onFocus={() => { void loadPendingPOs(poQuery.trim() || undefined); setPoOpen(true); }}
                    autoComplete="off"
                  />
                  {poOpen && (
                    <div
                      className="rounded-lg shadow-lg overflow-y-auto border"
                      style={{
                        position: "absolute", left: 0, right: 0, top: "100%", maxHeight: 220, zIndex: 30,
                        background: "var(--panel, var(--card))", borderColor: "var(--border)",
                      }}
                    >
                      {poResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs" style={{ color: "var(--text-dim)" }}>
                          No open POs to receive — create one under Purchase Order
                        </div>
                      ) : (
                        poResults.map((po) => (
                          <button
                            key={po.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm border-b last:border-0"
                            style={{ borderColor: "var(--border)", background: "transparent", cursor: "pointer" }}
                            onMouseDown={() => selectPO(po)}
                          >
                            <div style={{ fontWeight: 600 }}>{po.name}</div>
                            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                              {[po.supplier_name, po.status].filter(Boolean).join(" · ")}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Supplier</label>
                  <input
                    className="erpnext-input"
                    value={form.supplier_name}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                    placeholder="Filled from PO"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">2. Truck &amp; driver</div>
              <div className="form-grid dci-truck-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
                <div className="form-control">
                  <label className="erpnext-label">Truck no *</label>
                  <TruckAutocomplete
                    value={form.truck_no}
                    onChangeText={(v) => setForm((f) => ({ ...f, truck_no: v }))}
                    onSelect={(row) => applyTransportFromMaster(row)}
                    className="erpnext-input"
                    placeholder="MH-12-AB-1234"
                    matchField="truck_no"
                  />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Driver</label>
                  <TruckAutocomplete
                    value={form.driver_name}
                    onChangeText={(v) => setForm((f) => ({ ...f, driver_name: v }))}
                    onSelect={(row) => applyTransportFromMaster(row)}
                    className="erpnext-input"
                    placeholder="Driver name"
                    matchField="driver_name"
                  />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Driver phone</label>
                  <TruckAutocomplete
                    value={form.driver_phone}
                    onChangeText={(v) => setForm((f) => ({ ...f, driver_phone: v }))}
                    onSelect={(row) => applyTransportFromMaster(row)}
                    className="erpnext-input"
                    placeholder="Phone"
                    matchField="driver_phone"
                  />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Transporter</label>
                  <TruckAutocomplete
                    value={form.transporter}
                    onChangeText={(v) => setForm((f) => ({ ...f, transporter: v }))}
                    onSelect={(row) => applyTransportFromMaster(row)}
                    className="erpnext-input"
                    placeholder="Carrier / transporter"
                    matchField="transporter"
                  />
                </div>
                <div className="form-control">
                  <label className="erpnext-label">Dock</label>
                  <input className="erpnext-input" value={form.dock} onChange={(e) => setForm((f) => ({ ...f, dock: e.target.value }))} placeholder="Dock 1" autoComplete="off" />
                </div>
                <div className="form-control" style={{ gridColumn: "1 / -1" }}>
                  <label className="erpnext-label">Notes</label>
                  <input className="erpnext-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} autoComplete="off" />
                </div>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={form.check_in_now} onChange={(e) => setForm((f) => ({ ...f, check_in_now: e.target.checked }))} />
              Arrive at dock now (skip planned → start timer)
            </label>
            <div>
              <button type="button" className="erpnext-btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save check-in"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="erpnext-card p-4 space-y-3">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([
            ["active", "Active"],
            ["all", "All"],
            ["signed_off", "Signed off"],
          ] as const).map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? "erpnext-btn-primary" : "erpnext-btn-secondary"} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <ListPager pager={pager} placeholder="Search truck, driver, PO, GRN…" />
        </div>

        <div className="fu-table-wrap" style={{ overflowX: "auto" }}>
          <table className="erpnext-table text-sm">
            <thead>
              <tr>
                <th>Truck / driver</th>
                <th>PO / GRN</th>
                <th>Status</th>
                <th>Pipeline</th>
                <th>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Clock3 size={14} /> Timer
                  </span>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--text-dim)", padding: 24 }}>
                    No driver visits yet. Select an open PO, check in the truck, then Start receiving.
                  </td>
                </tr>
              )}
              {pager.pageItems.map((v: Visit) => {
                const rank = STATUSES.findIndex((s) => s.key === v.status);
                const next = rank >= 0 && rank < STATUSES.length - 1 ? STATUSES[rank + 1] : null;
                const canReceive = !["signed_off", "cancelled"].includes(v.status) && !!v.purchase_order_id;
                return (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 650 }}>{v.truck_no}</div>
                      <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                        {[v.driver_name, v.driver_phone].filter(Boolean).join(" · ") || "—"}
                      </div>
                      <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
                        {[v.transporter, v.dock ? `Dock ${v.dock}` : ""].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td>
                      <div>{v.purchase_receipt_no || "—"}</div>
                      <div style={{ color: "var(--text-dim)", fontSize: 12 }}>{v.supplier_name || "—"}</div>
                      {v.grn_session_id ? (
                        <Link to={`/receiving?session_id=${v.grn_session_id}`} style={{ color: "var(--accent)", fontSize: 12 }}>
                          {v.grn_session_no || `GRN #${v.grn_session_id}`}
                          {v.grn_status ? ` · ${v.grn_status}` : ""}
                        </Link>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>No GRN linked yet</div>
                      )}
                    </td>
                    <td>
                      <span className={`erpnext-badge ${statusTone(v.status)}`}>
                        {v.status === "signed_off" ? "signed off · may leave" : v.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {STATUSES.map((s, i) => {
                          const done = rank >= i;
                          const current = rank === i;
                          return (
                            <span
                              key={s.key}
                              title={s.label}
                              style={{
                                fontSize: 10,
                                padding: "2px 6px",
                                borderRadius: 4,
                                border: "1px solid var(--border)",
                                background: current
                                  ? "var(--accent)"
                                  : done
                                    ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                                    : "transparent",
                                color: current ? "#fff" : "var(--text-dim)",
                                fontWeight: current ? 700 : 500,
                              }}
                            >
                              {s.label}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {fmtElapsed(liveElapsed(v, now))}
                      {v.timer_running ? (
                        <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 6 }}>live</span>
                      ) : null}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {canReceive && (
                          <button
                            type="button"
                            className="erpnext-btn-primary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={busyId === v.id}
                            onClick={() => void startReceiving(v)}
                          >
                            {v.grn_session_id ? "Open receiving" : "Start receiving"}
                          </button>
                        )}
                        {v.status === "signed_off" && (
                          <span style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "center" }}>
                            Transport may leave
                          </span>
                        )}
                        {next && v.status !== "signed_off" && (
                          <button
                            type="button"
                            className="erpnext-btn-secondary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={busyId === v.id}
                            onClick={() => void advance(v.id)}
                          >
                            → {next.label}
                          </button>
                        )}
                        {v.status !== "signed_off" && v.status !== "cancelled" && (
                          <button
                            type="button"
                            className="erpnext-btn-secondary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            disabled={busyId === v.id}
                            onClick={() => void advance(v.id, "cancelled")}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .dci-page .dci-form-card { padding: 0; overflow: visible; }
        .dci-page .dci-form-card .card-header { padding: 12px 16px; border-bottom: 1px solid var(--border); }
        .dci-page .dci-form-card .card-body { padding: 16px; }
        .dci-page .form-section-title {
          font-size: 12px; font-weight: 650; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px;
        }
        .dci-page .form-control .erpnext-label {
          display: block;
          margin-bottom: 6px;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.2;
          color: var(--text-dim);
        }
        /* Autocomplete wrapper must fill the cell so truck field matches peers */
        .dci-page .form-control > .relative { display: block; width: 100%; }
        .dci-page .form-control .erpnext-input,
        .dci-page .form-control input.erpnext-input,
        .dci-page .form-control .relative > input.erpnext-input {
          box-sizing: border-box !important;
          width: 100% !important;
          height: 40px !important;
          min-height: 40px !important;
          max-height: 40px !important;
          padding: 0 12px !important;
          border: 1px solid var(--border, #d1d8dd) !important;
          border-radius: 8px !important;
          background: var(--card) !important;
          color: var(--text-color) !important;
          font-family: inherit !important;
          font-size: 14px !important;
          font-weight: 400 !important;
          line-height: 40px !important;
          box-shadow: none !important;
        }
        .dci-page .form-control .erpnext-input:focus,
        .dci-page .form-control input.erpnext-input:focus,
        .dci-page .form-control .relative > input.erpnext-input:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 3px oklch(0.56 0.18 250 / 0.12) !important;
          outline: none;
        }
        .dci-page .form-control .erpnext-input::placeholder {
          font-size: 14px;
          font-weight: 400;
          color: var(--text-dim);
        }
        /* Autofill must not change chrome height/type */
        .dci-page .form-control input.erpnext-input:-webkit-autofill,
        .dci-page .form-control input.erpnext-input:-webkit-autofill:hover,
        .dci-page .form-control input.erpnext-input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--text-color) !important;
          box-shadow: 0 0 0 1000px var(--card) inset !important;
          transition: background-color 99999s ease-out;
          height: 40px !important;
          min-height: 40px !important;
          max-height: 40px !important;
          font-size: 14px !important;
          font-weight: 400 !important;
        }
      `}</style>
    </div>
  );
}
