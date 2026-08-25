import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PackageOpen, ClipboardList, CheckSquare, PackageCheck, Truck, Box } from "lucide-react";
import api from "../services/api";

interface DashboardData {
  TotalItems: number;
  TotalStock: number;
  PendingGRN: number;
  OpenPickLists: number;
  PendingBackorders: number;
  DueCycleCounts: number;
}

const shortcuts = [
  { to: "/grn", label: "Receive (GRN)", desc: "Goods receipt against PO", Icon: PackageOpen },
  { to: "/po", label: "Purchase Order", desc: "Create / submit buying docs", Icon: ClipboardList },
  { to: "/pick", label: "Pick List", desc: "Pick against sales orders", Icon: CheckSquare },
  { to: "/pack", label: "Packing", desc: "Pack picked items", Icon: PackageCheck },
  { to: "/dispatch", label: "Dispatch", desc: "Load and ship trips", Icon: Truck },
  { to: "/items", label: "Item", desc: "Item master", Icon: Box },
] as const;

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<DashboardData>("/analytics/dashboard")
      .then((r) => {
        if (r.ok) setData(r.data);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const kpis = data
    ? [
        { label: "Total Items", value: data.TotalItems, cls: "" },
        { label: "Total Stock Qty", value: data.TotalStock, cls: "accent" },
        { label: "Pending GRN", value: data.PendingGRN, cls: "amber" },
        { label: "Open Pick Lists", value: data.OpenPickLists, cls: "green" },
        { label: "Pending Backorders", value: data.PendingBackorders, cls: "red" },
        { label: "Due Cycle Counts", value: data.DueCycleCounts, cls: "amber" },
      ]
    : [];

  return (
    <div className="desk-page space-y-3">
      <div className="page-head">
        <div>
          <span className="page-eyebrow">Overview</span>
          <h1 className="page-title">Home</h1>
          <p className="page-sub">Warehouse operations overview</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ marginBottom: 48 }}>
        <h2>Number cards</h2>
        <div className="grid cols-3">
          {kpis.map((k) => (
            <div className={`card kpi ${k.cls}`} key={k.label}>
              <span className="value">{k.value ?? "—"}</span>
              <span className="label">{k.label}</span>
            </div>
          ))}
          {!data && !error && (
            <>
              {[1, 2, 3].map((i) => (
                <div className="card kpi" key={i}>
                  <span className="value" style={{ color: "var(--gray-300)" }}>…</span>
                  <span className="label">Loading</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div>
        <h2>Shortcuts</h2>
        <div className="grid cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="card"
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                minHeight: 128,
                padding: 24,
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 12,
                  background: "var(--secondary)",
                  color: "var(--muted-foreground)",
                  flexShrink: 0,
                }}
                className="group-icon"
              >
                <s.Icon size={20} strokeWidth={1.8} />
              </span>
              <span>
                <span style={{ display: "block", fontSize: 18, fontWeight: 500, color: "var(--heading-color)", letterSpacing: "-0.01em" }}>{s.label}</span>
                <span style={{ display: "block", marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: "1.5" }}>{s.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
