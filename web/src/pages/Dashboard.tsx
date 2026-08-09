import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  { to: "/grn", label: "Receive (GRN)", desc: "Goods receipt against PO" },
  { to: "/po", label: "Purchase Order", desc: "Create / submit buying docs" },
  { to: "/pick", label: "Pick List", desc: "Pick against sales orders" },
  { to: "/pack", label: "Packing", desc: "Pack picked items" },
  { to: "/dispatch", label: "Dispatch", desc: "Load and ship trips" },
  { to: "/items", label: "Item", desc: "Item master" },
];

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
    <div className="space-y-6">
      <div className="page-head">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="page-sub">Warehouse operations overview</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div>
        <div className="nav-section" style={{ marginTop: 0, paddingLeft: 0 }}>Number Cards</div>
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
        <div className="nav-section" style={{ marginTop: 0, paddingLeft: 0 }}>Shortcuts</div>
        <div className="grid cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="card"
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div style={{ fontWeight: 500, color: "var(--heading-color)", marginBottom: 2 }}>
                {s.label}
              </div>
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                {s.desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
