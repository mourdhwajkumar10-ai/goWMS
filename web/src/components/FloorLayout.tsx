import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getRole } from "../services/api";
import { floorLabel, floorPathsForDevice } from "../utils/roleAccess";
import { hasPermission } from "../utils/permissions";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";

/** Task-only pages shown on handheld devices. Everything else is hidden. */
const floorPages: { to: string; label: string; icon: string }[] = [
  { to: "/receiving", label: "RF Receiver", icon: "📥" },
  { to: "/dock-receiving", label: "Dock Receiving", icon: "🏗" },
  { to: "/item-verifier", label: "Item Verifier", icon: "✓" },
  { to: "/putaway", label: "Putaway", icon: "⇨" },
  { to: "/putaway-runner", label: "Putaway Runner", icon: "🏃" },
  { to: "/pick", label: "Picking", icon: "☑" },
  { to: "/pack", label: "Packing", icon: "▣" },
  { to: "/dispatch", label: "Dispatch", icon: "➤" },
  { to: "/cycle-count", label: "Cycle Count", icon: "↻" },
  { to: "/quick-count", label: "Quick Count", icon: "⌘" },
  { to: "/stock-scan", label: "Stock Scan", icon: "⌖" },
  { to: "/stock-peek", label: "Stock Peek", icon: "👁" },
  { to: "/qi", label: "QI", icon: "✚" },
  { to: "/exceptions", label: "Exceptions", icon: "⚠" },
  { to: "/notifications", label: "Notifications", icon: "🔔" },
];

export default function FloorLayout() {
  const location = useLocation();
  const role = getRole();
  const label = floorLabel(role);
  const allowed = floorPathsForDevice(role);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const pages = floorPages.filter((p) => allowed.includes(p.to));
  const currentPage = pages.find((p) => location.pathname === p.to || location.pathname.startsWith(p.to + "/"));

  return (
    <div className="floor-shell">
      {/* Drawer backdrop */}
      {drawerOpen && (
        <div className="floor-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Slide-out drawer */}
      <aside className={`floor-drawer ${drawerOpen ? "open" : ""}`}>
        <div className="floor-drawer-head">
          <span className="brand-mark">gW</span>
          <div className="brand-text">
            <strong>goWMS</strong>
            <small>{label}</small>
          </div>
        </div>
        <nav className="floor-nav">
          {pages.map((p) => (
            <NavLink
              key={p.to}
              to={p.to}
              end={p.to !== "/grn"}
              className={({ isActive }) =>
                `floor-nav-link ${isActive ? "active" : ""}`
              }
            >
              <span className="floor-nav-icon">{p.icon}</span>
              <span>{p.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="floor-main">
        {/* Top bar */}
        <header className="floor-topbar">
          <button
            type="button"
            className="floor-hamburger"
            aria-label="Menu"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            ☰
          </button>
          <span className="floor-page-title">
            {currentPage?.label ?? "goWMS"}
          </span>
          <div className="floor-topbar-right">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        {/* Content */}
        <main className="floor-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}