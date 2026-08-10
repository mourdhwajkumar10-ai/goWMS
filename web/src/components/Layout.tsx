import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getRole } from "../services/api";

const sections: { title: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    title: "Home",
    items: [
      { to: "/", label: "Dashboard", icon: "⌂" },
      { to: "/analytics", label: "Analytics", icon: "▦" },
      { to: "/notifications", label: "Notifications", icon: "◔" },
    ],
  },
  {
    title: "Stock",
    items: [
      { to: "/grn", label: "GRN / Inbound", icon: "⇩" },
      { to: "/putaway", label: "Putaway", icon: "⇨" },
      { to: "/pick", label: "Picking", icon: "☑" },
      { to: "/pack", label: "Packing", icon: "▣" },
      { to: "/dispatch", label: "Dispatch", icon: "➤" },
      { to: "/cycle-count", label: "Cycle Count", icon: "↻" },
      { to: "/stock-entries", label: "Stock Entry", icon: "≡" },
      { to: "/stock-reconciliations", label: "Stock Reconciliation", icon: "≋" },
      { to: "/serial", label: "Serial No", icon: "№" },
      { to: "/batches", label: "Batch", icon: "⌫" },
      { to: "/qi", label: "Quality Inspection", icon: "✚" },
    ],
  },
  {
    title: "Buying",
    items: [
      { to: "/po", label: "Purchase Order", icon: "◫" },
      { to: "/purchase-invoices", label: "Purchase Invoice", icon: "¥" },
      { to: "/suppliers", label: "Supplier", icon: "◐" },
    ],
  },
  {
    title: "Selling",
    items: [
      { to: "/delivery-notes", label: "Delivery Note", icon: "✉" },
      { to: "/customers", label: "Customer", icon: "◉" },
    ],
  },
  {
    title: "Masters",
    items: [
      { to: "/items", label: "Item", icon: "◱" },
      { to: "/warehouses", label: "Warehouse", icon: "▦" },
      { to: "/locations", label: "Locations", icon: "▤" },
      { to: "/workflow", label: "Workflow", icon: "↯" },
      { to: "/reports", label: "Reports", icon: "▤" },
    ],
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const role = getRole();
  const initial = (role || "U").slice(0, 1).toUpperCase();

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">gW</span>
          <div>
            <strong>goWMS</strong>
            <small>Warehouse Desk</small>
          </div>
        </div>
        <nav className="nav">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="nav-section">{section.title}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="awesomebar" title="Search (coming soon)">
            <span>⌕</span>
            <span>Search or type a command</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="topbar-right">
            <span className="role-badge">{role ?? "user"}</span>
            <span className="avatar-chip" title={role ?? "user"}>{initial}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
