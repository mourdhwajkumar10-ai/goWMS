import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  Box,
  CheckSquare,
  Eye,
  HeartPulse,
  Menu,
  PackageOpen,
  RefreshCw,
  ScanLine,
  Search,
  Square,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { getRole } from "../services/api";
import { floorLabel } from "../utils/roleAccess";
import { listFloorTiles } from "../utils/navCatalog";
import { getPermissions } from "../utils/permissions";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";

const FLOOR_ICONS: Record<string, LucideIcon> = {
  "/receiving": PackageOpen,
  "/dock-receiving": Box,
  "/item-verifier": CheckSquare,
  "/box-verification": ScanLine,
  "/putaway": ArrowDownToLine,
  "/putaway-runner": Truck,
  "/pick": CheckSquare,
  "/pack": Square,
  "/dispatch": Truck,
  "/cycle-count": RefreshCw,
  "/quick-count": Search,
  "/stock-scan": ScanLine,
  "/stock-peek": Eye,
  "/qi": HeartPulse,
  "/exceptions": AlertTriangle,
  "/notifications": Bell,
};

export default function FloorLayout() {
  const location = useLocation();
  const role = getRole();
  const label = floorLabel(role);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const pages = listFloorTiles(role, getPermissions());
  const currentPage = pages.find(
    (p) => location.pathname === p.to || location.pathname.startsWith(p.to + "/")
  );
  const homeTitle = location.pathname === "/floor" || location.pathname === "/"
    ? "Floor tasks"
    : null;

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
          {pages.map((p) => {
            const Icon = FLOOR_ICONS[p.to];
            return (
              <NavLink
                key={p.to}
                to={p.to}
                end={p.to !== "/grn"}
                className={({ isActive }) =>
                  `floor-nav-link ${isActive ? "active" : ""}`
                }
              >
                {Icon ? (
                  <Icon size={16} strokeWidth={1.8} className="floor-nav-icon" />
                ) : null}
                <span>{p.label}</span>
              </NavLink>
            );
          })}
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
            <Menu size={18} strokeWidth={1.8} />
          </button>
          <span className="floor-page-title">
            {homeTitle ?? currentPage?.label ?? "goWMS"}
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
