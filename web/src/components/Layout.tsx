import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearSession, getRole } from "../services/api";
import { deskLabel, navPathsForRole } from "../utils/roleAccess";

const sections: { title: string; items: { to: string; label: string; icon: string; adminOnly?: boolean; rolesAdminOnly?: boolean; supervisorOnly?: boolean }[] }[] = [
  {
    title: "Home",
    items: [
      { to: "/", label: "Dashboard", icon: "⌂" },
      { to: "/analytics", label: "Analytics", icon: "▦" },
      { to: "/notifications", label: "Notifications", icon: "◔" },
    ],
  },
  {
    title: "Inward",
    items: [
      { to: "/grn", label: "Receive", icon: "⇩" },
      { to: "/receiving", label: "Receive Wizard (RF)", icon: "📥" },
      { to: "/exceptions", label: "Exceptions", icon: "⚠" },
      { to: "/follow-up", label: "Follow-Up Receipts", icon: "↻" },
      { to: "/grn-audit", label: "Random Audit", icon: "✚" },
      { to: "/putaway", label: "Putaway", icon: "⇨" },
      { to: "/putaway/logs", label: "Putaway Logs", icon: "☰" },
    ],
  },
  {
    title: "Stock",
    items: [
      { to: "/pick", label: "Picking", icon: "☑" },
      { to: "/pack", label: "Packing", icon: "▣" },
      { to: "/dispatch", label: "Dispatch", icon: "➤" },
      { to: "/cycle-count", label: "Cycle Count", icon: "↻" },
      { to: "/stock-scan", label: "Stock Scan", icon: "⌖" },
      { to: "/inventory-health", label: "Inventory Health", icon: "♥" },
      { to: "/transfers", label: "Transfers", icon: "⇄" },
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
      { to: "/sales-orders", label: "Sales Order", icon: "◎" },
      { to: "/delivery-notes", label: "Delivery Note", icon: "✉" },
      { to: "/backorders", label: "Backorders", icon: "↻" },
      { to: "/returns", label: "Returns", icon: "↩" },
      { to: "/customers", label: "Customer", icon: "◉" },
    ],
  },
  {
    title: "Masters",
    items: [
      { to: "/items", label: "Item", icon: "◱" },
      { to: "/warehouses", label: "Warehouse", icon: "▦" },
      { to: "/locations", label: "Locations", icon: "▤" },
      { to: "/transports", label: "Transport", icon: "⛟" },
      { to: "/employees", label: "Employees", icon: "☺", adminOnly: true },
      { to: "/roles", label: "Roles", icon: "⚿", rolesAdminOnly: true },
      { to: "/workflow", label: "Workflow", icon: "↯" },
      { to: "/reports", label: "Reports", icon: "▤" },
      { to: "/audit-logs", label: "Transaction Logs", icon: "☰" },
    ],
  },
];

function canSeeAdminNav(role: string | null) {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "wm" || r === "supervisor";
}

function canSeeRolesNav(role: string | null) {
  return (role || "").toLowerCase() === "admin";
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();
  const initial = (role || "U").slice(0, 1).toUpperCase();
  const showAdmin = canSeeAdminNav(role);
  const showRoles = canSeeRolesNav(role);
  const floorPaths = navPathsForRole(role);
  const brandSub = deskLabel(role);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("gowms_nav") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  const toggleMenu = () => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      setMobileOpen((v) => !v);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("gowms_nav", next ? "collapsed" : "expanded");
  };

  useEffect(() => {
    if (location.pathname && location.pathname !== "/login") {
      localStorage.setItem("gowms_last_path", location.pathname);
    }
    setMobileOpen(false);
    setNavOpen(false);
    setNavQuery("");
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        setNavOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const itemVisible = (item: (typeof sections)[number]["items"][number]) => {
    if (item.rolesAdminOnly) return showRoles;
    if (item.adminOnly || item.supervisorOnly) return showAdmin;
    if (floorPaths) return floorPaths.includes(item.to);
    return true;
  };

  const visibleItems = useMemo(() => {
    return sections.flatMap((section) =>
      section.items
        .filter(itemVisible)
        .map((item) => ({ ...item, section: section.title })),
    );
  }, [showAdmin, showRoles, floorPaths]);

  const searchHits = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return visibleItems.slice(0, 8);
    return visibleItems.filter((item) =>
      `${item.label} ${item.section} ${item.to}`.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [navQuery, visibleItems]);

  return (
    <div className="shell">
      {mobileOpen && <div className="nav-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">gW</span>
          <div className="brand-text">
            <strong>goWMS</strong>
            <small>{brandSub}</small>
          </div>
        </div>
        <nav className="nav">
          {sections.map((section) => {
            const items = section.items.filter(itemVisible);
            if (items.length === 0) return null;
            return (
            <div key={section.title}>
              <div className="nav-section">{section.title}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to !== "/grn"}
                  title={item.label}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-link-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="hamburger" aria-label="Toggle menu" onClick={toggleMenu}>
            ☰
          </button>
          {floorPaths ? null : (
          <div className="awesomebar">
            <span>⌕</span>
            <input
              ref={searchRef}
              value={navQuery}
              onChange={(e) => { setNavQuery(e.target.value); setNavOpen(true); }}
              onFocus={() => setNavOpen(true)}
              onBlur={() => setTimeout(() => setNavOpen(false), 150)}
              placeholder="Search pages…"
              aria-label="Search"
            />
            <kbd>⌘K</kbd>
            {navOpen && (
              <div className="awesomebar-results">
                {searchHits.map((item) => (
                  <button
                    key={item.to}
                    type="button"
                    onMouseDown={() => navigate(item.to)}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 11 }}>{item.section}</span>
                  </button>
                ))}
                {searchHits.length === 0 && (
                  <button type="button" disabled>No matching pages</button>
                )}
              </div>
            )}
          </div>
          )}
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
