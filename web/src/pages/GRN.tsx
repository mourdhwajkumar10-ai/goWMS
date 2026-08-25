import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, getRole } from "../services/api";
import "../styles/grn-wizard.css";
import { notify } from "../components/Notifications";
import ListPager from "../components/ListPager";
import { useClientPager } from "../hooks/useClientPager";

/* ─── Helpers ─── */

function specStatusLabel(status?: string) {
  const s = (status || "").toLowerCase().trim();
  const map: Record<string, string> = {
    open: "OPEN",
    draft: "DRAFT",
    receiving: "RECEIVING",
    ready_to_receive: "READY TO RECEIVE",
    box_reconciliation: "BOX_RECONCILIATION",
    item_verification: "ITEM_VERIFICATION",
    exception_pending: "EXCEPTION_PENDING",
    item_verification_complete: "ITEM_VERIFICATION_COMPLETE",
    putaway_pending: "PUTAWAY_PENDING",
    putaway_in_progress: "PUTAWAY_IN_PROGRESS",
    closed: "COMPLETED",
    completed: "COMPLETED",
  };
  return map[s] || (status || "OPEN").toUpperCase();
}

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  const cls =
    s === "completed" || s === "closed" || s === "full_match"
      ? "erpnext-badge-blue"
      : s === "exception_pending" || s === "stuck" || s === "shortage" || s === "damage"
        ? "erpnext-badge-red"
        : s === "receiving" || s === "open" || s === "ready_to_receive"
          ? "erpnext-badge-green"
          : "erpnext-badge-yellow";
  return <span className={`erpnext-badge ${cls}`}>{specStatusLabel(status)}</span>;
}

/* ─── Import Summary type ─── */
interface ImportSummary {
  grn_session_id: number;
  session_no: string;
  import_summary: {
    rows_imported?: number;
    rows_skipped?: number;
    total_boxes?: number;
    total_qty?: number;
    cartons_created?: number;
    lines_created?: number;
  };
}

/* ─── Component ─── */

export default function GRN() {
  const navigate = useNavigate();
  const role = (getRole() || "").toLowerCase();
  const isAdmin = role === "admin" || role === "wm";

  // Data
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionItems, setSessionItems] = useState<any[]>([]);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [transporter, setTransporter] = useState("");
  const [arrivalTime, setArrivalTime] = useState(new Date().toISOString().slice(0, 16));
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  // Transport autocomplete
  const [transports, setTransports] = useState<any[]>([]);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [showTruckDropdown, setShowTruckDropdown] = useState(false);
  const driverDropdownRef = useRef<HTMLDivElement>(null);
  const truckDropdownRef = useRef<HTMLDivElement>(null);

  // Detail modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailSession, setDetailSession] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Load data ───
  const loadSessions = () =>
    api.grnSessions().then((r) => {
      if (r.ok) setSessions(r.data ?? []);
    });

  useEffect(() => {
    loadSessions();
    api.transportsList().then((r) => {
      if (r.ok) setTransports(r.data || []);
    });
  }, []);

  const selectTransport = (t: any) => {
    setDriverName(t.driver_name || "");
    setDriverPhone(t.driver_phone || "");
    setTransporter(t.transporter || t.truck_no || "");
    setShowDriverDropdown(false);
    setShowTruckDropdown(false);
  };

  const searchTransports = async (q: string) => {
    const res = await api.transportsList(q);
    if (res.ok) setTransports(res.data || []);
  };

  // ─── Upload packing list ───
  const handleUpload = async () => {
    if (!uploadFile) {
      notify({ type: "error", title: "No file selected", message: "Please select an XLSX file" });
      return;
    }
    setUploading(true);
    try {
      const res = await api.packingListImportFile(uploadFile, driverName, driverPhone, transporter);
      setUploading(false);
      if (res.ok) {
        const summary = res.data as ImportSummary;
        setImportResult(summary);
        notify({
          type: "success",
          title: "✅ Packing List Imported Successfully!",
          message: `${summary.session_no}: ${summary.import_summary?.rows_imported || summary.import_summary?.lines_created || 0} items, ${summary.import_summary?.total_boxes || summary.import_summary?.cartons_created || 0} boxes created`,
        });
        // Reset form
        setUploadFile(null);
        setDriverName("");
        setDriverPhone("");
        setTransporter("");
        setArrivalTime(new Date().toISOString().slice(0, 16));
        loadSessions();
      } else {
        notify({ type: "error", title: "Import Failed", message: res.error || "Unknown error" });
      }
    } catch (e: any) {
      setUploading(false);
      notify({ type: "error", title: "Import Failed", message: e.message || "Network error" });
    }
  };

  // ─── Approve packing list ───
  const handleApprove = async (id: number) => {
    const res = await api.packingListApprove(id);
    if (res.ok) {
      notify({ type: "success", title: "Packing List Approved", message: "Status updated to Ready to Receive" });
      loadSessions();
      if (detailSession?.id === id) {
        setDetailSession({ ...detailSession, status: "receiving" });
      }
    } else {
      notify({ type: "error", title: "Approval Failed", message: res.error || "" });
    }
  };

  // ─── Open detail modal ───
  const openDetail = async (session: any) => {
    setShowDetailModal(true);
    setDetailLoading(true);
    setDetailSession(session);
    // Load items via the management endpoint
    const res = await api.packingListGet(session.id);
    if (res.ok && res.data) {
      setDetailItems(res.data.items || []);
      setDetailSession({ ...session, ...res.data });
    }
    setDetailLoading(false);
  };

  // ─── Start receiving ───
  const handleStartReceiving = (sessionId: number) => {
    navigate(`/receiving?session_id=${sessionId}`);
  };

  // ─── Filtered sessions ───
  const filteredSessions = useMemo(() => {
    return sessions.filter((s: any) => {
      const matchesSearch =
        !searchQuery ||
        (s.session_no || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.supplier_name || s.supplier || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.purchase_receipt_no || s.po_no || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.packing_list_no || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || (s.status || "").toLowerCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sessions, searchQuery, statusFilter]);

  const sessionPager = useClientPager(filteredSessions);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sessions.length };
    sessions.forEach((s: any) => {
      const st = (s.status || "open").toLowerCase();
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [sessions]);

  // ─── Render ───
  return (
    <div className="desk-page space-y-3">
      <div className="page-head desk-page-head">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <h1 className="page-title">Receiving Management</h1>
          <p className="page-sub">Upload, manage, and approve packing lists</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="erpnext-btn-primary"
            onClick={() => {
              setImportResult(null);
              setShowUploadModal(true);
            }}
          >
            + Upload Packing List
          </button>
        </div>
      </div>

        {/* Import Success Banner */}
        {importResult && (
          <div
            className="p-3 rounded-lg"
            style={{ background: "#d4edda", border: "1px solid #28a745" }}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-sm" style={{ color: "#155724" }}>
                  Packing List Imported Successfully
                </div>
                <div className="text-sm mt-1" style={{ color: "#155724" }}>
                  <div>
                    <strong>Session:</strong> {importResult.session_no}
                  </div>
                  <div>
                    <strong>Rows Imported:</strong>{" "}
                    {importResult.import_summary?.rows_imported ||
                      importResult.import_summary?.lines_created ||
                      0}
                  </div>
                  <div>
                    <strong>Boxes Created:</strong>{" "}
                    {importResult.import_summary?.total_boxes ||
                      importResult.import_summary?.cartons_created ||
                      0}
                  </div>
                  {importResult.import_summary?.rows_skipped ? (
                    <div>
                      <strong>Rows Skipped:</strong> {importResult.import_summary.rows_skipped}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="page-actions">
                <button
                  className="erpnext-btn-primary text-xs"
                  onClick={() => handleStartReceiving(importResult.grn_session_id)}
                >
                  Start Receiving →
                </button>
                <button
                  className="erpnext-btn-secondary text-xs"
                  onClick={() => setImportResult(null)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ═══ Packing Lists Table ═══ */}
      <div className="erpnext-card desk-list-card">
        <div className="desk-filter-bar" style={{ padding: "8px 12px 0" }}>
          <div className="desk-seg" role="tablist" aria-label="Session status">
            {[
              ["all", "All"],
              ["open", "Open"],
              ["receiving", "Receiving"],
              ["completed", "Done"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={statusFilter === key}
                className={`desk-seg-item${statusFilter === key ? " is-active" : ""}`}
                onClick={() => setStatusFilter(key)}
              >
                {label} ({statusCounts[key] || 0})
              </button>
            ))}
          </div>
          <input
            className="erpnext-input desk-filter-search"
            placeholder="Search session, supplier, PO…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search packing lists"
          />
        </div>
        <div className="p-3 desk-table-scroll">
          <table className="erpnext-table text-sm desk-table">
            <thead>
              <tr style={{ background: "var(--panel-2)" }}>
                <th>PO</th>
                <th>Packing List</th>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Driver</th>
                <th className="text-right">Boxes</th>
                <th className="text-right">Items</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessionPager.pageItems.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.po_no || s.purchase_receipt_no || "—"}</td>
                  <td>{s.packing_list_no || "—"}</td>
                  <td className="font-medium" style={{ color: "var(--accent)" }}>
                    {s.session_no}
                  </td>
                  <td>{s.supplier_name || s.supplier || "—"}</td>
                  <td>
                    {s.driver_name || "—"}
                    {s.driver_phone ? ` (${s.driver_phone})` : ""}
                  </td>
                  <td className="text-right">
                    {s.boxes_received ?? 0}/{s.box_count ?? s.boxes_total ?? 0}
                  </td>
                  <td className="text-right">
                    {s.items_scanned ?? 0}/{s.item_count ?? 0}
                  </td>
                  <td>{statusBadge(s.status)}</td>
                  <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openDetail(s)}
                        className="erpnext-btn-secondary text-xs"
                      >
                        View
                      </button>
                      {(s.status === "open" || s.status === "draft" || s.status === "pending_approval") && isAdmin && (
                        <button
                          onClick={() => handleApprove(s.id)}
                          className="erpnext-btn-primary text-xs"
                          style={{ background: "#28a745" }}
                        >
                          Approve
                        </button>
                      )}
                      {(s.status === "receiving" || s.status === "open") && (
                        <button
                          onClick={() => handleStartReceiving(s.id)}
                          className="erpnext-btn-primary text-xs"
                        >
                          Start Receiving
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sessionPager.total === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12" style={{ color: "var(--text-dim)" }}>
                    <div className="text-lg mb-2">No packing lists found</div>
                    <div className="text-sm">
                      Click "+ Upload Packing List" to get started
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <ListPager pager={sessionPager} placeholder="" />
        </div>
      </div>

      {/* ═══ Upload Modal ═══ */}
      {showUploadModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="erpnext-card"
            style={{ width: 560, maxWidth: "95vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}
            >
              <h3 className="text-lg font-semibold">📦 Upload Packing List</h3>
              <button
                className="erpnext-btn-secondary text-xs"
                onClick={() => setShowUploadModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium mb-1">Packing List File (.xlsx)</label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer"
                  style={{ borderColor: uploadFile ? "#28a745" : "var(--border)" }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                  {uploadFile ? (
                    <div>
                      <div className="text-lg">📄 {uploadFile.name}</div>
                      <div className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
                        {(uploadFile.size / 1024).toFixed(1)} KB — Click to change
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-lg" style={{ color: "var(--text-dim)" }}>
                        📁 Click to select file
                      </div>
                      <div className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
                        Supports .xlsx format with columns: Box Number, Part Code, Qty
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Driver Information */}
              <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <div className="text-sm font-medium mb-3" style={{ color: "var(--text-dim)" }}>
                  🚚 Driver Information (Select from Transport Master)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative" ref={driverDropdownRef}>
                    <label className="block text-sm mb-1">Driver Name</label>
                    <input
                      className="erpnext-input w-full"
                      placeholder="Type to search driver..."
                      value={driverName}
                      onChange={(e) => { setDriverName(e.target.value); searchTransports(e.target.value); setShowDriverDropdown(true); }}
                      onFocus={() => { setShowDriverDropdown(true); searchTransports(driverName); }}
                      onBlur={() => setTimeout(() => setShowDriverDropdown(false), 200)}
                      autoComplete="off"
                    />
                    {showDriverDropdown && transports.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg border" style={{ background: "var(--panel)", borderColor: "var(--border)", maxHeight: 200, overflowY: "auto" }}>
                        {transports
                          .filter((t: any) => t.driver_name && (!driverName || t.driver_name.toLowerCase().includes(driverName.toLowerCase()) || t.driver_phone?.includes(driverName)))
                          .slice(0, 10)
                          .map((t: any) => (
                            <button
                              key={t.id}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100"
                              style={{ borderBottom: "1px solid var(--border)" }}
                              onMouseDown={(e) => { e.preventDefault(); selectTransport(t); }}
                            >
                              <div className="font-medium text-sm">{t.driver_name}</div>
                              <div className="text-xs" style={{ color: "var(--text-dim)" }}>{t.driver_phone || ""} · {t.transporter || t.truck_no || ""}</div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Driver Phone</label>
                    <input
                      className="erpnext-input w-full"
                      placeholder="e.g. +91 98765 43210"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                    />
                  </div>
                  <div className="relative" ref={truckDropdownRef}>
                    <label className="block text-sm mb-1">Truck / Transporter</label>
                    <input
                      className="erpnext-input w-full"
                      placeholder="Type to search truck..."
                      value={transporter}
                      onChange={(e) => { setTransporter(e.target.value); searchTransports(e.target.value); setShowTruckDropdown(true); }}
                      onFocus={() => { setShowTruckDropdown(true); searchTransports(transporter); }}
                      onBlur={() => setTimeout(() => setShowTruckDropdown(false), 200)}
                      autoComplete="off"
                    />
                    {showTruckDropdown && transports.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-lg shadow-lg border" style={{ background: "var(--panel)", borderColor: "var(--border)", maxHeight: 200, overflowY: "auto" }}>
                        {transports
                          .filter((t: any) => !transporter || t.truck_no?.toLowerCase().includes(transporter.toLowerCase()) || t.transporter?.toLowerCase().includes(transporter.toLowerCase()))
                          .slice(0, 10)
                          .map((t: any) => (
                            <button
                              key={t.id}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100"
                              style={{ borderBottom: "1px solid var(--border)" }}
                              onMouseDown={(e) => { e.preventDefault(); selectTransport(t); }}
                            >
                              <div className="font-medium text-sm">{t.truck_no} {t.name ? `(${t.name})` : ""}</div>
                              <div className="text-xs" style={{ color: "var(--text-dim)" }}>{t.transporter || ""} · Driver: {t.driver_name || "None"}</div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Arrival Time</label>
                    <input
                      className="erpnext-input w-full"
                      type="datetime-local"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div
              className="px-6 py-4 border-t flex items-center justify-end gap-2"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                className="erpnext-btn-secondary"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                }}
              >
                Cancel
              </button>
              <button
                className="erpnext-btn-primary"
                disabled={uploading || !uploadFile}
                onClick={handleUpload}
              >
                {uploading ? "Importing..." : "✅ Import Packing List"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {showDetailModal && detailSession && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="erpnext-card"
            style={{ width: 800, maxWidth: "95vw", maxHeight: "85vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h3 className="text-lg font-semibold">{detailSession.session_no}</h3>
                <div className="text-sm" style={{ color: "var(--text-dim)" }}>
                  {detailSession.supplier_name || "—"} ·{" "}
                  {detailSession.driver_name ? `Driver: ${detailSession.driver_name}` : "No driver assigned"}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {statusBadge(detailSession.status)}
                <button
                  className="erpnext-btn-secondary text-xs"
                  onClick={() => setShowDetailModal(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Summary Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-3 rounded" style={{ background: "var(--panel-2)" }}>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                    Total Boxes
                  </div>
                  <div className="text-xl font-bold">
                    {detailSession.total_boxes || detailSession.box_count || 0}
                  </div>
                </div>
                <div className="p-3 rounded" style={{ background: "var(--panel-2)" }}>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                    Total Items
                  </div>
                  <div className="text-xl font-bold">{detailSession.total_items || 0}</div>
                </div>
                <div className="p-3 rounded" style={{ background: "var(--panel-2)" }}>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                    Driver
                  </div>
                  <div className="text-lg font-medium">
                    {detailSession.driver_name || "—"}
                  </div>
                </div>
                <div className="p-3 rounded" style={{ background: "var(--panel-2)" }}>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                    Transporter
                  </div>
                  <div className="text-lg font-medium">
                    {detailSession.transporter || "—"}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="font-medium mb-2">
                Items ({detailItems.length})
              </div>
              {detailLoading ? (
                <div className="text-center py-6" style={{ color: "var(--text-dim)" }}>
                  Loading...
                </div>
              ) : detailItems.length > 0 ? (
                <table className="erpnext-table text-sm">
                  <thead>
                    <tr style={{ background: "var(--panel-2)" }}>
                      <th>Box</th>
                      <th>Part Code</th>
                      <th>Part Name</th>
                      <th className="text-right">Qty</th>
                      <th>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="font-medium">{item.box_number || "—"}</td>
                        <td>{item.part_code}</td>
                        <td>{item.part_name || "—"}</td>
                        <td className="text-right">{item.expected_qty}</td>
                        <td>{item.invoice_no || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-6" style={{ color: "var(--text-dim)" }}>
                  No items in this packing list
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div
              className="px-6 py-4 border-t flex items-center justify-end gap-2"
              style={{ borderColor: "var(--border)" }}
            >
              {(detailSession.status === "open" || detailSession.status === "draft") && isAdmin && (
                <button
                  className="erpnext-btn-primary"
                  style={{ background: "#28a745" }}
                  onClick={() => handleApprove(detailSession.id)}
                >
                  ✅ Approve &amp; Ready to Receive
                </button>
              )}
              <button
                className="erpnext-btn-primary"
                onClick={() => handleStartReceiving(detailSession.id)}
              >
                🚀 Start Receiving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
